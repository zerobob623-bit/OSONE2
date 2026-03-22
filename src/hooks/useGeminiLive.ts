import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { useAppStore, VoiceName, VOICE_MAPPING } from '../store/useAppStore';
import { useSemanticMemory } from '../hooks/useSemanticMemory';

export const useGeminiLive = ({
  onToggleScreenSharing,
  onChangeVoice,
  onOpenUrl,
  onInteract,
  onMessage,
  onToolCall,
  isMuted = false
}) => {

  const {
    voice,
    isConnected, setIsConnected,
    isSpeaking, setIsSpeaking,
    isListening, setIsListening,
    isThinking, setIsThinking,
    volume, setVolume,
    error, setError,
    history, addMessage,
    setMascotTarget,
    setMascotAction,
    setOnboardingStep,
    apiKey: storedApiKey
  } = useAppStore();

  const { retrieveRelevantContext, isLoading: ragLoading } = useSemanticMemory();

  const sessionRef = useRef<any>(null);
  const isConnectedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // 🔥 RAG híbrido (memória dinâmica)
  const enhanceWithRAG = useCallback(async (text: string) => {
    try {
      if (ragLoading) return text;

      const context = await retrieveRelevantContext(text, []);

      if (context && context.trim()) {
        const MAX_CONTEXT = 1500;
        const trimmed = context.slice(0, MAX_CONTEXT);

        return `CONTEXTO IMPORTANTE:\n${trimmed}\n\nUsuário: ${text}`;
      }

      return text;
    } catch (err) {
      console.error('[RAG ERROR]', err);
      return text;
    }
  }, [retrieveRelevantContext, ragLoading]);

  // 🔥 envio com memória em tempo real
  const sendMessage = useCallback(async (text: string) => {
    if (sessionRef.current && isConnectedRef.current) {
      setIsThinking(true);

      const enhancedText = await enhanceWithRAG(text);

      sessionRef.current.then((session: any) => {
        session.sendRealtimeInput({ text: enhancedText });
      });
    }
  }, [enhanceWithRAG]);

  // 🔊 reprodução de áudio
  const playNextChunk = useCallback(() => {
    if (!audioContextRef.current || audioQueue.current.length === 0) return;

    const ctx = audioContextRef.current;
    const chunk = audioQueue.current.shift()!;
    const buffer = ctx.createBuffer(1, chunk.length, 24000);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < chunk.length; i++) {
      data[i] = chunk[i] / 0x7FFF;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();

    setIsSpeaking(true);

    source.onended = () => {
      setIsSpeaking(false);
    };
  }, []);

  // 🔥 conexão com IA (com memória inicial)
  const connect = useCallback(async (systemInstruction: string) => {
    try {
      setError(null);

      const apiKey = storedApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key não encontrada");

      const ai = new GoogleGenAI({ apiKey });

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const enhancedInstruction = await enhanceWithRAG(systemInstruction);

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: VOICE_MAPPING[voice] || 'Kore'
              }
            }
          },
          systemInstruction: enhancedInstruction
        },
        callbacks: {

          onopen: () => {
            setIsConnected(true);
            isConnectedRef.current = true;
            setIsListening(true);
          },

          onmessage: async (msg: any) => {

            if (msg.serverContent?.modelTurn?.parts) {
              setIsThinking(false);

              const text = msg.serverContent.modelTurn.parts
                .filter((p: any) => p.text)
                .map((p: any) => p.text)
                .join('');

              if (text) {
                addMessage({ role: 'model', text });
                onMessage?.({ role: 'model', text });
              }

              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const bytes = Uint8Array.from(
                    atob(part.inlineData.data),
                    c => c.charCodeAt(0)
                  );
                  const int16 = new Int16Array(bytes.buffer);
                  audioQueue.current.push(int16);
                  playNextChunk();
                }
              }
            }

            if (msg.serverContent?.userTurn?.parts) {
              const userText = msg.serverContent.userTurn.parts
                .filter((p: any) => p.text)
                .map((p: any) => p.text)
                .join('');

              if (userText) {
                addMessage({ role: 'user', text: userText });
                onMessage?.({ role: 'user', text: userText });
              }
            }
          },

          onclose: () => {
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null;
          },

          onerror: (err: any) => {
            console.error("Erro:", err);
            setError(err.message);
            setIsConnected(false);
            isConnectedRef.current = false;
          }

        }
      });

      sessionRef.current = sessionPromise;

      // 🎤 captura de áudio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const source = inputCtx.createMediaStreamSource(stream);

      const processor = inputCtx.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (event) => {
        if (!sessionRef.current || !isConnectedRef.current || isMutedRef.current) return;

        const input = event.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(input.length);

        for (let i = 0; i < input.length; i++) {
          int16[i] = input[i] * 0x7FFF;
        }

        sessionRef.current.then((session: any) => {
          session.sendRealtimeInput({
            audio: {
              data: btoa(String.fromCharCode(...new Uint8Array(int16.buffer))),
              mimeType: 'audio/pcm;rate=16000'
            }
          });
        });
      };

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setIsConnected(false);
    }
  }, [voice, enhanceWithRAG]);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.then((s: any) => s.close());
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    setIsConnected(false);
    isConnectedRef.current = false;
  }, []);

  return {
    isConnected,
    isSpeaking,
    isListening,
    isThinking,
    volume,
    error,
    connect,
    disconnect,
    sendMessage,
    history
  };
};
