// pages/api/chat.ts — Gemini 2.5 Flash (fallback serverless route)
import type { NextApiRequest, NextApiResponse } from 'next';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { messages, systemInstruction } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Parâmetro messages inválido.' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API Key não configurada. Adicione GEMINI_API_KEY nas variáveis de ambiente.' });
  }

  try {
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: any = {
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.75 },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({ text });
  } catch (error: any) {
    console.error('[chat] Erro Gemini:', error);
    return res.status(500).json({ error: error.message || 'Erro desconhecido.' });
  }
}
