// pages/api/whatsapp/incoming.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const EVOLUTION_URL = 'https://evolution-api-production-9133.up.railway.app';
const EVOLUTION_KEY = '5DC26A82784E-4BDB-A4CD-33C86CB2455D';
const EVOLUTION_INSTANCE = 'OSONE2';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// ─── PALAVRA DE ATIVAÇÃO ──────────────────────────────────────────────────────
// A mensagem precisa começar com isso para a OSONE responder
const ACTIVATION_WORD = '/osone';

// ─── GERA RESPOSTA DE TEXTO VIA GEMINI ───────────────────────────────────────
async function generateReply(userMessage: string, phone: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: `Você é OSONE, uma inteligência artificial empática, jovem e calorosa.
Você está respondendo mensagens de WhatsApp.
Seja natural, direta e concisa — máximo 2 frases curtas.
Não use markdown. Fale como uma pessoa real no WhatsApp.
O número de quem está falando com você é: ${phone}`
          }]
        },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.9 }
      })
    }
  );

  if (!res.ok) throw new Error('Gemini API failed');
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Não entendi, pode repetir?';
}

// ─── CONVERTE TEXTO EM ÁUDIO VIA GOOGLE TTS ──────────────────────────────────
async function textToSpeech(text: string): Promise<string> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'pt-BR',
          name: 'pt-BR-Wavenet-A',
          ssmlGender: 'FEMALE'
        },
        audioConfig: {
          audioEncoding: 'OGG_OPUS',
          speakingRate: 1.05,
          pitch: 1.0
        }
      })
    }
  );

  if (!res.ok) throw new Error('TTS API failed');
  const data = await res.json();
  if (!data.audioContent) throw new Error('No audio content');
  return data.audioContent;
}

// ─── ENVIA ÁUDIO NO WHATSAPP ─────────────────────────────────────────────────
async function sendAudio(phone: string, audioBase64: string): Promise<void> {
  await fetch(`${EVOLUTION_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_KEY
    },
    body: JSON.stringify({
      number: `${phone}@s.whatsapp.net`,
      mediatype: 'audio',
      mimetype: 'audio/ogg; codecs=opus',
      media: audioBase64,
      fileName: 'osone.ogg'
    })
  });
}

// ─── ENVIA TEXTO (fallback) ───────────────────────────────────────────────────
async function sendText(phone: string, message: string): Promise<void> {
  await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_KEY
    },
    body: JSON.stringify({
      number: `${phone}@s.whatsapp.net`,
      text: message
    })
  });
}

// ─── WEBHOOK HANDLER ─────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Responde imediatamente para o Evolution API não reenviar
  res.status(200).json({ ok: true });

  if (req.method !== 'POST') return;

  try {
    const body = req.body;
    const msg = body?.data;

    // Ignora mensagens enviadas pela própria OSONE
    if (msg?.key?.fromMe) return;

    // Ignora grupos
    const isGroup = msg?.key?.remoteJid?.includes('@g.us');
    if (isGroup) return;

    // Pega o texto da mensagem
    const rawText =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      null;

    const phone = msg?.key?.remoteJid?.replace('@s.whatsapp.net', '');

    if (!rawText || !phone) return;

    // ✅ FILTRO: só responde se começar com a palavra de ativação
    const lowerText = rawText.trim().toLowerCase();
    if (!lowerText.startsWith(ACTIVATION_WORD)) {
      console.log(`⏭️ Ignorado (sem ativação): ${phone} → "${rawText}"`);
      return;
    }

    // Remove a palavra de ativação antes de enviar ao Gemini
    const cleanMessage = rawText.trim().slice(ACTIVATION_WORD.length).trim();

    // Se mandou só "/osone" sem mensagem
    if (!cleanMessage) {
      await sendText(phone, 'Oi! Me diz o que você precisa depois do /osone 😊');
      return;
    }

    console.log(`📩 [WhatsApp] De: ${phone} | Mensagem: ${cleanMessage}`);

    // Gera resposta com Gemini
    const reply = await generateReply(cleanMessage, phone);
    console.log(`🤖 [OSONE] Resposta: ${reply}`);

    try {
      // Envia como áudio
      const audioBase64 = await textToSpeech(reply);
      await sendAudio(phone, audioBase64);
      console.log(`🎙️ Áudio enviado para ${phone}`);
    } catch (ttsError) {
      // Fallback: envia como texto se TTS falhar
      console.warn('TTS falhou, enviando como texto:', ttsError);
      await sendText(phone, reply);
      console.log(`💬 Texto enviado para ${phone} (fallback)`);
    }

  } catch (error) {
    console.error('❌ Webhook error:', error);
  }
}

export const config = {
  api: { bodyParser: true },
};
