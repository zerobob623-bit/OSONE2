import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
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

// ============================================================
// 🏠 TUYA SMART HOME API
// ============================================================

const TUYA_REGION_URLS: Record<string, string> = {
  cn: 'https://openapi.tuyacn.com',
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  in: 'https://openapi.tuyain.com',
};

let tuyaTokenCache: { token: string; expires: number; clientId: string } | null = null;

function tuyaSign(clientId: string, secret: string, method: string, urlPath: string, body: string, accessToken: string, t: number): string {
  const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');
  const stringToSign = [method.toUpperCase(), bodyHash, '', urlPath].join('\n');
  const str = clientId + accessToken + t.toString() + stringToSign;
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

async function tuyaGetToken(clientId: string, secret: string, baseUrl: string): Promise<string> {
  if (tuyaTokenCache && tuyaTokenCache.clientId === clientId && Date.now() < tuyaTokenCache.expires) {
    return tuyaTokenCache.token;
  }
  const urlPath = '/v1.0/token?grant_type=1';
  const t = Date.now();
  const sign = tuyaSign(clientId, secret, 'GET', urlPath, '', '', t);
  const res = await axios.get(`${baseUrl}${urlPath}`, {
    headers: { client_id: clientId, sign, t: t.toString(), sign_method: 'HMAC-SHA256' }
  });
  if (!res.data.success) throw new Error(`Tuya auth: ${res.data.msg}`);
  const token = res.data.result.access_token;
  const expireMs = (res.data.result.expire_time || 7200) * 1000;
  tuyaTokenCache = { token, expires: Date.now() + expireMs - 60000, clientId };
  return token;
}

async function tuyaRequest(method: string, urlPath: string, body: any, clientId: string, secret: string, baseUrl: string) {
  const token = await tuyaGetToken(clientId, secret, baseUrl);
  const t = Date.now();
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = tuyaSign(clientId, secret, method, urlPath, bodyStr, token, t);
  const res = await axios({
    method,
    url: `${baseUrl}${urlPath}`,
    headers: {
      client_id: clientId,
      access_token: token,
      sign,
      t: t.toString(),
      sign_method: 'HMAC-SHA256',
      'Content-Type': 'application/json',
    },
    data: body || undefined,
    timeout: 10000,
  });
  return res.data;
}

app.get('/api/tuya/devices', async (req, res) => {
  const clientId = (req.query.clientId as string) || process.env.TUYA_CLIENT_ID;
  const secret = (req.query.secret as string) || process.env.TUYA_SECRET;
  const region = (req.query.region as string) || process.env.TUYA_REGION || 'us';
  const baseUrl = TUYA_REGION_URLS[region] || TUYA_REGION_URLS.us;

  if (!clientId || !secret) return res.status(400).json({ error: 'Configure Client ID e Secret nas Integrações.' });

  try {
    tuyaTokenCache = null;
    const data = await tuyaRequest('GET', '/v1.0/iot-03/devices?page_size=50&page_no=1', null, clientId, secret, baseUrl);
    const devices = (data.result?.list || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      online: d.online,
    }));
    res.json({ success: true, devices });
  } catch (err: any) {
    console.error('[Tuya] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tuya/control', async (req, res) => {
  const { device_name, action, value, clientId: bClientId, secret: bSecret, region: bRegion } = req.body;
  const clientId = bClientId || process.env.TUYA_CLIENT_ID;
  const secret = bSecret || process.env.TUYA_SECRET;
  const region = bRegion || process.env.TUYA_REGION || 'us';
  const baseUrl = TUYA_REGION_URLS[region] || TUYA_REGION_URLS.us;

  if (!clientId || !secret) return res.status(400).json({ error: 'Configure as credenciais Tuya nas Integrações.' });

  try {
    const devData = await tuyaRequest('GET', '/v1.0/iot-03/devices?page_size=50&page_no=1', null, clientId, secret, baseUrl);
    const devices: any[] = devData.result?.list || [];

    if (action === 'list') {
      const names = devices.map((d: any) => `${d.name}${d.online ? '' : ' (offline)'}`).join(', ');
      return res.json({ success: true, devices: names || 'Nenhum dispositivo encontrado.' });
    }

    const nameLower = (device_name || '').toLowerCase().trim();
    const device = devices.find((d: any) => {
      const dn = d.name.toLowerCase();
      return dn.includes(nameLower) || nameLower.includes(dn);
    });

    if (!device) {
      const available = devices.map((d: any) => d.name).join(', ');
      return res.json({ success: false, error: `"${device_name}" não encontrado. Disponíveis: ${available || 'nenhum'}` });
    }

    if (!device.online) {
      return res.json({ success: false, error: `"${device.name}" está offline.` });
    }

    const isSwitch = ['cz', 'pc', 'kg', 'tdq'].includes(device.category || '');
    let commands: any[] = [];

    if (action === 'on') {
      commands = isSwitch ? [{ code: 'switch_1', value: true }] : [{ code: 'switch_led', value: true }];
    } else if (action === 'off') {
      commands = isSwitch ? [{ code: 'switch_1', value: false }] : [{ code: 'switch_led', value: false }];
    } else if (action === 'brightness' && value != null) {
      const bright = Math.max(10, Math.min(1000, Math.round((value / 100) * 1000)));
      commands = [{ code: 'bright_value_v2', value: bright }];
    } else if (action === 'color_temp' && value != null) {
      commands = [{ code: 'temp_value_v2', value: Math.max(0, Math.min(1000, Math.round(value))) }];
    } else {
      return res.status(400).json({ error: `Ação "${action}" inválida.` });
    }

    const result = await tuyaRequest('POST', `/v1.0/iot-03/devices/${device.id}/commands`, { commands }, clientId, secret, baseUrl);
    console.log(`[Tuya] ${action} ${device.name}:`, result.success);
    res.json({ success: result.success, device: device.name, action });
  } catch (err: any) {
    console.error('[Tuya] control error:', err.message);
    res.status(500).json({ error: err.message });
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_KEY}`,
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
    const devicesRes = await axios.get(
      'https://alexa.amazon.com.br/api/devices-v2/device?cached=false',
      { headers: { 'Cookie': ALEXA_COOKIE, 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }
    );
    const devices: any[] = devicesRes.data?.devices || [];
    if (devices.length === 0) return res.status(404).json({ error: 'Nenhum dispositivo encontrado. Verifique o cookie da Alexa.' });

    const targetName = (device || 'echo').toLowerCase();
    const found = devices.find((d: any) =>
      d.accountName?.toLowerCase().includes(targetName) ||
      d.description?.toLowerCase().includes(targetName)
    ) || devices[0];

    let actionPayload: any = {};
    const cmd = command.toLowerCase();
    if (cmd.includes('ligar') || cmd.includes('on') || cmd.includes('acend')) actionPayload = { type: 'turnOn' };
    else if (cmd.includes('deslig') || cmd.includes('off') || cmd.includes('apag')) actionPayload = { type: 'turnOff' };
    else if (cmd.includes('volume')) actionPayload = { type: 'VolumeLevelCommand', volumeLevel: value || 50 };
    else if (cmd.includes('brilho') || cmd.includes('dimm')) actionPayload = { type: 'setBrightness', brightness: value || 50 };
    else if (cmd.includes('pausar') || cmd.includes('parar') || cmd.includes('stop')) actionPayload = { type: 'PauseCommand' };
    else if (cmd.includes('tocar') || cmd.includes('music') || cmd.includes('play') || cmd.includes('spotify')) actionPayload = { type: 'PlayCommand' };
    else actionPayload = { type: 'AlexaClientCompatibleCommand', command };

    await axios.post(
      `https://alexa.amazon.com.br/api/np/command?deviceSerialNumber=${found.serialNumber}&deviceType=${found.deviceType}`,
      { action: JSON.stringify(actionPayload) },
      { headers: { 'Cookie': ALEXA_COOKIE, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }
    );
    res.json({ success: true, message: `"${command}" executado em "${found.accountName}"!`, device: found.accountName });
  } catch (error: any) {
    const msg = error.response?.status === 401
      ? 'Cookie da Alexa expirado. Atualize o ALEXA_COOKIE no Vercel.'
      : error.message;
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── TEXT CHAT — OpenAI gpt-4.1-mini ─────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages, systemInstruction } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Parâmetro messages inválido." });
  }
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY não configurada nas variáveis de ambiente." });
  }
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4.1-mini',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          ...messages,
        ],
        max_tokens: 1024,
        temperature: 0.75,
      },
      { headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const text = response.data.choices?.[0]?.message?.content || '';
    res.json({ text });
  } catch (error: any) {
    console.error('[chat] Erro OpenAI:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
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
