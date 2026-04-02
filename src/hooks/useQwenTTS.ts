import { useRef, useState, useCallback } from 'react';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type QwenVoice =
  | 'longxiaochun' | 'longxiaoxia' | 'longlaoshi' | 'longyue' | 'longxiaolin'
  | 'longshuo'     | 'longhua'     | 'longge'     | 'longjing' | 'longfei';

export const QWEN_VOICES: { id: QwenVoice; name: string; desc: string }[] = [
  { id: 'longxiaochun', name: 'Xiaochun', desc: 'Feminina, calorosa e natural (recomendada)' },
  { id: 'longxiaoxia',  name: 'Xiaoxia',  desc: 'Feminina, suave e tranquila' },
  { id: 'longlaoshi',   name: 'Laoshi',   desc: 'Feminina, clara e didática' },
  { id: 'longshuo',     name: 'Shuo',     desc: 'Masculina, natural e equilibrada' },
  { id: 'longhua',      name: 'Hua',      desc: 'Masculina, grave e confiante' },
];

interface UseQwenTTSOptions {
  apiKey: string;
  voice?: QwenVoice;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  onError?: (error: string) => void;
}

interface UseQwenTTSReturn {
  speak: (text: string) => Promise<boolean>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useQwenTTS({
  apiKey,
  voice = 'longxiaochun',
  onSpeakStart,
  onSpeakEnd,
  onError,
}: UseQwenTTSOptions): UseQwenTTSReturn {

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const queueRef       = useRef<string[]>([]);
  const isPlayingRef   = useRef(false);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    queueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
    setIsLoading(false);
    onSpeakEnd?.();
  }, [onSpeakEnd]);

  const playText = useCallback(async (text: string): Promise<void> => {
    if (!apiKey) return;
    setIsLoading(true);
    setError(null);

    try {
      // DashScope TTS API — modelo CosyVoice v2 (multilingual)
      const response = await fetch(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/synthesis',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-DashScope-Async': 'disable',   // modo síncrono — retorna áudio direto
          },
          body: JSON.stringify({
            model: 'cosyvoice-v2',
            input: { text, voice },
            parameters: { format: 'mp3', sample_rate: 22050 },
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Qwen TTS ${response.status}: ${errBody}`);
      }

      const contentType = response.headers.get('content-type') ?? '';

      let audioBlob: Blob;

      if (contentType.includes('application/json')) {
        // Algumas versões retornam JSON com campo "audio" em base64
        const data = await response.json();
        const b64 = data?.output?.audio ?? data?.audio;
        if (!b64) throw new Error('Resposta JSON sem campo de áudio.');
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
      } else {
        // Retorno direto binário (audio/mpeg)
        audioBlob = await response.blob();
      }

      const url = URL.createObjectURL(audioBlob);
      setIsLoading(false);
      setIsSpeaking(true);
      isPlayingRef.current = true;
      onSpeakStart?.();

      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Erro ao reproduzir áudio')); };
        audio.play().catch(reject);
      });

    } catch (err: any) {
      const msg = err?.message ?? 'Erro desconhecido no Qwen TTS';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsSpeaking(false);
      isPlayingRef.current = false;
      onSpeakEnd?.();
    }
  }, [apiKey, voice, onSpeakStart, onSpeakEnd, onError]);

  const processQueue = useCallback(async () => {
    if (isPlayingRef.current) return;
    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      await playText(next);
      if (!isPlayingRef.current && queueRef.current.length > 0) {
        queueRef.current = [];
        break;
      }
    }
  }, [playText]);

  const speak = useCallback(async (text: string): Promise<boolean> => {
    if (!apiKey) return false;
    const cleaned = text.trim();
    if (!cleaned) return false;
    queueRef.current.push(cleaned);
    processQueue();
    return true;
  }, [apiKey, processQueue]);

  return { speak, stop, isSpeaking, isLoading, error };
}
