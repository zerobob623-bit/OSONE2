// pages/api/web-search.ts
// ✅ Corrigido: Jina retorna texto markdown, não JSON — tratado corretamente

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { query, num_results = 5, url, action } = req.body;

  // ─── Modo leitura de URL (Jina Reader) ───────────────────────────────────
  if (action === 'read' && url) {
    try {
      const response = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          'Accept': 'text/plain',           // ✅ pede texto, não JSON
          'X-With-Generated-Alt': 'true',
          'X-Retain-Images': 'none',
        }
      });

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

  // ─── Modo busca (Jina Search + fallback DuckDuckGo) ──────────────────────
  if (query) {
    // --- Tentativa 1: Jina AI Search ---
    try {
      const response = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
        headers: {
          'Accept': 'text/plain',           // ✅ Jina retorna markdown, não JSON
          'X-Retain-Images': 'none',
        }
      });

      if (!response.ok) throw new Error(`Jina Search HTTP ${response.status}`);

      const text = await response.text();

      if (text && text.trim().length > 100) {
        // Jina retorna blocos separados por "---" para cada resultado
        // Pegamos os primeiros N resultados e limitamos o tamanho
        const blocks = text.split(/\n---+\n/).slice(0, num_results);
        const trimmed = blocks.join('\n---\n').substring(0, 6000);

        return res.status(200).json({
          results: parseJinaMarkdown(text, num_results),
          raw: trimmed  // enviamos também o texto bruto para o modelo ter mais contexto
        });
      }

      throw new Error('Jina retornou resposta vazia');

    } catch (jinaError: any) {
      console.warn('[web-search] Jina falhou, usando DuckDuckGo:', jinaError.message);
    }

    // --- Tentativa 2: DuckDuckGo (fallback) ---
    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`
      );
      const data = await response.json();

      const results: any[] = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || '',
          description: data.AbstractText
        });
      }

      if (data.Answer) {
        results.unshift({
          title: 'Resposta direta',
          url: '',
          description: data.Answer
        });
      }

      const topics = (data.RelatedTopics || [])
        .flatMap((t: any) => t.Topics ? t.Topics : [t])
        .filter((t: any) => t.Text)
        .slice(0, num_results)
        .map((t: any) => ({
          title: t.Text.substring(0, 80),
          url: t.FirstURL || '',
          description: t.Text
        }));

      results.push(...topics);

      if (results.length === 0) {
        return res.status(200).json({
          results: [],
          raw: `Não foram encontrados resultados para "${query}". Tente reformular a busca.`
        });
      }

      return res.status(200).json({ results: results.slice(0, num_results) });

    } catch (ddgError: any) {
      console.error('[web-search] DuckDuckGo também falhou:', ddgError);
      return res.status(500).json({ error: 'Não foi possível realizar a busca. Tente novamente.' });
    }
  }

  return res.status(400).json({ error: 'Parâmetros inválidos.' });
}

/**
 * Faz o parse do markdown retornado pelo Jina Search.
 * Cada resultado vem no formato:
 * Title: ...
 * URL Source: ...
 * Description: ...
 * (ou blocos separados por ---)
 */
function parseJinaMarkdown(text: string, limit: number): Array<{ title: string; url: string; description: string }> {
  const results: Array<{ title: string; url: string; description: string }> = [];

  // Divide por blocos de resultado
  const blocks = text.split(/\n(?=\[\d+\]|\d+\.\s)/);

  for (const block of blocks.slice(0, limit)) {
    if (!block.trim()) continue;

    const titleMatch = block.match(/^(?:\[\d+\]\s*)?(?:Title:|##\s*)?\s*(.+?)(?:\n|$)/);
    const urlMatch = block.match(/(?:URL Source|URL|Link):\s*(https?:\/\/\S+)/i);
    const descMatch = block.match(/(?:Description|Summary|Content):\s*([\s\S]+?)(?:\n\n|\n(?=\w+:)|$)/i);

    const title = titleMatch?.[1]?.trim() || 'Sem título';
    const url = urlMatch?.[1]?.trim() || '';
    // Se não achou campo de descrição, pega as primeiras linhas do bloco
    const description = descMatch?.[1]?.trim() ||
      block.split('\n').slice(1, 4).join(' ').trim().substring(0, 300) ||
      'Sem descrição';

    if (title !== 'Sem título' || description !== 'Sem descrição') {
      results.push({ title, url, description });
    }
  }

  // Se o parse não encontrou nada estruturado, retorna o texto bruto como 1 resultado
  if (results.length === 0 && text.trim().length > 50) {
    results.push({
      title: 'Resultado da busca',
      url: '',
      description: text.substring(0, 500)
    });
  }

  return results;
}
