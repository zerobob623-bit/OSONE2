import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
    }

  const { query, num_results = 5, url, action } = req.body;

  // URL reading mode
  if (action === 'read' && url) {
        try {
                const response = await axios.get(`https://r.jina.ai/${url}`, {
                          headers: {
                                      'Accept': 'text/plain',
                                      'X-Retain-Images': 'none'
                          },
                          timeout: 15000
                });
                const text = String(response.data);
                return res.json({
                          content: text.length > 5000 ? text.substring(0, 5000) + '\n\n[Conteúdo truncado]' : text
                });
        } catch (error) {
                console.error('[web-search] Error reading URL:', error.message);
                return res.status(500).json({ error: 'Failed to read URL' });
        }
  }

  // Web search mode
  if (query) {
        try {
                // Try Jina AI Search first
          const jinaResponse = await axios.get(`https://s.jina.ai/${encodeURIComponent(query)}`, {
                    headers: {
                                'Accept': 'text/plain',
                                'X-Retain-Images': 'none'
                    },
                    timeout: 15000
          });
                const text = String(jinaResponse.data);
                if (text && text.trim().length > 100) {
                          const blocks = text.split(/\n---+\n/).slice(0, num_results);
                          const raw = blocks.join('\n---\n').substring(0, 6000);
                          return res.json({ raw, source: 'jina' });
                }
        } catch (jinaError) {
                console.warn('[web-search] Jina failed:', jinaError.message);
        }

      // Fallback to DuckDuckGo
      try {
              const ddgResponse = await axios.get(
                        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`,
                { timeout: 10000 }
                      );
              const data = ddgResponse.data;
              const results = [];

          if (data.Answer) {
                    results.push({ title: 'Direct Answer', url: '', description: data.Answer });
          }
              if (data.AbstractText) {
                        results.push({
                                    title: data.Heading || query,
                                    url: data.AbstractURL || '',
                                    description: data.AbstractText
                        });
              }

          const topics = (data.RelatedTopics || [])
                .flatMap((t) => (t.Topics ? t.Topics : [t]))
                .filter((t) => t.Text)
                .slice(0, num_results)
                .map((t) => ({
                            title: t.Text.substring(0, 80),
                            url: t.FirstURL || '',
                            description: t.Text
                }));

          results.push(...topics);

          if (results.length === 0) {
                    return res.json({
                                raw: `No results found for "${query}".`,
                                source: 'duckduckgo'
                    });
          }

          const formatted = results
                .slice(0, num_results)
                .map((r, i) => `[${i + 1}] ${r.title}\n${r.description}${r.url ? `\nURL: ${r.url}` : ''}`)
                .join('\n\n');

          return res.json({
                    raw: `Results for "${query}":\n\n${formatted}`,
                    source: 'duckduckgo'
          });
      } catch (ddgError) {
              console.error('[web-search] DuckDuckGo also failed:', ddgError.message);
              return res.status(500).json({ error: 'Web search failed' });
      }
  }

  return res.status(400).json({ error: 'Invalid parameters' });
}
