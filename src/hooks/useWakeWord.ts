// useWakeWord.ts — Wake word via Web Speech API
// Escuta continuamente por "osone" (ou o nome configurado) e chama onDetected()

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseWakeWordOptions {
  /** Palavras/frases que ativam o wake word (lowercase) */
  triggerWords: string[];
  /** Chamado quando o wake word é detectado */
  onDetected: () => void;
  /** Não escuta quando true (ex: já está conectado) */
  disabled?: boolean;
}

export interface UseWakeWordReturn {
  isListening: boolean;
  isSupported: boolean;
  lastHeard: string | null;
}

export function useWakeWord({
  triggerWords,
  onDetected,
  disabled = false,
}: UseWakeWordOptions): UseWakeWordReturn {
  const [isListening, setIsListening] = useState(false);
  const [lastHeard, setLastHeard]     = useState<string | null>(null);

  const recognitionRef  = useRef<any>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabledRef     = useRef(disabled);
  const onDetectedRef   = useRef(onDetected);
  const triggerRef      = useRef(triggerWords);
  const activeRef       = useRef(false);

  // Mantém refs atualizadas sem recriar o recognition
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  useEffect(() => { triggerRef.current = triggerWords; }, [triggerWords]);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!isSupported || disabledRef.current || activeRef.current) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();

    rec.lang = 'pt-BR';
    rec.continuous = false;      // reinicia automaticamente no onend
    rec.interimResults = false;
    rec.maxAlternatives = 5;

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: any) => {
      const results: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        for (let j = 0; j < event.results[i].length; j++) {
          results.push(event.results[i][j].transcript.toLowerCase().trim());
        }
      }
      const heard = results.join(' ');
      setLastHeard(heard);

      const triggered = triggerRef.current.some(word =>
        heard.includes(word.toLowerCase())
      );

      if (triggered && !disabledRef.current) {
        onDetectedRef.current();
      }
    };

    rec.onerror = (e: any) => {
      // 'no-speech' e 'aborted' são normais — só reinicia
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[WakeWord] erro:', e.error);
      }
    };

    rec.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      // Reinicia após 300ms se ainda ativo e não desabilitado
      if (activeRef.current && !disabledRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current && !disabledRef.current) start();
        }, 300);
      }
    };

    recognitionRef.current = rec;
    activeRef.current = true;

    try {
      rec.start();
    } catch (err) {
      console.warn('[WakeWord] start() falhou:', err);
      activeRef.current = false;
    }
  }, [isSupported]);  // 'start' é estável — só depende de isSupported

  // Liga/desliga quando disabled muda
  useEffect(() => {
    if (!isSupported) return;

    if (disabled) {
      stop();
    } else {
      start();
    }

    return () => stop();
  }, [disabled, isSupported, start, stop]);

  return { isListening, isSupported, lastHeard };
}
