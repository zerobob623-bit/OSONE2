import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  try {
    // Tenta Jina AI
    const response = await fetch(`https://s.jina.ai/${query}`, {
      headers: {
        'Accept': 'application/json',
        'X-With-Generated-Alt': 'true'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return res.status(200).json(data);
    }
    
    // Fallback: DuckDuckGo
    const ddgResponse = await fetch(`https://api.duckduckgo.com/?q=${query}&format=json`);
    const ddgData = await ddgResponse.json();
    return res.status(200).json(ddgData);
    
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Search failed' });
  }
}
