import { useRef, useState, useCallback } from 'react';

// Vozes PT-BR disponíveis no Piper
export const PIPER_VOICES = [
  { id: 'pt_BR-faber-medium',   name: 'Faber',   desc: 'Masculina, natural — recomendada pt-BR' },
  { id: 'pt_BR-edresson-low',   name: 'Edresson', desc: 'Masculina, compacta e rápida' },
  { id: 'pt_PT-tugao-medium',   name: 'Tugão',   desc: 'Masculina, português europeu' },
  { id: 'en_US-amy-medium',     name: 'Amy',     desc: 'Feminina, inglês americano' },
  { id: 'en_US-lessac-medium',  name: 'Lessac',  desc: 'Feminina, inglês americano (alta qualidade)' },
];

interface UsePiperTTSOptions {
  /** URL do servidor Piper local — padrão http://localhost:5000 */
  serverUrl?: string;
  /** Voz ativa — ex: "pt_BR-faber-medium" */
  voice?: string;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  onError?: (error: string) => void;
}

interface UsePiperTTSReturn {
  speak: (text: string) => Promise<boolean>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
}

export function usePiperTTS({
  serverUrl = 'http://localhost:5000',
  voice = 'pt_BR-faber-medium',
  onSpeakStart,
  onSpeakEnd,
  onError,
}: UsePiperTTSOptions = {}): UsePiperTTSReturn {

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const queueRef     = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

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
    const base = serverUrl.replace(/\/$/, '');
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${base}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Piper ${response.status}: ${msg}`);
      }

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);

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
      const msg = err?.message ?? 'Erro desconhecido no Piper TTS';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsSpeaking(false);
      isPlayingRef.current = false;
      onSpeakEnd?.();
    }
  }, [serverUrl, voice, onSpeakStart, onSpeakEnd, onError]);

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
    const cleaned = text.trim();
    if (!cleaned) return false;
    queueRef.current.push(cleaned);
    processQueue();
    return true;
  }, [processQueue]);

  return { speak, stop, isSpeaking, isLoading, error };
}
