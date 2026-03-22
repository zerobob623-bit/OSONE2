import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { query } = req.query;
  
  try {
    const response = await fetch(`https://s.jina.ai/${query}`, {
      headers: {
        'Accept': 'application/json',
        'X-With-Generated-Alt': 'true'
      }
    });
    
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
}
