import { useRef, useState, useCallback } from 'react';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface UseElevenLabsOptions {
  /** Chave de API do ElevenLabs */
  apiKey: string;
  /** ID da voz escolhida no ElevenLabs */
  voiceId: string;
  /** Modelo — padrão: eleven_multilingual_v2 (melhor pro português) */
  model?: string;
  /** Chamado quando começa a falar */
  onSpeakStart?: () => void;
  /** Chamado quando termina de falar (ou é interrompido) */
  onSpeakEnd?: () => void;
  /** Chamado quando ocorre erro */
  onError?: (error: string) => void;
}

interface UseElevenLabsReturn {
  /** Fala um texto. Retorna false se apiKey/voiceId não configurados */
  speak: (text: string) => Promise<boolean>;
  /** Para a fala atual imediatamente */
  stop: () => void;
  /** true enquanto está reproduzindo áudio */
  isSpeaking: boolean;
  /** true enquanto está baixando/gerando o áudio */
  isLoading: boolean;
  /** Último erro ocorrido, ou null */
  error: string | null;
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useElevenLabs({
  apiKey,
  voiceId,
  model = 'eleven_multilingual_v2',
  onSpeakStart,
  onSpeakEnd,
  onError,
}: UseElevenLabsOptions): UseElevenLabsReturn {

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Referências internas — não causam re-render
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const queueRef       = useRef<string[]>([]);
  const isPlayingRef   = useRef(false);

  // ── Para o áudio atual e limpa a fila ──────────────────────────────────────
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

  // ── Baixa e reproduz um texto via streaming ────────────────────────────────
  const playText = useCallback(async (text: string): Promise<void> => {
    if (!apiKey || !voiceId) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Chama a API com streaming habilitado
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`ElevenLabs ${response.status}: ${errBody}`);
      }

      // 2. Lê o stream completo e cria um Blob de áudio
      // (streaming chunk-by-chunk via MediaSource é mais complexo e tem
      //  suporte irregular em Safari/iOS — usar Blob garante compatibilidade)
      const arrayBuffer = await response.arrayBuffer();
      const blob        = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url         = URL.createObjectURL(blob);

      setIsLoading(false);
      setIsSpeaking(true);
      isPlayingRef.current = true;
      onSpeakStart?.();

      // 3. Reproduz o áudio
      await new Promise<void>((resolve, reject) => {
        const audio    = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Erro ao reproduzir o áudio'));
        };

        audio.play().catch(reject);
      });

    } catch (err: any) {
      const msg = err?.message ?? 'Erro desconhecido no ElevenLabs';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsSpeaking(false);
      isPlayingRef.current = false;
      onSpeakEnd?.();
    }
  }, [apiKey, voiceId, model, onSpeakStart, onSpeakEnd, onError]);

  // ── Processa a fila de textos em ordem ────────────────────────────────────
  const processQueue = useCallback(async () => {
    // Se já está tocando, não inicia outro loop
    if (isPlayingRef.current) return;

    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      await playText(next);

      // Se stop() foi chamado durante a fala, para o loop
      if (!isPlayingRef.current && queueRef.current.length > 0) {
        queueRef.current = [];
        break;
      }
    }
  }, [playText]);

  // ── Ponto de entrada público: enfileira e dispara ─────────────────────────
  const speak = useCallback(async (text: string): Promise<boolean> => {
    // Sem credenciais → retorna false (Gemini assume o controle)
    if (!apiKey || !voiceId) return false;

    const cleaned = text.trim();
    if (!cleaned) return false;

    queueRef.current.push(cleaned);
    processQueue();
    return true;
  }, [apiKey, voiceId, processQueue]);

  return { speak, stop, isSpeaking, isLoading, error };
}
