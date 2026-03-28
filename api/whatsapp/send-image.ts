// api/whatsapp/send-image.ts — Vercel Serverless
const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-9133.up.railway.app';
const EVOLUTION_KEY      = process.env.EVOLUTION_KEY      || '5DC26A82784E-4BDB-A4CD-33C86CB2455D';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'OSONE2';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const { imageUrl, caption, phone } = req.body;
  if (!phone)    return res.status(400).json({ error: 'phone é obrigatório.' });
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl é obrigatório.' });

  try {
    const imgRes = await fetch(imageUrl);
    const imgBase64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

    await fetch(`${EVOLUTION_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: `${phone}@s.whatsapp.net`, mediatype: 'image', mimetype: contentType, media: imgBase64, caption: caption || '', fileName: 'osone_image.jpg' }),
    });

    return res.status(200).json({ success: true, to: phone });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
