import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";
import { convert } from "html-to-text";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import AlexaRemote from "alexa-remote2";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

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

// ─── WHATSAPP SEND AUDIO ──────────────────────────────────────────────────────
app.post("/api/whatsapp/send-audio", async (req, res) => {
  const { text, phone } = req.body;
  if (!text)  return res.status(400).json({ error: "text é obrigatório" });
  if (!phone) return res.status(400).json({ error: "phone é obrigatório" });

  try {
    // 1. Converte texto em áudio via Google Translate TTS (gratuito, sem chave)
    //    Máx ~200 chars por request; divide se necessário
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      const slice = remaining.substring(0, 200);
      const cutAt = slice.lastIndexOf(' ');
      const chunk = cutAt > 100 ? slice.substring(0, cutAt) : slice;
      chunks.push(chunk);
      remaining = remaining.substring(chunk.length).trim();
    }

    const audioParts: Buffer[] = [];
    for (const chunk of chunks) {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=pt-BR&client=tw-ob&ttsspeed=0.9`;
      const r = await axios.get(ttsUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000,
      });
      audioParts.push(Buffer.from(r.data));
    }

    const audioBuffer = Buffer.concat(audioParts);
    const audioBase64 = audioBuffer.toString('base64');

    // 2. Envia via Evolution API como mensagem de áudio
    await axios.post(
      `${EVOLUTION_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`,
      {
        number: `${phone}@s.whatsapp.net`,
        mediatype: 'audio',
        mimetype: 'audio/mpeg',
        media: audioBase64,
        fileName: 'osone_audio.mp3',
      },
      { headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY }, timeout: 20000 }
    );

    res.json({ success: true, to: phone, chars: text.length });
  } catch (error: any) {
    console.error('[whatsapp-audio]', error.message);
    res.status(500).json({ error: `Falha ao enviar áudio: ${error.message}` });
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

// ─── ALEXA (alexa-remote2 — login via proxy, sem cookie manual) ──────────────
const ALEXA_SESSION_FILE = path.join(os.homedir(), '.osone-alexa.json');
const ALEXA_PROXY_PORT = 3002;

let alexaInstance: any = null;
let alexaReady = false;
let alexaAuthPending = false;

function saveAlexaSession(instance: any) {
  try { fs.writeFileSync(ALEXA_SESSION_FILE, JSON.stringify(instance.cookieData)); } catch {}
}

function startAlexaInit(savedData?: any) {
  const instance = new AlexaRemote();
  alexaInstance = instance;
  alexaReady = false;
  alexaAuthPending = !savedData; // pending = user needs to login via proxy

  const opts: any = {
    alexaServiceHost: 'alexa.amazon.com.br',
    amazonPage: 'amazon.com.br',
    amazonPageProxyLanguage: 'pt_BR',
    cookieRefreshInterval: 7 * 24 * 60 * 60 * 1000,
    bluetooth: false,
    useWsMqtt: false,
  };

  if (savedData) {
    opts.formerRegistrationData = savedData;
  } else {
    opts.proxyOnly = true;
    opts.setupProxy = true;
    opts.proxyOwnIp = 'localhost';
    opts.proxyPort = ALEXA_PROXY_PORT;
  }

  instance.init(opts, (err: any) => {
    alexaAuthPending = false;
    if (err) {
      console.error('Alexa init error:', String(err));
      alexaReady = false;
      alexaInstance = null;
    } else {
      alexaReady = true;
      saveAlexaSession(instance);
    }
  });
}

// Restore session from file on startup
try {
  if (fs.existsSync(ALEXA_SESSION_FILE)) {
    const saved = JSON.parse(fs.readFileSync(ALEXA_SESSION_FILE, 'utf-8'));
    if (saved) startAlexaInit(saved);
  }
} catch {}

app.post('/api/alexa/start-auth', (_req, res) => {
  if (alexaReady) return res.json({ success: true, alreadyConnected: true });
  if (!alexaAuthPending) startAlexaInit(); // kick off proxy
  setTimeout(() => res.json({ success: true, authUrl: `http://localhost:${ALEXA_PROXY_PORT}`, waiting: true }), 800);
});

app.get('/api/alexa/auth-status', (_req, res) => {
  res.json({ ready: alexaReady, pending: alexaAuthPending });
});

app.delete('/api/alexa/disconnect', (_req, res) => {
  alexaReady = false;
  alexaAuthPending = false;
  alexaInstance = null;
  try { if (fs.existsSync(ALEXA_SESSION_FILE)) fs.unlinkSync(ALEXA_SESSION_FILE); } catch {}
  res.json({ success: true });
});

app.post('/api/alexa/devices', (_req, res) => {
  if (!alexaReady || !alexaInstance) return res.status(503).json({ error: 'Alexa não autenticada.' });
  try {
    alexaInstance.getDevices((err: any, data: any) => {
      if (err) return res.status(500).json({ success: false, error: String(err) });
      const devices = Object.values(data?.devices || {});
      res.json({ success: true, devices });
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/alexa/control', (req, res) => {
  const { command, device, value } = req.body;
  if (!command) return res.status(400).json({ error: 'Comando necessário' });
  if (!alexaReady || !alexaInstance) return res.status(503).json({ error: 'Alexa não autenticada. Configure nas Integrações.' });

  try {
    alexaInstance.getDevices((err: any, data: any) => {
      if (err) return res.status(500).json({ success: false, error: String(err) });
      const devices: any[] = Object.values(data?.devices || {});
      if (!devices.length) return res.status(404).json({ error: 'Nenhum dispositivo Alexa encontrado.' });

      const targetName = (device || '').toLowerCase();
      const found: any = (targetName
        ? devices.find((d: any) => d.accountName?.toLowerCase().includes(targetName))
        : null) || devices[0];

      const cmd = command.toLowerCase();
      let actionType = 'TextCommand';
      let actionPayload: any = { type: 'AlexaClientCompatibleCommand', command };

      if (cmd.includes('volume')) actionPayload = { type: 'VolumeLevelCommand', volumeLevel: value || 50 };
      else if (cmd.includes('pausar') || cmd.includes('parar') || cmd.includes('stop')) actionPayload = { type: 'PauseCommand' };
      else if (cmd.includes('tocar') || cmd.includes('play') || cmd.includes('continuar')) actionPayload = { type: 'PlayCommand' };
      else if (cmd.includes('próxima') || cmd.includes('proxima') || cmd.includes('next')) actionPayload = { type: 'NextCommand' };
      else if (cmd.includes('anterior') || cmd.includes('prev')) actionPayload = { type: 'PreviousCommand' };

      // Use alexa-remote2's executeCommand
      alexaInstance.executeCommand(found.serialNumber, found.deviceType, actionPayload, (cmdErr: any, response: any) => {
        if (cmdErr) return res.status(500).json({ success: false, error: String(cmdErr) });
        res.json({ success: true, message: `"${command}" executado em "${found.accountName}"`, device: found.accountName });
      });
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── TEXT CHAT — OpenAI gpt-4.1-mini ─────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages, systemInstruction } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Parâmetro messages inválido." });
  }
  const OPENAI_KEY = process.env.VITE_OPENAI_API_KEY;
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

// ============================================================
// 🖥️ CONTROLE DO PC (apenas local — bloqueado em deploy)
// Requer: xdotool, xclip, scrot (Linux)
// ============================================================

const execAsync = promisify(exec);

async function runCmd(cmd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const r = await execAsync(cmd, { timeout: 20_000, maxBuffer: 20 * 1024 * 1024 });
    return { stdout: r.stdout || '', stderr: r.stderr || '' };
  } catch (e: any) {
    return { stdout: e.stdout || '', stderr: e.stderr || e.message || String(e) };
  }
}

// Padrões de comandos bloqueados por segurança
const BLOCKED = [
  /rm\s+-rf\s*\//,
  /mkfs\b/,
  /\bdd\s+if=/,
  /:.*\(.*\{.*\|.*\}.*\)/,   // fork bomb
  /format\s+c:/i,
  /shutdown\s+(\/s|\/r|-h|-r)/i,
  /\bhalt\b/,
  /\bpoweroff\b/,
];

app.post('/api/pc/control', async (req, res) => {
  // ── Segurança: só aceita de localhost ─────────────────────────────────────
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
  const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost', '0.0.0.0'].some(a => ip.includes(a));
  if (!isLocal) return res.status(403).json({ error: 'PC control disponível apenas quando rodando localmente.' });

  const { action, command, app: appName, text, key, x, y, button = 1, content } = req.body;
  const plat = process.platform; // 'linux' | 'darwin' | 'win32'

  try {
    // ── SCREENSHOT ────────────────────────────────────────────────────────
    if (action === 'screenshot') {
      const tmp = path.join(os.tmpdir(), `osone_ss_${Date.now()}.png`);
      if (plat === 'linux') {
        await runCmd(
          `scrot "${tmp}" 2>/dev/null || ` +
          `gnome-screenshot -f "${tmp}" 2>/dev/null || ` +
          `import -window root "${tmp}" 2>/dev/null || ` +
          `ffmpeg -y -f x11grab -video_size $(xdpyinfo|awk '/dimensions/{print $2}') -i $DISPLAY -vframes 1 "${tmp}" 2>/dev/null`
        );
      } else if (plat === 'darwin') {
        await runCmd(`screencapture -x "${tmp}"`);
      } else {
        await runCmd(
          `powershell -Command "Add-Type -AssemblyName System.Drawing,System.Windows.Forms; ` +
          `$b=New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width,[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); ` +
          `$g=[System.Drawing.Graphics]::FromImage($b); ` +
          `$g.CopyFromScreen([System.Drawing.Point]::Empty,[System.Drawing.Point]::Empty,$b.Size); ` +
          `$b.Save('${tmp}'); $g.Dispose(); $b.Dispose()"`
        );
      }
      if (!fs.existsSync(tmp)) {
        return res.status(500).json({ error: 'Screenshot falhou. Instale scrot: sudo apt install scrot' });
      }
      const image = fs.readFileSync(tmp).toString('base64');
      try { fs.unlinkSync(tmp); } catch {}
      return res.json({ success: true, image, mimeType: 'image/png' });
    }

    // ── RUN COMMAND ───────────────────────────────────────────────────────
    if (action === 'run_command') {
      if (!command) return res.status(400).json({ error: 'Parâmetro command é obrigatório.' });
      if (BLOCKED.some(p => p.test(command))) return res.status(400).json({ error: 'Comando bloqueado por segurança.' });
      const { stdout, stderr } = await runCmd(command);
      return res.json({ success: true, stdout: stdout.substring(0, 4000), stderr: stderr.substring(0, 500) });
    }

    // ── OPEN APP ──────────────────────────────────────────────────────────
    if (action === 'open_app') {
      if (!appName) return res.status(400).json({ error: 'Parâmetro app é obrigatório.' });
      if (plat === 'linux') {
        runCmd(`(xdg-open "${appName}" 2>/dev/null || ${appName} 2>/dev/null) &`);
      } else if (plat === 'darwin') {
        runCmd(`open -a "${appName}" 2>/dev/null || open "${appName}" &`);
      } else {
        runCmd(`start "" "${appName}"`);
      }
      return res.json({ success: true, message: `Abrindo ${appName}` });
    }

    // ── TYPE TEXT ─────────────────────────────────────────────────────────
    if (action === 'type_text') {
      if (!text) return res.status(400).json({ error: 'Parâmetro text é obrigatório.' });
      if (plat === 'linux') {
        const esc = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        await runCmd(`xdotool type --clearmodifiers --delay 30 '${esc}'`);
      } else if (plat === 'darwin') {
        const esc = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        await runCmd(`osascript -e 'tell application "System Events" to keystroke "${esc}"'`);
      } else {
        const esc = text.replace(/[+^%~{}[\]()]/g, '{$&}').replace(/'/g, "''");
        await runCmd(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${esc}')"`);
      }
      return res.json({ success: true });
    }

    // ── PRESS KEY ─────────────────────────────────────────────────────────
    if (action === 'press_key') {
      if (!key) return res.status(400).json({ error: 'Parâmetro key é obrigatório. Ex: ctrl+c, super, Return, ctrl+alt+t' });
      if (plat === 'linux') {
        await runCmd(`xdotool key ${key}`);
      } else if (plat === 'darwin') {
        const k = key.replace('ctrl', 'control').replace('super', 'command').replace('alt', 'option');
        await runCmd(`osascript -e 'tell application "System Events" to keystroke "${k.split('+').pop()}" using {${k.split('+').slice(0,-1).map((m: string)=>m+' down').join(', ')}}'`);
      } else {
        const winKey = key.replace('ctrl+', '^').replace('alt+', '%').replace('shift+', '+').replace('super', '#');
        await runCmd(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${winKey}')"`);
      }
      return res.json({ success: true });
    }

    // ── CLICK ─────────────────────────────────────────────────────────────
    if (action === 'click') {
      if (x == null || y == null) return res.status(400).json({ error: 'Parâmetros x e y são obrigatórios.' });
      if (plat === 'linux') {
        await runCmd(`xdotool mousemove ${Math.round(x)} ${Math.round(y)} click ${button}`);
      } else if (plat === 'darwin') {
        await runCmd(`cliclick c:${Math.round(x)},${Math.round(y)}`);
      } else {
        await runCmd(
          `powershell -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class M{[DllImport(\\"user32.dll\\")]public static extern bool SetCursorPos(int x,int y);[DllImport(\\"user32.dll\\")]public static extern void mouse_event(int f,int x,int y,int d,int i);}'; [M]::SetCursorPos(${Math.round(x)},${Math.round(y)}); [M]::mouse_event(2,0,0,0,0); [M]::mouse_event(4,0,0,0,0)"`
        );
      }
      return res.json({ success: true });
    }

    // ── MOVE MOUSE ────────────────────────────────────────────────────────
    if (action === 'move_mouse') {
      if (x == null || y == null) return res.status(400).json({ error: 'Parâmetros x e y são obrigatórios.' });
      if (plat === 'linux') {
        await runCmd(`xdotool mousemove ${Math.round(x)} ${Math.round(y)}`);
      } else if (plat === 'darwin') {
        await runCmd(`cliclick m:${Math.round(x)},${Math.round(y)}`);
      }
      return res.json({ success: true });
    }

    // ── SCROLL ────────────────────────────────────────────────────────────
    if (action === 'scroll') {
      const dir = req.body.direction === 'up' ? 4 : 5;
      const amount = req.body.amount || 3;
      if (plat === 'linux') {
        for (let i = 0; i < amount; i++) await runCmd(`xdotool click ${dir}`);
      }
      return res.json({ success: true });
    }

    // ── GET CLIPBOARD ────────────────────────────────────────────────────
    if (action === 'get_clipboard') {
      let { stdout } = { stdout: '' };
      if (plat === 'linux') {
        ({ stdout } = await runCmd(`xclip -o -selection clipboard 2>/dev/null || xsel --clipboard --output 2>/dev/null`));
      } else if (plat === 'darwin') {
        ({ stdout } = await runCmd(`pbpaste`));
      } else {
        ({ stdout } = await runCmd(`powershell -Command "Get-Clipboard"`));
      }
      return res.json({ success: true, content: stdout.trim() });
    }

    // ── SET CLIPBOARD ────────────────────────────────────────────────────
    if (action === 'set_clipboard') {
      if (content == null) return res.status(400).json({ error: 'Parâmetro content é obrigatório.' });
      const tmp2 = path.join(os.tmpdir(), `osone_clip_${Date.now()}.txt`);
      fs.writeFileSync(tmp2, content);
      if (plat === 'linux') {
        await runCmd(`cat "${tmp2}" | xclip -selection clipboard 2>/dev/null || cat "${tmp2}" | xsel --clipboard --input`);
      } else if (plat === 'darwin') {
        await runCmd(`cat "${tmp2}" | pbcopy`);
      } else {
        await runCmd(`powershell -Command "Get-Content '${tmp2}' | Set-Clipboard"`);
      }
      try { fs.unlinkSync(tmp2); } catch {}
      return res.json({ success: true });
    }

    // ── GET ACTIVE WINDOW ────────────────────────────────────────────────
    if (action === 'get_active_window') {
      let { stdout } = { stdout: '' };
      if (plat === 'linux') {
        ({ stdout } = await runCmd(`xdotool getactivewindow getwindowname 2>/dev/null`));
      } else if (plat === 'darwin') {
        ({ stdout } = await runCmd(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`));
      } else {
        ({ stdout } = await runCmd(`powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Sort-Object CPU -Desc | Select -First 1 -ExpandProperty MainWindowTitle"`));
      }
      return res.json({ success: true, window: stdout.trim() });
    }

    // ── LIST WINDOWS ─────────────────────────────────────────────────────
    if (action === 'list_windows') {
      let { stdout } = { stdout: '' };
      if (plat === 'linux') {
        ({ stdout } = await runCmd(`wmctrl -l 2>/dev/null | head -20 || xdotool search --onlyvisible --name '.' getwindowname 2>/dev/null | head -15`));
      } else if (plat === 'darwin') {
        ({ stdout } = await runCmd(`osascript -e 'tell application "System Events" to get name of every application process whose visible is true'`));
      } else {
        ({ stdout } = await runCmd(`powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Select -ExpandProperty MainWindowTitle"`));
      }
      return res.json({ success: true, windows: stdout.trim() });
    }

    // ── SYSTEM INFO ──────────────────────────────────────────────────────
    if (action === 'system_info') {
      const { stdout: uptime } = await runCmd(plat === 'win32' ? 'powershell -Command "(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime"' : 'uptime -p 2>/dev/null || uptime');
      const { stdout: disk }   = await runCmd(plat === 'win32' ? 'powershell -Command "Get-PSDrive C | Select-Object Used,Free"' : 'df -h / 2>/dev/null | tail -1');
      const { stdout: mem }    = await runCmd(plat === 'win32' ? 'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize"' : 'free -h 2>/dev/null | grep Mem');
      const { stdout: cpu }    = await runCmd(plat === 'win32' ? 'powershell -Command "(Get-CimInstance Win32_Processor).LoadPercentage"' : 'top -bn1 2>/dev/null | grep "%Cpu" | head -1');
      return res.json({ success: true, uptime: uptime.trim(), disk: disk.trim(), memory: mem.trim(), cpu: cpu.trim(), platform: plat, hostname: os.hostname() });
    }

    return res.status(400).json({ error: `Ação desconhecida: ${action}` });

  } catch (err: any) {
    console.error('[pc-control]', err.message);
    res.status(500).json({ error: err.message });
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
