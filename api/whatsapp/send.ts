// api/whatsapp/send.ts — Vercel Serverless
const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-9133.up.railway.app';
const EVOLUTION_KEY      = process.env.EVOLUTION_KEY      || '5DC26A82784E-4BDB-A4CD-33C86CB2455D';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'OSONE2';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const { message, phone } = req.body;
  const target = phone || process.env.WHATSAPP_MY_NUMBER;
  if (!message) return res.status(400).json({ error: 'message é obrigatório.' });
  if (!target)  return res.status(400).json({ error: 'Número não configurado.' });
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: `${target}@s.whatsapp.net`, text: message }),
    });
    return res.status(200).json({ success: true, to: target });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
