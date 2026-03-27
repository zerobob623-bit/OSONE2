// api/chat.ts — Vercel Serverless Function (OpenAI gpt-4.1-mini)
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { messages, systemInstruction } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Parâmetro messages inválido.' });
  }

  const OPENAI_KEY = process.env.VITE_OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY não configurada nas variáveis de ambiente.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          ...messages,
        ],
        max_tokens: 1024,
        temperature: 0.75,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any).error?.message || `OpenAI HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });
  } catch (error: any) {
    console.error('[chat] Erro OpenAI:', error.message);
    return res.status(500).json({ error: error.message || 'Erro desconhecido.' });
  }
}
