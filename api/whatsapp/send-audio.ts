// api/whatsapp/send-audio.ts — Vercel Serverless
const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-9133.up.railway.app';
const EVOLUTION_KEY      = process.env.EVOLUTION_KEY      || '5DC26A82784E-4BDB-A4CD-33C86CB2455D';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'OSONE2';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const { text, phone } = req.body;
  if (!text)  return res.status(400).json({ error: 'text é obrigatório.' });
  if (!phone) return res.status(400).json({ error: 'phone é obrigatório.' });

  try {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      const slice = remaining.substring(0, 200);
      const cutAt = slice.lastIndexOf(' ');
      const chunk = cutAt > 100 ? slice.substring(0, cutAt) : slice;
      chunks.push(chunk);
      remaining = remaining.substring(chunk.length).trim();
    }

    const audioParts: Buffer[] = [];
    for (const chunk of chunks) {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=pt-BR&client=tw-ob&ttsspeed=0.9`;
      const r = await fetch(ttsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      audioParts.push(Buffer.from(await r.arrayBuffer()));
    }

    const audioBase64 = Buffer.concat(audioParts).toString('base64');

    // Try voice note first, fallback to audio file
    try {
      await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
        body: JSON.stringify({ number: `${phone}@s.whatsapp.net`, audio: audioBase64, encoding: true }),
      });
    } catch {
      await fetch(`${EVOLUTION_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
        body: JSON.stringify({ number: `${phone}@s.whatsapp.net`, mediatype: 'audio', mimetype: 'audio/mpeg', media: audioBase64, fileName: 'osone_audio.mp3' }),
      });
    }

    return res.status(200).json({ success: true, to: phone });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
