// useGeminiTTS.ts — TTS via REST API do Gemini 2.5
// Usa a mesma chave Gemini já configurada. Zero configuração extra.
// Modelo: gemini-2.5-flash-preview-tts (v1beta)
// Áudio: PCM 16-bit 24kHz → reproduzido via AudioContext

import { useRef, useState, useCallback } from 'react';

interface UseGeminiTTSOptions {
  apiKey: string;
  voice?: string;        // Ex: 'Kore', 'Charon', 'Puck' — vozes Gemini
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  onError?: (err: string) => void;
}

interface UseGeminiTTSReturn {
  speak: (text: string) => Promise<boolean>;
  stop: () => void;
  isSpeaking: boolean;
}

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const TTS_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`;

export function useGeminiTTS({
  apiKey,
  voice = 'Kore',
  onSpeakStart,
  onSpeakEnd,
  onError,
}: UseGeminiTTSOptions): UseGeminiTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const sourceRef      = useRef<AudioBufferSourceNode | null>(null);
  const queueRef       = useRef<string[]>([]);
  const playingRef     = useRef(false);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    queueRef.current = [];
    playingRef.current = false;
    setIsSpeaking(false);
    onSpeakEnd?.();
  }, [onSpeakEnd]);

  const playPcm = useCallback(async (pcmBase64: string): Promise<void> => {
    // Decodifica base64 → bytes
    const binary = atob(pcmBase64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // PCM 16-bit little-endian → Float32
    const samples = new Float32Array(bytes.length / 2);
    const view    = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(i * 2, true) / 32768;
    }

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    const buf = audioCtxRef.current.createBuffer(1, samples.length, 24000);
    buf.copyToChannel(samples, 0);

    await new Promise<void>((resolve) => {
      const src = audioCtxRef.current!.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtxRef.current!.destination);
      sourceRef.current = src;
      src.onended = () => { sourceRef.current = null; resolve(); };
      src.start();
    });
  }, []);

  const playText = useCallback(async (text: string): Promise<void> => {
    if (!apiKey) return;

    try {
      const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini TTS ${res.status}: ${body}`);
      }

      const json = await res.json();
      const part = json?.candidates?.[0]?.content?.parts?.[0];
      const pcmBase64 = part?.inlineData?.data;

      if (!pcmBase64) throw new Error('Gemini TTS: resposta sem áudio');

      await playPcm(pcmBase64);
    } catch (err: any) {
      const msg = err?.message ?? 'Erro Gemini TTS';
      console.warn('[GeminiTTS]', msg);
      onError?.(msg);
    }
  }, [apiKey, voice, playPcm, onError]);

  const processQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    setIsSpeaking(true);
    onSpeakStart?.();

    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      await playText(next);
      if (!playingRef.current) break;
    }

    playingRef.current = false;
    setIsSpeaking(false);
    onSpeakEnd?.();
  }, [playText, onSpeakStart, onSpeakEnd]);

  const speak = useCallback(async (text: string): Promise<boolean> => {
    if (!apiKey) return false;
    const cleaned = text.trim();
    if (!cleaned) return false;

    // Divide textos longos em sentenças para início mais rápido
    const sentences = cleaned.match(/[^.!?]+[.!?]*/g) ?? [cleaned];
    queueRef.current.push(...sentences.map(s => s.trim()).filter(Boolean));
    processQueue();
    return true;
  }, [apiKey, processQueue]);

  return { speak, stop, isSpeaking };
}
