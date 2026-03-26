import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";

import axios from "axios";
import { convert } from "html-to-text";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/api/auth/google/callback`
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

app.post("/api/gmail/search", async (req, res) => {
  const { tokens, query } = req.body;
  if (!tokens || !query) {
    return res.status(400).json({ error: "Tokens and query are required" });
  }
  try {
    const auth = new OAuth2Client();
    auth.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth });
    const response = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 5 });
    const messages = response.data.messages || [];
    const results = [];
    for (const msg of messages) {
      const details = await gmail.users.messages.get({ userId: "me", id: msg.id! });
      const snippet = details.data.snippet;
      const subject = details.data.payload?.headers?.find(h => h.name === "Subject")?.value;
      const from = details.data.payload?.headers?.find(h => h.name === "From")?.value;
      const date = details.data.payload?.headers?.find(h => h.name === "Date")?.value;
      results.push({ id: msg.id, snippet, subject, from, date });
    }
    res.json({ results });
  } catch (error: any) {
    console.error("Error searching Gmail:", error.message);
    res.status(500).json({ error: "Failed to search Gmail" });
  }
});


app.post("/api/read-url", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const text = convert(response.data, {
      wordwrap: 130,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'nav', format: 'skip' },
        { selector: 'footer', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' }
      ]
    });
    res.json({ text: text.substring(0, 15000) });
  } catch (error: any) {
    console.error("Error reading URL:", error.message);
    res.status(500).json({ error: "Failed to read URL content" });
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages, systemInstruction } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OpenAI API Key not configured on server" });

  try {
    const formattedMessages = [
      { role: "system", content: systemInstruction || "You are a helpful assistant." },
      ...messages.map((msg: any) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
      }))
    ];

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 1024
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ text: response.data.choices[0].message.content });
  } catch (error: any) {
    console.error("Error calling OpenAI API:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to generate response from OpenAI" });
  }
});

// ============================================================
// 🌐 BUSCA WEB — Jina AI Search + fallback DuckDuckGo
// ✅ Rota adicionada aqui no Express (não em pages/api)
// ============================================================

app.post("/api/web-search", async (req, res) => {
  const { query, num_results = 5, url, action } = req.body;

  // --- Leitura de URL ---
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
      console.error('[web-search] Erro ao ler URL:', error.message);
      return res.status(500).json({ error: 'Não foi possível ler a URL.' });
    }
  }

  // --- Busca web ---
  if (query) {
    // Tentativa 1: Jina AI Search
    try {
      const response = await axios.get(`https://s.jina.ai/${encodeURIComponent(query)}`, {
        headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
        timeout: 15000
      });

      const text = String(response.data);
      if (text && text.trim().length > 100) {
        console.log(`[web-search] Jina OK para: "${query}" (${text.length} chars)`);
        // Pega os primeiros N blocos e limita o tamanho total
        const blocks = text.split(/\n---+\n/).slice(0, num_results);
        const raw = blocks.join('\n---\n').substring(0, 6000);
        return res.json({ raw, source: 'jina' });
      }
      throw new Error('Jina retornou resposta vazia');

    } catch (jinaError: any) {
      console.warn('[web-search] Jina falhou:', jinaError.message, '— usando DuckDuckGo');
    }

    // Tentativa 2: DuckDuckGo
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

      if (results.length === 0) {
        return res.json({ raw: `Não foram encontrados resultados para "${query}".`, source: 'duckduckgo' });
      }

      const formatted = results
        .slice(0, num_results)
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.description}${r.url ? `\nURL: ${r.url}` : ''}`)
        .join('\n\n');

      return res.json({ raw: `Resultados para "${query}":\n\n${formatted}`, source: 'duckduckgo' });

    } catch (ddgError: any) {
      console.error('[web-search] DuckDuckGo também falhou:', ddgError.message);
      return res.status(500).json({ error: 'Não foi possível realizar a busca.' });
    }
  }

  return res.status(400).json({ error: 'Parâmetros inválidos.' });
});

// ============================================================
// 📱 WHATSAPP — Envio de mensagem para o próprio número
// ============================================================

const EVOLUTION_URL = 'https://evolution-api-production-9133.up.railway.app';
const EVOLUTION_KEY = '5DC26A82784E-4BDB-A4CD-33C86CB2455D';
const EVOLUTION_INSTANCE = 'OSONE2';

app.post("/api/whatsapp/send", async (req, res) => {
  const { message, phone } = req.body;
  const target = phone || process.env.WHATSAPP_MY_NUMBER;

  if (!message) return res.status(400).json({ error: "message é obrigatório" });
  if (!target) return res.status(400).json({ error: "Número de destino não configurado. Defina WHATSAPP_MY_NUMBER no .env" });

  try {
    const response = await axios.post(
      `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        number: `${target}@s.whatsapp.net`,
        text: message
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_KEY
        },
        timeout: 10000
      }
    );
    console.log(`[WhatsApp] Mensagem enviada para ${target}:`, message);
    res.json({ success: true, to: target });
  } catch (error: any) {
    console.error('[WhatsApp] Erro ao enviar mensagem:', error.message);
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

// Vite Middleware
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
