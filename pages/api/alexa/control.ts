// pages/api/alexa/control.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const ALEXA_COOKIE = process.env.ALEXA_COOKIE!;
const ALEXA_EMAIL = process.env.ALEXA_EMAIL!;
const ALEXA_PASSWORD = process.env.ALEXA_PASSWORD!;

// ─── CONTROLA DISPOSITIVO VIA ALEXA ──────────────────────────────────────────
async function sendAlexaCommand(deviceName: string, command: string, value?: any) {
  // Usa a API interna da Amazon diretamente
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': ALEXA_COOKIE,
    'csrf': '',
  };

  // Busca lista de dispositivos
  const devicesRes = await fetch('https://alexa.amazon.com.br/api/devices-v2/device?cached=false', {
    headers: { 'Cookie': ALEXA_COOKIE }
  });

  if (!devicesRes.ok) throw new Error('Falha ao buscar dispositivos Alexa');
  const devicesData = await devicesRes.json();
  const devices = devicesData.devices || [];

  // Encontra o dispositivo pelo nome (case insensitive)
  const device = devices.find((d: any) =>
    d.accountName?.toLowerCase().includes(deviceName.toLowerCase()) ||
    d.description?.toLowerCase().includes(deviceName.toLowerCase())
  );

  if (!device) throw new Error(`Dispositivo "${deviceName}" não encontrado na Alexa`);

  // Monta o comando
  let payload: any = {};

  switch (command.toLowerCase()) {
    case 'ligar':
    case 'on':
      payload = { action: '{"type":"turnOn"}' };
      break;
    case 'desligar':
    case 'off':
      payload = { action: '{"type":"turnOff"}' };
      break;
    case 'dimmer':
    case 'brilho':
      payload = { action: JSON.stringify({ type: 'setBrightness', brightness: value || 50 }) };
      break;
    case 'musica':
    case 'tocar':
      payload = { action: JSON.stringify({ type: 'playMusicProvider', providerId: 'SPOTIFY', contentId: value || '' }) };
      break;
    case 'pausar':
    case 'parar':
      payload = { action: '{"type":"PauseCommand"}' };
      break;
    case 'volume':
      payload = { action: JSON.stringify({ type: 'VolumeLevelCommand', volumeLevel: value || 50 }) };
      break;
    default:
      // Comando de voz livre — envia direto para a Alexa executar
      payload = { action: JSON.stringify({ type: 'AlexaClientCompatibleCommand', command }) };
  }

  // Envia o comando
  const res = await fetch(
    `https://alexa.amazon.com.br/api/np/command?deviceSerialNumber=${device.serialNumber}&deviceType=${device.deviceType}`,
    {
      method: 'POST',
      headers: { 'Cookie': ALEXA_COOKIE, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  return { success: res.ok, device: device.accountName };
}

// ─── INTERPRETA COMANDO EM LINGUAGEM NATURAL ──────────────────────────────────
function parseCommand(naturalCommand: string) {
  const lower = naturalCommand.toLowerCase();

  // Detecta ação
  let action = 'ligar';
  if (lower.includes('deslig') || lower.includes('apag') || lower.includes('off')) action = 'desligar';
  else if (lower.includes('pau') || lower.includes('par') || lower.includes('stop')) action = 'pausar';
  else if (lower.includes('toc') || lower.includes('music') || lower.includes('play')) action = 'tocar';
  else if (lower.includes('volume')) action = 'volume';
  else if (lower.includes('brilho') || lower.includes('dimm')) action = 'dimmer';

  // Detecta valor numérico (ex: "volume 70", "brilho 30%")
  const numMatch = lower.match(/(\d+)/);
  const value = numMatch ? parseInt(numMatch[1]) : undefined;

  // Detecta dispositivo/cômodo
  let device = 'sala'; // padrão
  const rooms = ['sala', 'quarto', 'cozinha', 'banheiro', 'varanda', 'escritório', 'garagem'];
  for (const room of rooms) {
    if (lower.includes(room)) { device = room; break; }
  }

  // Detecta dispositivo específico
  if (lower.includes('tv') || lower.includes('televisão')) device = 'tv';
  if (lower.includes('luz') || lower.includes('lâmpada')) device = lower.includes('da ') ? device : device;
  if (lower.includes('spotify') || lower.includes('música')) action = 'tocar';
  if (lower.includes('termostato') || lower.includes('ar condicionado')) device = 'termostato';

  return { action, device, value };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { command, device, value } = req.body;

  if (!command && !device) {
    return res.status(400).json({ error: 'Comando ou dispositivo necessário' });
  }

  try {
    let action: string;
    let targetDevice: string;
    let targetValue: any;

    if (device && command) {
      // Comando direto
      action = command;
      targetDevice = device;
      targetValue = value;
    } else {
      // Interpreta linguagem natural
      const parsed = parseCommand(command || device);
      action = parsed.action;
      targetDevice = parsed.device;
      targetValue = parsed.value;
    }

    console.log(`🏠 Alexa: ${action} → ${targetDevice} (valor: ${targetValue})`);

    const result = await sendAlexaCommand(targetDevice, action, targetValue);

    return res.status(200).json({
      success: true,
      message: `${action} executado em "${result.device}" com sucesso!`,
      device: result.device
    });

  } catch (error: any) {
    console.error('Alexa control error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao controlar dispositivo'
    });
  }
}

export const config = {
  api: { bodyParser: true }
};
