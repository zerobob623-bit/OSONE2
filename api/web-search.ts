// api/web-search.ts — Vercel Serverless: Brave Search + Jina fallback
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const { query, num_results = 5, url, action } = req.body;
  const BRAVE_KEY = process.env.BRAVE_API_KEY || '';
  const JINA_KEY  = process.env.JINA_API_KEY  || '';

  // ── Leitura de URL (Jina Reader) ───────────────────────────────────────────
  if (action === 'read' && url) {
    try {
      const headers: HeadersInit = { 'Accept': 'text/plain', 'X-Retain-Images': 'none' };
      if (JINA_KEY) headers['Authorization'] = `Bearer ${JINA_KEY}`;
      const r = await fetch(`https://r.jina.ai/${url}`, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      return res.status(200).json({ content: text.substring(0, 5000) + (text.length > 5000 ? '\n[truncado]' : '') });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Busca web ──────────────────────────────────────────────────────────────
  if (!query) return res.status(400).json({ error: 'Parâmetros inválidos.' });

  // 1. Brave Search
  if (BRAVE_KEY) {
    try {
      const r = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${num_results}&search_lang=pt&country=BR`,
        { headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY } }
      );
      if (!r.ok) throw new Error(`Brave ${r.status}`);
      const data = await r.json();
      const items = (data.web?.results || []).slice(0, num_results);
      if (items.length > 0) {
        const raw = items.map((x: any, i: number) => `[${i+1}] ${x.title}\n${x.description || ''}\nURL: ${x.url}`).join('\n\n');
        return res.status(200).json({ results: items, raw });
      }
    } catch {}
  }

  // 2. Jina Search (fallback)
  try {
    const headers: HeadersInit = { 'Accept': 'text/plain', 'X-Retain-Images': 'none' };
    if (JINA_KEY) headers['Authorization'] = `Bearer ${JINA_KEY}`;
    const r = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers });
    if (!r.ok) throw new Error(`Jina ${r.status}`);
    const text = await r.text();
    if (text.trim().length > 100) {
      const raw = text.split(/\n---+\n/).slice(0, num_results).join('\n---\n').substring(0, 6000);
      return res.status(200).json({ results: [], raw });
    }
  } catch {}

  return res.status(200).json({ results: [], raw: `Sem resultados para "${query}". Configure BRAVE_API_KEY no painel do Vercel/Railway.` });
}
