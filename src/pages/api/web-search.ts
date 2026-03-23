// pages/api/web-search.ts
// ✅ Proxy backend para buscas na web — resolve o problema de CORS
// O browser não pode chamar Jina/DuckDuckGo diretamente, mas o servidor pode.

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { query, num_results = 5, url, action, engine } = req.body;

  // --- Modo leitura de URL ---
  if (action === 'read' && url) {
    try {
      const readerUrl = `https://r.jina.ai/${url}`;
      const response = await fetch(readerUrl, {
        headers: {
          'Accept': 'application/json',
          'X-With-Generated-Alt': 'true'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Erro ao ler URL: ${response.status}` });
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return res.status(200).json({ content: data.content || data.text || '' });
      }

      const text = await response.text();
      return res.status(200).json({ content: text });

    } catch (error: any) {
      console.error('[web-search API] Erro ao ler URL:', error);
      return res.status(500).json({ error: error.message || 'Erro desconhecido ao ler URL.' });
    }
  }

  // --- Modo busca DuckDuckGo (fallback) ---
  if (engine === 'duckduckgo' && query) {
    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`
      );
      const data = await response.json();

      return res.status(200).json({
        abstract: data.AbstractText || null,
        source: data.AbstractSource || 'DuckDuckGo',
        topics: (data.RelatedTopics || [])
          .filter((t: any) => t.Text)
          .map((t: any) => ({ text: t.Text, url: t.FirstURL || null }))
          .slice(0, num_results)
      });

    } catch (error: any) {
      console.error('[web-search API] Erro DuckDuckGo:', error);
      return res.status(500).json({ error: error.message || 'Erro no DuckDuckGo.' });
    }
  }

  // --- Modo busca principal via Jina AI Search ---
  if (query) {
    try {
      const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'X-With-Generated-Alt': 'true',
          'X-With-Links-Summary': 'true'
        }
      });

      if (!response.ok) {
        throw new Error(`Jina Search retornou status ${response.status}`);
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        const results = data.data.slice(0, num_results).map((item: any) => ({
          title: item.title || 'Sem título',
          url: item.url || '',
          description: item.description || item.content?.substring(0, 300) || 'Sem descrição disponível'
        }));
        return res.status(200).json({ results });
      }

      // Se não vier JSON estruturado, retorna o texto bruto
      const text = await response.text();
      return res.status(200).json({ text: text.substring(0, 2000) });

    } catch (error: any) {
      console.error('[web-search API] Erro Jina Search, tentando DuckDuckGo...', error);

      // Fallback automático para DuckDuckGo
      try {
        const response = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`
        );
        const data = await response.json();

        const topics = (data.RelatedTopics || [])
          .filter((t: any) => t.Text)
          .map((t: any) => ({
            title: t.Text.substring(0, 80),
            url: t.FirstURL || '',
            description: t.Text
          }))
          .slice(0, num_results);

        const results = topics.length > 0 ? topics : [];

        if (data.AbstractText) {
          results.unshift({
            title: data.Heading || query,
            url: data.AbstractURL || '',
            description: data.AbstractText
          });
        }

        return res.status(200).json({ results });

      } catch (fallbackError: any) {
        console.error('[web-search API] Erro no fallback DuckDuckGo:', fallbackError);
        return res.status(500).json({ error: 'Não foi possível realizar a busca. Verifique a conexão do servidor.' });
      }
    }
  }

  return res.status(400).json({ error: 'Parâmetros inválidos. Envie "query" para busca ou "url" + "action: read" para leitura.' });
}
