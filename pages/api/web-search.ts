// pages/api/web-search.ts
// Brave Search (primário) + Jina Search (fallback) + Jina Reader (leitura de URL)

import type { NextApiRequest, NextApiResponse } from 'next';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';
const JINA_API_KEY = process.env.JINA_API_KEY || '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { query, num_results = 5, url, action } = req.body;

  // ─── Modo leitura de URL (Jina Reader) ───────────────────────────────────
  if (action === 'read' && url) {
    try {
      const headers: HeadersInit = {
        'Accept': 'text/plain',
        'X-With-Generated-Alt': 'true',
        'X-Retain-Images': 'none',
      };
      if (JINA_API_KEY) headers['Authorization'] = `Bearer ${JINA_API_KEY}`;

      const response = await fetch(`https://r.jina.ai/${url}`, { headers });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Erro ao ler URL: ${response.status}` });
      }

      const text = await response.text();
      return res.status(200).json({
        content: text.substring(0, 5000) + (text.length > 5000 ? '\n\n[Conteúdo truncado]' : '')
      });

    } catch (error: any) {
      console.error('[web-search] Erro ao ler URL:', error);
      return res.status(500).json({ error: error.message || 'Erro desconhecido ao ler URL.' });
    }
  }

  // ─── Modo busca ───────────────────────────────────────────────────────────
  if (query) {

    // --- Tentativa 1: Brave Search ---
    if (BRAVE_API_KEY) {
      try {
        const response = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${num_results}&search_lang=pt&country=BR`,
          {
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': BRAVE_API_KEY,
            }
          }
        );

        if (!response.ok) throw new Error(`Brave Search HTTP ${response.status}`);

        const data = await response.json();
        const webResults = data.web?.results || [];

        if (webResults.length > 0) {
          const results = webResults.slice(0, num_results).map((r: any) => ({
            title: r.title || 'Sem título',
            url: r.url || '',
            description: r.description || r.extra_snippets?.[0] || 'Sem descrição',
          }));

          const raw = results
            .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.description}${r.url ? `\nURL: ${r.url}` : ''}`)
            .join('\n\n');

          return res.status(200).json({ results, raw });
        }

        throw new Error('Brave retornou lista vazia');

      } catch (braveError: any) {
        console.warn('[web-search] Brave falhou, tentando Jina:', braveError.message);
      }
    }

    // --- Tentativa 2: Jina Search (fallback) ---
    try {
      const headers: HeadersInit = {
        'Accept': 'text/plain',
        'X-Retain-Images': 'none',
      };
      if (JINA_API_KEY) headers['Authorization'] = `Bearer ${JINA_API_KEY}`;

      const response = await fetch(
        `https://s.jina.ai/${encodeURIComponent(query)}`,
        { headers }
      );

      if (!response.ok) throw new Error(`Jina Search HTTP ${response.status}`);

      const text = await response.text();

      if (text && text.trim().length > 100) {
        const blocks = text.split(/\n---+\n/).slice(0, num_results);
        const trimmed = blocks.join('\n---\n').substring(0, 6000);

        return res.status(200).json({
          results: parseJinaMarkdown(text, num_results),
          raw: trimmed
        });
      }

      throw new Error('Jina retornou resposta vazia');

    } catch (jinaError: any) {
      console.warn('[web-search] Jina também falhou:', jinaError.message);
    }

    // --- Sem resultados ---
    return res.status(200).json({
      results: [],
      raw: `Não foi possível realizar a busca por "${query}". Verifique sua BRAVE_API_KEY no .env.`
    });
  }

  return res.status(400).json({ error: 'Parâmetros inválidos.' });
}

function parseJinaMarkdown(text: string, limit: number): Array<{ title: string; url: string; description: string }> {
  const results: Array<{ title: string; url: string; description: string }> = [];

  const blocks = text.split(/\n(?=\[\d+\]|\d+\.\s)/);

  for (const block of blocks.slice(0, limit)) {
    if (!block.trim()) continue;

    const titleMatch = block.match(/^(?:\[\d+\]\s*)?(?:Title:|##\s*)?\s*(.+?)(?:\n|$)/);
    const urlMatch = block.match(/(?:URL Source|URL|Link):\s*(https?:\/\/\S+)/i);
    const descMatch = block.match(/(?:Description|Summary|Content):\s*([\s\S]+?)(?:\n\n|\n(?=\w+:)|$)/i);

    const title = titleMatch?.[1]?.trim() || 'Sem título';
    const url = urlMatch?.[1]?.trim() || '';
    const description = descMatch?.[1]?.trim() ||
      block.split('\n').slice(1, 4).join(' ').trim().substring(0, 300) ||
      'Sem descrição';

    if (title !== 'Sem título' || description !== 'Sem descrição') {
      results.push({ title, url, description });
    }
  }

  if (results.length === 0 && text.trim().length > 50) {
    results.push({
      title: 'Resultado da busca',
      url: '',
      description: text.substring(0, 500)
    });
  }

  return results;
}
