import { useRef, useState, useCallback } from 'react';

export interface PiperVoice {
  id: string;
  name: string;
  desc: string;
  lang: string;
}

export const PIPER_VOICES: PiperVoice[] = [
  { id: 'pt_BR-faber-medium',        name: 'Faber',    desc: 'Português BR — masculino',    lang: 'pt-BR' },
  { id: 'pt_BR-edresson-low',        name: 'Edresson', desc: 'Português BR — masculino',    lang: 'pt-BR' },
  { id: 'pt_PT-tugão-medium',        name: 'Tugão',    desc: 'Português PT — masculino',    lang: 'pt-PT' },
  { id: 'en_US-lessac-medium',       name: 'Lessac',   desc: 'English US — feminino',       lang: 'en-US' },
  { id: 'en_GB-alan-medium',         name: 'Alan',     desc: 'English GB — masculino',      lang: 'en-GB' },
  { id: 'es_ES-carlfm-x_low',        name: 'Carl',     desc: 'Español ES — masculino',      lang: 'es-ES' },
  { id: 'fr_FR-siwis-medium',        name: 'Siwis',    desc: 'Français FR — feminino',      lang: 'fr-FR' },
  { id: 'de_DE-thorsten-medium',     name: 'Thorsten', desc: 'Deutsch DE — masculino',      lang: 'de-DE' },
];

interface UsePiperTTSOptions {
  serverUrl: string;
  voice: string;
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
  serverUrl,
  voice,
  onSpeakStart,
  onSpeakEnd,
  onError,
}: UsePiperTTSOptions): UsePiperTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const queueRef        = useRef<string[]>([]);
  const isPlayingRef    = useRef(false);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    queueRef.current  = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
    setIsLoading(false);
    onSpeakEnd?.();
  }, [onSpeakEnd]);

  const playText = useCallback(async (text: string): Promise<void> => {
    const url = serverUrl.replace(/\/$/, '');
    if (!url) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${url}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Piper ${response.status}: ${body}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob        = new Blob([arrayBuffer], { type: 'audio/wav' });
      const blobUrl     = URL.createObjectURL(blob);

      setIsLoading(false);
      setIsSpeaking(true);
      isPlayingRef.current = true;
      onSpeakStart?.();

      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(blobUrl);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(blobUrl); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Erro ao reproduzir Piper')); };
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
    const url = serverUrl.replace(/\/$/, '');
    if (!url) return false;
    const cleaned = text.trim();
    if (!cleaned) return false;
    queueRef.current.push(cleaned);
    processQueue();
    return true;
  }, [serverUrl, processQueue]);

  return { speak, stop, isSpeaking, isLoading, error };
}
