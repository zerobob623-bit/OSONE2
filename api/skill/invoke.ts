import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { webhookUrl, method = 'GET', params = {} } = req.body || {};
  if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl é obrigatório' });

  try {
    const url = new URL(webhookUrl);
    const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (blocked.some(h => url.hostname.includes(h))) {
      return res.status(403).json({ error: 'Chamadas para localhost não são permitidas.' });
    }
  } catch {
    return res.status(400).json({ error: 'URL inválida.' });
  }

  try {
    // Suporte a URL templates: {param} é substituído pelo valor real
    let finalUrl = webhookUrl;
    const remainingParams: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (finalUrl.includes(`{${k}}`)) {
        finalUrl = finalUrl.replace(`{${k}}`, encodeURIComponent(String(v)));
      } else {
        (remainingParams as any)[k] = v;
      }
    }

    const isGet = method.toUpperCase() === 'GET';
    const hasRemaining = Object.keys(remainingParams).length > 0;
    const response = await axios({
      method: method.toUpperCase(),
      url: isGet && hasRemaining
        ? `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}${new URLSearchParams(Object.entries(remainingParams).map(([k, v]) => [k, String(v)])).toString()}`
        : finalUrl,
      data: isGet ? undefined : (hasRemaining ? remainingParams : undefined),
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      timeout: 15000,
    });
    return res.json(response.data);
  } catch (error: any) {
    const msg = error.response?.data?.message || error.response?.data?.error || error.message;
    return res.status(500).json({ error: `Erro ao chamar habilidade: ${msg}` });
  }
}
