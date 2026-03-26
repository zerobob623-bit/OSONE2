// pages/api/whatsapp/incoming.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const EVOLUTION_URL = 'https://evolution-api-production-9133.up.railway.app';
const EVOLUTION_KEY = '5DC26A82784E-4BDB-A4CD-33C86CB2455D';
const EVOLUTION_INSTANCE = 'OSONE2';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Gera resposta de texto via Gemini
async function generateReply(userMessage: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: `Você é OSONE, uma IA empática e calorosa. Responda de forma natural e concisa, como em uma conversa de WhatsApp. Máximo 3 frases.` }]
        },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }]
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Não entendi, pode repetir?';
}

// Converte texto em áudio base64 via Google TTS
async function textToSpeech(text: string): Promise<string> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'pt-BR', name: 'pt-BR-Wavenet-A' },
        audioConfig: { audioEncoding: 'OGG_OPUS' }
      })
    }
  );
  const data = await res.json();
  return data.audioContent; // base64
}

// Envia áudio no WhatsApp
async function sendAudio(phone: string, audioBase64: string) {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;

    // Filtra apenas mensagens de texto recebidas
    const msg = body?.data;
    const isFromMe = msg?.key?.fromMe;
    const text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text;
    const phone = msg?.key?.remoteJid?.replace('@s.whatsapp.net', '');

    // Ignora mensagens enviadas pela própria OSONE e mensagens sem texto
    if (isFromMe || !text || !phone) {
      return res.status(200).json({ ok: true });
    }

    console.log(`📩 Mensagem de ${phone}: ${text}`);

    // Gera resposta
    const reply = await generateReply(text);
    console.log(`🤖 Resposta: ${reply}`);

    // Converte em áudio
    const audioBase64 = await textToSpeech(reply);

    // Envia áudio no WhatsApp
    await sendAudio(phone, audioBase64);

    console.log(`✅ Áudio enviado para ${phone}`);
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
```

---

## Passo 3 — Ativar o Google TTS

O Google TTS precisa estar ativado na mesma chave do Gemini. Acesse:
```
console.cloud.google.com → APIs → Cloud Text-to-Speech API → Ativar
```

---

## Passo 4 — Configurar o Webhook na Evolution API

Após fazer o deploy na Vercel, acesse o painel da Evolution API:
```
https://evolution-api-production-9133.up.railway.app/manager
```

Clique na instância **OSONE2** → **Webhook** e configure:
```
URL: https://SEU-PROJETO.vercel.app/api/whatsapp/incoming
Eventos: MESSAGES_UPSERT ✅
