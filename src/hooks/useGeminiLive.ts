// src/hooks/useGeminiLive.ts
// ✅ Busca web corrigida: Jina AI Search (resultados reais) + fallback DuckDuckGo

import { useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { useAppStore, VoiceName, VOICE_MAPPING } from '../store/useAppStore';
import { TOOL_DECLARATIONS, DELEGATED_TOOLS } from './geminiToolDeclarations';

export interface UseGeminiLiveProps {
  onToggleScreenSharing?: (enabled: boolean) => void;
  onChangeVoice?: (voice: VoiceName) => void;
  onOpenUrl?: (url: string) => void;
  onInteract?: (action: string, x?: number, y?: number, text?: string) => void;
  onMessage?: (msg: { role: 'user' | 'model'; text: string; imageUrl?: string }) => void;
  onToolCall?: (toolName: string, args: any) => void;
  isMuted?: boolean;
  systemInstruction?: string;
}

export const useGeminiLive = ({
  onToggleScreenSharing,
  onChangeVoice,
  onOpenUrl,
  onInteract,
  onMessage,
  onToolCall,
  isMuted = false,
  systemInstruction = ""
}: UseGeminiLiveProps) => {
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

  const sessionRef = useRef<any>(null);
  const isConnectedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef(isMuted);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const onToggleScreenSharingRef = useRef(onToggleScreenSharing);
  const onChangeVoiceRef = useRef(onChangeVoice);
  const onOpenUrlRef = useRef(onOpenUrl);
  const onInteractRef = useRef(onInteract);
  const onMessageRef = useRef(onMessage);
  const onToolCallRef = useRef(onToolCall);

  useEffect(() => {
    onToggleScreenSharingRef.current = onToggleScreenSharing;
    onChangeVoiceRef.current = onChangeVoice;
    onOpenUrlRef.current = onOpenUrl;
    onInteractRef.current = onInteract;
    onMessageRef.current = onMessage;
    onToolCallRef.current = onToolCall;
  }, [onToggleScreenSharing, onChangeVoice, onOpenUrl, onInteract, onMessage, onToolCall]);

  // ============================================================
  // 🎵 ÁUDIO
  // ============================================================

  const stopAudio = useCallback((isReconnecting = false) => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (inputAudioContextRef.current?.state !== 'closed') {
      inputAudioContextRef.current?.close().catch(console.error);
      inputAudioContextRef.current = null;
    }
    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    activeSourcesRef.current = [];
    if (!isReconnecting && audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close().catch(console.error);
      audioContextRef.current = null;
    }
    setIsListening(false);
    setIsSpeaking(false);
    audioQueue.current = [];
    nextStartTimeRef.current = 0;
  }, [setIsListening, setIsSpeaking]);

  const playNextChunk = useCallback(() => {
    if (audioQueue.current.length === 0 || !audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const chunk = audioQueue.current.shift()!;
    const audioBuffer = ctx.createBuffer(1, chunk.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < chunk.length; i++) channelData[i] = chunk[i] / 0x7FFF;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now + 0.02) nextStartTimeRef.current = now + 0.05;
    source.start(nextStartTimeRef.current);
    activeSourcesRef.current.push(source);
    nextStartTimeRef.current += audioBuffer.duration;
    setIsSpeaking(true);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      if (activeSourcesRef.current.length === 0 && audioQueue.current.length === 0) setIsSpeaking(false);
    };
  }, [setIsSpeaking]);

  const toBase64 = useCallback((buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK)
      binary += String.fromCharCode(...(bytes.subarray(i, i + CHUNK) as any));
    return window.btoa(binary);
  }, []);

  // ============================================================
  // 🌐 BUSCA WEB — CORRIGIDA
  // ============================================================

  /**
   * Busca via backend /api/web-search — resolve CORS e usa Jina AI Search
   * com fallback automático para DuckDuckGo no servidor.
   */
  const performWebSearch = useCallback(async (query: string, numResults = 5): Promise<string> => {
    try {
      const res = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, num_results: numResults })
      });

      if (!res.ok) throw new Error(`web-search API retornou ${res.status}`);

      const data = await res.json();

      // ✅ Jina: usa o texto bruto completo (mais contexto para o modelo)
      if (data.raw) {
        return `🔍 Resultados para "${query}":\n\n${data.raw}`;
      }

      // Resultados estruturados (Jina parseado ou DuckDuckGo)
      if (data.results && Array.isArray(data.results)) {
        if (data.results.length === 0) {
          return `⚠️ Não encontrei resultados para "${query}". Tente reformular a pergunta.`;
        }
        const formatted = data.results
          .map((r: any, i: number) =>
            `[${i + 1}] ${r.title}\n${r.description}${r.url ? `\nURL: ${r.url}` : ''}`
          )
          .join('\n\n');
        return `🔍 Resultados para "${query}":\n\n${formatted}`;
      }

      return `⚠️ Não encontrei resultados para "${query}".`;

    } catch (err: any) {
      console.error('performWebSearch error:', err);
      return `❌ Não foi possível realizar a busca por "${query}". Erro: ${err.message}`;
    }
  }, []);

  const readUrlContent = useCallback(async (rawUrl: string): Promise<string> => {
    const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    try {
      const res = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, action: 'read' })
      });
      if (!res.ok) throw new Error(`web-search API retornou ${res.status}`);
      const data = await res.json();
      const text = data.content || '';
      const trimmed = text.length > 5000 ? text.substring(0, 5000) + '\n\n⚠️ Conteúdo truncado.' : text;
      return `📄 Conteúdo de ${url}:\n\n${trimmed}`;
    } catch (err: any) {
      return `❌ Não foi possível ler "${url}". Dica: tente "search_web" para encontrar informações sobre o tópico.`;
    }
  }, []);

  // ============================================================
  // 🎨 GERAÇÃO DE IMAGEM
  // ============================================================

  const generateImage = useCallback(async (prompt: string, aspectRatio: "1:1" | "16:9" | "9:16" = "1:1") => {
    setIsThinking(true);
    try {
      const apiKey = storedApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key não encontrada.");
      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio } },
      });
      const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (!imagePart?.inlineData) throw new Error("Nenhuma imagem gerada.");
      const imageUrl = `data:image/png;base64,${imagePart.inlineData.data}`;
      addMessage({ role: 'model', text: `Imagem gerada para: "${prompt}"`, imageUrl });
      onMessageRef.current?.({ role: 'model', text: `Imagem gerada para: "${prompt}"`, imageUrl });
    } catch (err: any) {
      const msg = "Não consegui gerar a imagem. Verifique se sua chave API suporta geração de imagens.";
      addMessage({ role: 'model', text: msg });
      onMessageRef.current?.({ role: 'model', text: msg });
    } finally {
      setIsThinking(false);
    }
  }, [storedApiKey, addMessage, setIsThinking]);

  // ============================================================
  // 💬 ENVIO DE MENSAGEM (modo texto)
  // ============================================================

  const sendMessage = useCallback(async (text: string) => {
    addMessage({ role: 'user', text });
    onMessageRef.current?.({ role: 'user', text });
    setIsThinking(true);
    try {
      const contextHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));
      const IMAGE_KEYWORDS = ['gere uma imagem', 'crie uma imagem', 'gerar imagem', 'criar imagem', 'desenhe', 'faça uma imagem'];
      const lower = text.toLowerCase();
      const matchedKw = IMAGE_KEYWORDS.find(kw => lower.includes(kw));
      if (matchedKw) {
        const prompt = text.substring(lower.indexOf(matchedKw) + matchedKw.length).trim();
        if (prompt) { await generateImage(prompt); return; }
      }
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...contextHistory, { role: 'user', content: text }], systemInstruction })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }
      const { text: replyText } = await res.json();
      if (replyText) {
        addMessage({ role: 'model', text: replyText });
        onMessageRef.current?.({ role: 'model', text: replyText });
      }
    } catch (err: any) {
      const msg = err.message === "Groq API Key not found"
        ? "Configure sua chave Groq nas Configurações para usar o chat de texto."
        : "Ocorreu um erro ao processar sua mensagem.";
      addMessage({ role: 'model', text: msg });
      onMessageRef.current?.({ role: 'model', text: msg });
    } finally {
      setIsThinking(false);
    }
  }, [history, addMessage, setIsThinking, systemInstruction, generateImage]);

  // ============================================================
  // 🔌 CONEXÃO COM GEMINI LIVE
  // ============================================================

  const connect = useCallback(async (sysInstruction: string) => {
    if (isConnectedRef.current) {
      console.warn("Já conectado — ignorando connect() duplicado.");
      return;
    }
    try {
      setError(null);
      const apiKey = storedApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chave de API não encontrada. Configure nas Configurações.");

      const ai = new GoogleGenAI({ apiKey });

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      await audioContextRef.current.audioWorklet.addModule('/audio-processor.js');

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          ...(sysInstruction ? { systemInstruction: sysInstruction } : {}),
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_MAPPING[voice] || 'Kore' } },
          },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }]
        },
        callbacks: {
          onopen: () => {
            console.log("✅ Gemini Live conectado!");
            setIsConnected(true);
            isConnectedRef.current = true;
            setIsListening(true);
          },

          onmessage: async (message: any) => {
            const modelParts = message.serverContent?.modelTurn?.parts;
            if (modelParts) {
              setIsThinking(false);
              const textContent = modelParts.filter((p: any) => p.text).map((p: any) => p.text).join('');
              if (textContent) {
                addMessage({ role: 'model', text: textContent });
                onMessageRef.current?.({ role: 'model', text: textContent });
              }
              for (const part of modelParts) {
                if (part.inlineData?.data) {
                  const bin = atob(part.inlineData.data);
                  const bytes = new Uint8Array(bin.length);
                  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                  audioQueue.current.push(new Int16Array(bytes.buffer, 0, Math.floor(bin.length / 2)));
                  playNextChunk();
                }
              }
            }

            const userParts = message.serverContent?.userTurn?.parts;
            if (userParts) {
              const userText = userParts.filter((p: any) => p.text).map((p: any) => p.text).join('');
              if (userText) {
                addMessage({ role: 'user', text: userText });
                onMessageRef.current?.({ role: 'user', text: userText });
              }
            }

            if (message.toolCall) {
              setIsThinking(true);
              const session = await sessionPromise;
              const syncResponses: any[] = [];

              for (const call of message.toolCall.functionCalls) {
                const { name, args = {}, id } = call;

                if (DELEGATED_TOOLS.has(name)) {
                  onToolCallRef.current?.(name, args);
                  syncResponses.push({ name, id, response: { success: true } });
                  continue;
                }

                // ✅ BUSCA WEB CORRIGIDA:
                // O resultado da busca volta para o modelo via sendToolResponse.
                // O App.tsx é notificado via onToolCall SOMENTE para atualizar a UI,
                // mas NÃO deve mais abrir o Google ou interferir no fluxo.
                if (name === "search_web") {
                  performWebSearch(args.query, args.num_results ?? 5)
                    .then(content => {
                      // Notifica App para mostrar resultado na UI (opcional)
                      onToolCallRef.current?.(name, { ...args, result: content });
                      // Envia resultado ao modelo para ele responder com base nele
                      session.sendToolResponse({
                        functionResponses: [{ name, id, response: { success: true, content, query: args.query } }]
                      });
                    })
                    .catch(err => {
                      session.sendToolResponse({
                        functionResponses: [{ name, id, response: { success: false, error: String(err) } }]
                      });
                    });
                  continue;
                }

                if (name === "read_url_content") {
                  readUrlContent(args.url)
                    .then(content => {
                      onToolCallRef.current?.(name, args);
                      session.sendToolResponse({
                        functionResponses: [{ name, id, response: { success: true, content, url: args.url } }]
                      });
                    })
                    .catch(err => {
                      session.sendToolResponse({
                        functionResponses: [{ name, id, response: { success: false, error: String(err) } }]
                      });
                    });
                  continue;
                }

                if (name === "generate_image") {
                  generateImage(args.prompt, args.aspect_ratio ?? "1:1")
                    .then(() => session.sendToolResponse({
                      functionResponses: [{ name, id, response: { success: true } }]
                    }))
                    .catch(err => session.sendToolResponse({
                      functionResponses: [{ name, id, response: { success: false, error: String(err) } }]
                    }));
                  onToolCallRef.current?.(name, args);
                  continue;
                }

                switch (name) {
                  case "toggle_screen_sharing":
                    onToggleScreenSharingRef.current?.(args.enabled);
                    syncResponses.push({ name, id, response: { success: true } });
                    break;
                  case "open_url":
                    onOpenUrlRef.current?.(args.url);
                    syncResponses.push({ name, id, response: { success: true, message: `Abrindo: ${args.url}` } });
                    break;
                  case "change_voice":
                    onChangeVoiceRef.current?.(args.voice_name);
                    syncResponses.push({ name, id, response: { success: true } });
                    break;
                  case "interact_with_screen":
                    onInteractRef.current?.(args.action, args.x, args.y, args.text);
                    syncResponses.push({ name, id, response: { success: true } });
                    break;
                  case "mascot_control":
                    setMascotAction(args.action === 'click' ? 'clicking' : 'pointing');
                    setMascotTarget(args.target);
                    syncResponses.push({ name, id, response: { success: true } });
                    break;
                  case "complete_onboarding":
                    setOnboardingStep('completed');
                    syncResponses.push({ name, id, response: { success: true } });
                    break;
                  default:
                    console.warn(`Tool não implementada: ${name}`);
                    syncResponses.push({ name, id, response: { success: false, error: "Ferramenta não implementada." } });
                }
              }

              if (syncResponses.length > 0) {
                session.sendToolResponse({ functionResponses: syncResponses });
              }
              setIsThinking(false);
            }

            if (message.serverContent?.interrupted) {
              audioQueue.current = [];
              activeSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
              activeSourcesRef.current = [];
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },

          onclose: () => {
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null;
          },

          onerror: (err: any) => {
            console.error("Gemini Live error:", err);
            setError(`Erro na API Live: ${err.message || 'Erro desconhecido'}`);
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null;
          }
        }
      });

      sessionRef.current = sessionPromise;
      await sessionPromise;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;
      await inputCtx.audioWorklet.addModule('/audio-processor.js');
      const micSource = inputCtx.createMediaStreamSource(stream);
      const inputWorklet = new AudioWorkletNode(inputCtx, 'audio-processor');
      audioWorkletNodeRef.current = inputWorklet;
      micSource.connect(inputWorklet);

      let micBuffer: Int16Array[] = [];
      let micBufferSize = 0;
      const TARGET_BUFFER = 2048;

      inputWorklet.port.onmessage = (event: MessageEvent<Int16Array>) => {
        micBuffer.push(event.data);
        micBufferSize += event.data.length;
        if (micBufferSize >= TARGET_BUFFER) {
          const combined = new Int16Array(micBufferSize);
          let offset = 0;
          for (const chunk of micBuffer) { combined.set(chunk, offset); offset += chunk.length; }
          let sum = 0;
          for (let i = 0; i < combined.length; i++) sum += Math.abs(combined[i] / 0x7FFF);
          setVolume(sum / combined.length);
          if (!isMutedRef.current && sessionRef.current && isConnectedRef.current) {
            sessionRef.current.then((session: any) => {
              session.sendRealtimeInput({ audio: { data: toBase64(combined.buffer), mimeType: 'audio/pcm;rate=16000' } });
            }).catch((e: any) => console.error("Erro ao enviar áudio:", e));
          }
          micBuffer = [];
          micBufferSize = 0;
        }
      };

    } catch (err: any) {
      console.error("Falha na conexão:", err);
      setError(err.message);
      setIsConnected(false);
      isConnectedRef.current = false;
    }
  }, [
    voice, storedApiKey, stopAudio, playNextChunk, toBase64,
    setError, setIsConnected, setIsListening, setVolume,
    addMessage, setMascotAction, setMascotTarget, setOnboardingStep,
    performWebSearch, readUrlContent, generateImage
  ]);

  const startScreenSharing = useCallback(async () => {
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      setError("Compartilhamento de tela não suportado em dispositivos móveis.");
      return;
    }
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const sendFrame = async () => {
        if (!screenStreamRef.current?.active || !sessionRef.current) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        sessionRef.current.then((s: any) => s.sendRealtimeInput({ video: { data: base64, mimeType: 'image/jpeg' } })).catch(console.error);
        setTimeout(sendFrame, 1000);
      };
      sendFrame();
    } catch (e: any) {
      const msgs: Record<string, string> = {
        NotAllowedError: "Permissão negada. Verifique as configurações do navegador.",
        NotFoundError: "Nenhuma fonte de tela encontrada."
      };
      setError(msgs[e.name] ?? "Falha ao iniciar compartilhamento de tela.");
    }
  }, [setError]);

  const sendLiveMessage = useCallback((text: string) => {
    if (sessionRef.current && isConnectedRef.current) {
      setIsThinking(true);
      sessionRef.current.then((s: any) => s.sendRealtimeInput({ text })).catch(console.error);
    }
  }, [setIsThinking]);

  const sendFile = useCallback((base64Data: string, mimeType: string, prompt: string) => {
    if (sessionRef.current && isConnectedRef.current) {
      setIsThinking(true);
      sessionRef.current.then(async (s: any) => {
        await s.sendRealtimeInput({ video: { mimeType, data: base64Data } });
        setTimeout(() => s.sendRealtimeInput({ text: prompt }), 300);
      }).catch(console.error);
    }
  }, [setIsThinking]);

  const disconnect = useCallback((isReconnecting = false) => {
    sessionRef.current?.then((s: any) => s.close()).catch(console.error);
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    stopAudio(isReconnecting);
  }, [stopAudio]);

  return {
    isConnected, isSpeaking, isListening, isThinking, volume, error, history,
    connect, disconnect, startScreenSharing,
    sendMessage, sendLiveMessage, sendFile, generateImage
  };
};
