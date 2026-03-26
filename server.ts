import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import { convert } from "html-to-text";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ─── WEB SEARCH ───────────────────────────────────────────────────────────────
app.post("/api/web-search", async (req, res) => {
  const { query, num_results = 5, url, action } = req.body;

  if (action === 'read' && url) {
    try {
      const response = await axios.get(`https://r.jina.ai/${url}`, {
        headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
        timeout: 15000
      });
      const text = String(response.data);
      return res.json({
        content: text.length > 5000 ? text.substring(0, 5000) + '\n\n[Conteúdo truncado]' : text
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Não foi possível ler a URL.' });
    }
  }

  if (query) {
    try {
      const response = await axios.get(`https://s.jina.ai/${encodeURIComponent(query)}`, {
        headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
        timeout: 15000
      });
      const text = String(response.data);
      if (text && text.trim().length > 100) {
        const blocks = text.split(/\n---+\n/).slice(0, num_results);
        const raw = blocks.join('\n---\n').substring(0, 6000);
        return res.json({ raw, source: 'jina' });
      }
      throw new Error('Jina retornou resposta vazia');
    } catch {
      try {
        const response = await axios.get(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`,
          { timeout: 10000 }
        );
        const data = response.data;
        const results: any[] = [];
        if (data.Answer) results.push({ title: 'Resposta direta', url: '', description: data.Answer });
        if (data.AbstractText) results.push({ title: data.Heading || query, url: data.AbstractURL || '', description: data.AbstractText });
        const topics = (data.RelatedTopics || [])
          .flatMap((t: any) => t.Topics ? t.Topics : [t])
          .filter((t: any) => t.Text)
          .slice(0, num_results)
          .map((t: any) => ({ title: t.Text.substring(0, 80), url: t.FirstURL || '', description: t.Text }));
        results.push(...topics);
        if (results.length === 0) return res.json({ raw: `Não foram encontrados resultados para "${query}".`, source: 'duckduckgo' });
        const formatted = results.slice(0, num_results).map((r, i) => `[${i + 1}] ${r.title}\n${r.description}${r.url ? `\nURL: ${r.url}` : ''}`).join('\n\n');
        return res.json({ raw: `Resultados para "${query}":\n\n${formatted}`, source: 'duckduckgo' });
      } catch (error: any) {
        return res.status(500).json({ error: 'Não foi possível realizar a busca.' });
      }
    }
  }

  return res.status(400).json({ error: 'Parâmetros inválidos.' });
});

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
const EVOLUTION_URL = 'https://evolution-api-production-9133.up.railway.app';
const EVOLUTION_KEY = '5DC26A82784E-4BDB-A4CD-33C86CB2455D';
const EVOLUTION_INSTANCE = 'OSONE2';

app.post("/api/whatsapp/send", async (req, res) => {
  const { message, phone } = req.body;
  const target = phone || process.env.WHATSAPP_MY_NUMBER;
  if (!message) return res.status(400).json({ error: "message é obrigatório" });
  if (!target) return res.status(400).json({ error: "Número de destino não configurado." });
  try {
    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      { number: `${target}@s.whatsapp.net`, text: message },
      { headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY }, timeout: 10000 }
    );
    res.json({ success: true, to: target });
  } catch (error: any) {
    res.status(500).json({ error: 'Falha ao enviar mensagem pelo WhatsApp.' });
  }
});

// ─── WHATSAPP INCOMING (webhook da Evolution API) ─────────────────────────────
app.post("/api/whatsapp/incoming", async (req, res) => {
  res.status(200).json({ ok: true });
  try {
    const msg = req.body?.data;
    if (msg?.key?.fromMe) return;
    if (msg?.key?.remoteJid?.includes('@g.us')) return;
    const rawText = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || null;
    const phone = msg?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!rawText || !phone) return;
    const ACTIVATION_WORD = '/osone';
    if (!rawText.trim().toLowerCase().startsWith(ACTIVATION_WORD)) return;
    const cleanMessage = rawText.trim().slice(ACTIVATION_WORD.length).trim();
    if (!cleanMessage) {
      await axios.post(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        { number: `${phone}@s.whatsapp.net`, text: 'Oi! Me diz o que você precisa depois do /osone 😊' },
        { headers: { 'apikey': EVOLUTION_KEY } });
      return;
    }
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return;
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        system_instruction: { parts: [{ text: 'Você é OSONE, uma IA empática e calorosa. Responda de forma natural e concisa. Máximo 2 frases.' }] },
        contents: [{ role: 'user', parts: [{ text: cleanMessage }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.9 }
      }
    );
    const reply = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Não entendi, pode repetir?';
    try {
      const ttsRes = await axios.post(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GEMINI_KEY}`,
        { input: { text: reply }, voice: { languageCode: 'pt-BR', name: 'pt-BR-Wavenet-A' }, audioConfig: { audioEncoding: 'OGG_OPUS' } }
      );
      const audioBase64 = ttsRes.data.audioContent;
      await axios.post(`${EVOLUTION_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`,
        { number: `${phone}@s.whatsapp.net`, mediatype: 'audio', mimetype: 'audio/ogg; codecs=opus', media: audioBase64, fileName: 'osone.ogg' },
        { headers: { 'apikey': EVOLUTION_KEY } });
    } catch {
      await axios.post(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        { number: `${phone}@s.whatsapp.net`, text: reply },
        { headers: { 'apikey': EVOLUTION_KEY } });
    }
  } catch (error: any) {
    console.error('Webhook error:', error.message);
  }
});

// ─── ALEXA / CASA INTELIGENTE ─────────────────────────────────────────────────
app.post("/api/alexa/control", async (req, res) => {
  const { command, device, value } = req.body;
  if (!command) return res.status(400).json({ error: 'Comando necessário' });

  const ALEXA_COOKIE = process.env.ALEXA_COOKIE;
  if (!ALEXA_COOKIE) return res.status(500).json({ error: 'ALEXA_COOKIE não configurado no servidor' });

  try {
    // Busca lista de dispositivos
    const devicesRes = await axios.get(
      'https://alexa.amazon.com.br/api/devices-v2/device?cached=false',
      { headers: { 'Cookie': ALEXA_COOKIE, 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }
    );

    const devices: any[] = devicesRes.data?.devices || [];
    if (devices.length === 0) return res.status(404).json({ error: 'Nenhum dispositivo encontrado. Verifique o cookie da Alexa.' });

    // Encontra o dispositivo pelo nome
    const targetName = (device || 'echo').toLowerCase();
    const found = devices.find((d: any) =>
      d.accountName?.toLowerCase().includes(targetName) ||
      d.description?.toLowerCase().includes(targetName)
    ) || devices[0]; // usa o primeiro se não achar pelo nome

    // Monta o payload do comando
    let actionPayload: any = {};
    const cmd = command.toLowerCase();

    if (cmd.includes('ligar') || cmd.includes('on') || cmd.includes('acend')) {
      actionPayload = { type: 'turnOn' };
    } else if (cmd.includes('deslig') || cmd.includes('off') || cmd.includes('apag')) {
      actionPayload = { type: 'turnOff' };
    } else if (cmd.includes('volume')) {
      actionPayload = { type: 'VolumeLevelCommand', volumeLevel: value || 50 };
    } else if (cmd.includes('brilho') || cmd.includes('dimm')) {
      actionPayload = { type: 'setBrightness', brightness: value || 50 };
    } else if (cmd.includes('pausar') || cmd.includes('parar') || cmd.includes('stop')) {
      actionPayload = { type: 'PauseCommand' };
    } else if (cmd.includes('tocar') || cmd.includes('music') || cmd.includes('play') || cmd.includes('spotify')) {
      actionPayload = { type: 'PlayCommand' };
    } else {
      // Comando de voz livre — envia direto para a Alexa
      actionPayload = { type: 'AlexaClientCompatibleCommand', command };
    }

    // Envia o comando
    await axios.post(
      `https://alexa.amazon.com.br/api/np/command?deviceSerialNumber=${found.serialNumber}&deviceType=${found.deviceType}`,
      { action: JSON.stringify(actionPayload) },
      { headers: { 'Cookie': ALEXA_COOKIE, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }
    );

    console.log(`[Alexa] ${command} → ${found.accountName}`);
    res.json({ success: true, message: `"${command}" executado em "${found.accountName}"!`, device: found.accountName });

  } catch (error: any) {
    console.error('[Alexa] Erro:', error.response?.data || error.message);
    const msg = error.response?.status === 401
      ? 'Cookie da Alexa expirado. Atualize o ALEXA_COOKIE no Vercel.'
      : error.message;
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── VITE MIDDLEWARE ──────────────────────────────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
