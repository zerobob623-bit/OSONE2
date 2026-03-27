// src/hooks/useGeminiLive.ts
// ✅ + Análise automática de tela (a cada troca de app)
// ✅ + Fala espontânea após 30s de silêncio

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

// ─── Constantes ──────────────────────────────────────────────────────────────
const SILENCE_TIMEOUT_MS = 60_000;       // 60s de silêncio → fala espontânea
const SCREEN_ANALYSIS_INTERVAL_MS = 2_000; // captura frame a cada 2s
const SCREEN_HASH_SAMPLE = 32;           // pixels amostrados para hash de tela

// Frases de iniciativa espontânea
const SPONTANEOUS_PROMPTS = [
  "Estou aqui se você precisar de algo.",
  "Posso te ajudar com alguma coisa agora?",
  "Você está bem? Já faz um tempo que não conversa.",
  "Se quiser pensar em voz alta, estou ouvindo.",
  "Tem algo em que eu possa ajudar?",
];

// Utilitário: similaridade entre hashes de frame
function computeHashSimilarity(hashA: string, hashB: string): number {
  const partsA = hashA.split(';').filter(Boolean);
  const partsB = hashB.split(';').filter(Boolean);
  if (partsA.length === 0 || partsB.length !== partsA.length) return 0;
  let matches = 0;
  for (let i = 0; i < partsA.length; i++) {
    if (partsA[i] === partsB[i]) matches++;
  }
  return matches / partsA.length;
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
    apiKey: storedApiKey,
    openaiApiKey,
    groqApiKey,
    chatProvider,
    chatModel,
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

  // ─── Refs para silêncio e análise de tela ────────────────────────────────
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScreenHashRef = useRef<string>('');
  const screenAnalysisActiveRef = useRef(false);
  const lastScreenChangeMsgRef = useRef<number>(0); // timestamp do último SISTEMA de troca de tela
  const screenFrameCountRef = useRef<number>(0);    // contador para keepalive de frame

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
      if (activeSourcesRef.current.length === 0 && audioQueue.current.length === 0) {
        setIsSpeaking(false);
      }
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
  // 🔕 SILÊNCIO → FALA ESPONTÂNEA
  // Reinicia o timer toda vez que há atividade
  // Após 30s sem atividade, a IA inicia conversa sozinha
  // ============================================================

  const stopSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    stopSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (!isConnectedRef.current || !sessionRef.current) return;
      // Não interrompe se a IA já está falando ou processando
      if (activeSourcesRef.current.length > 0 || useAppStore.getState().isThinking) {
        resetSilenceTimer();
        return;
      }
      const prompt = SPONTANEOUS_PROMPTS[Math.floor(Math.random() * SPONTANEOUS_PROMPTS.length)];
      console.log(`[silêncio] ${SILENCE_TIMEOUT_MS / 1000}s — iniciando fala espontânea`);
      sessionRef.current.then((session: any) => {
        if (!isConnectedRef.current) return;
        try { session.sendRealtimeInput({ text: `[SISTEMA: O usuário está em silêncio há ${SILENCE_TIMEOUT_MS / 1000} segundos. Inicie a conversa naturalmente. Sugestão: "${prompt}" — mas use seu próprio estilo e personalidade.]` }); }
        catch (e) { /* WebSocket fechado — ignora */ }
      }).catch(() => {});
    }, SILENCE_TIMEOUT_MS);
  }, [stopSilenceTimer]);

  // ============================================================
  // 🌐 BUSCA WEB
  // ============================================================

  const performWebSearch = useCallback(async (query: string, numResults = 5): Promise<string> => {
    try {
      const res = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, num_results: numResults })
      });
      if (!res.ok) throw new Error(`web-search API retornou ${res.status}`);
      const data = await res.json();
      if (data.raw) return `🔍 Resultados para "${query}":\n\n${data.raw}`;
      if (data.results?.length) {
        const formatted = data.results
          .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.description}${r.url ? `\nURL: ${r.url}` : ''}`)
          .join('\n\n');
        return `🔍 Resultados para "${query}":\n\n${formatted}`;
      }
      return `⚠️ Não encontrei resultados para "${query}".`;
    } catch (err: any) {
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
    } catch {
      return `❌ Não foi possível ler "${url}".`;
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
    } catch {
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
    resetSilenceTimer();
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
      let replyText = '';
      const activeKey = chatProvider === 'groq' ? groqApiKey : openaiApiKey;
      if (activeKey) {
        // Chama API diretamente do browser (sem servidor)
        const baseUrl = chatProvider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';
        const defaultModel = chatProvider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4.1-mini';
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeKey}` },
          body: JSON.stringify({
            model: chatModel || defaultModel,
            messages: [
              ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
              ...contextHistory,
              { role: 'user', content: text },
            ],
            max_tokens: 1024,
            temperature: 0.75,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as any).error?.message || `${chatProvider} ${res.status}`);
        }
        const data: any = await res.json();
        replyText = data.choices?.[0]?.message?.content || '';
      } else {
        // Fallback: usa rota do servidor
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...contextHistory, { role: 'user', content: text }], systemInstruction }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as any).error || `Server error: ${res.status}`);
        }
        const data = await res.json();
        replyText = data.text || '';
      }
      if (replyText) {
        addMessage({ role: 'model', text: replyText });
        onMessageRef.current?.({ role: 'model', text: replyText });
      }
    } catch (err: any) {
      const msg = err.message?.includes("OPENAI_API_KEY")
        ? "OPENAI_API_KEY não configurada nas variáveis de ambiente do servidor."
        : `Erro ao processar: ${err.message || 'Erro desconhecido'}`;
      addMessage({ role: 'model', text: msg });
      onMessageRef.current?.({ role: 'model', text: msg });
    } finally {
      setIsThinking(false);
    }
  }, [history, addMessage, setIsThinking, systemInstruction, generateImage, resetSilenceTimer]);

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
            resetSilenceTimer(); // ✅ inicia timer ao conectar
          },

          onmessage: async (message: any) => {
            const modelParts = message.serverContent?.modelTurn?.parts;
            if (modelParts) {
              setIsThinking(false);
              resetSilenceTimer(); // ✅ IA falou → reinicia timer
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
                resetSilenceTimer(); // ✅ usuário falou → reinicia timer
                addMessage({ role: 'user', text: userText });
                onMessageRef.current?.({ role: 'user', text: userText });
              }
            }

            if (message.toolCall) {
              setIsThinking(true);
              const session = await sessionPromise;
              const syncResponses: any[] = [];
              let asyncPending = 0;

              // Fora do loop: uma única instância reutilizada por todas as ferramentas
              const safeSend = (response: any) => {
                if (!isConnectedRef.current) return;
                try { session.sendToolResponse({ functionResponses: [response] }); }
                catch (e) { console.warn('[tool] sendToolResponse ignorado (conexão encerrada):', e); }
              };

              // Só desativa isThinking quando todas as ferramentas assíncronas concluírem
              const finishAsync = () => {
                asyncPending--;
                if (asyncPending === 0) setIsThinking(false);
              };

              for (const call of message.toolCall.functionCalls) {
                const { name, args = {}, id } = call;

                if (name === "show_lyrics") {
                  onToolCallRef.current?.(name, args);
                  syncResponses.push({ name, id, response: { success: true, message: "Letra exibida com sucesso! CANTE agora usando sua voz com melodia, ritmo e entonação musical. Toda a letra foi enviada de uma vez — cante do início ao fim sem chamar nenhuma outra ferramenta." } });
                  continue;
                }

                if (DELEGATED_TOOLS.has(name)) {
                  onToolCallRef.current?.(name, args);
                  syncResponses.push({ name, id, response: { success: true } });
                  continue;
                }

                if (name === "search_web") {
                  asyncPending++;
                  performWebSearch(args.query, args.num_results ?? 5)
                    .then(content => {
                      onToolCallRef.current?.(name, { ...args, result: content });
                      safeSend({ name, id, response: { success: true, content, query: args.query } });
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name === "read_url_content") {
                  asyncPending++;
                  readUrlContent(args.url)
                    .then(content => {
                      onToolCallRef.current?.(name, args);
                      safeSend({ name, id, response: { success: true, content, url: args.url } });
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name === "control_device") {
                  asyncPending++;
                  const { tuyaClientId, tuyaSecret, tuyaRegion } = useAppStore.getState();
                  fetch('/api/tuya/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      device_name: args.device_name,
                      action: args.action,
                      value: args.value,
                      clientId: tuyaClientId,
                      secret: tuyaSecret,
                      region: tuyaRegion || 'us',
                    })
                  })
                    .then(r => r.json())
                    .then(data => {
                      onToolCallRef.current?.(name, { ...args, result: data });
                      if (data.success) {
                        const msg = args.action === 'list'
                          ? `Dispositivos: ${data.devices}`
                          : `${data.device}: ${args.action === 'on' ? 'ligado' : args.action === 'off' ? 'desligado' : args.action}`;
                        safeSend({ name, id, response: { success: true, result: msg } });
                      } else {
                        safeSend({ name, id, response: { success: false, error: data.error } });
                      }
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name === "send_whatsapp") {
                  asyncPending++;
                  const waPhone = useAppStore.getState().myWhatsappNumber;
                  fetch('/api/whatsapp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: args.message, phone: waPhone })
                  })
                    .then(r => r.json())
                    .then(data => {
                      onToolCallRef.current?.(name, args);
                      safeSend({ name, id, response: data.success ? { success: true } : { success: false, error: data.error } });
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name === "generate_image") {
                  asyncPending++;
                  generateImage(args.prompt, args.aspect_ratio ?? "1:1")
                    .then(() => safeSend({ name, id, response: { success: true } }))
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
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
                    syncResponses.push({ name, id, response: { success: true } });
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
              // Só desativa thinking se não há ferramentas assíncronas pendentes
              if (asyncPending === 0) setIsThinking(false);
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
            stopSilenceTimer();
          },

          onerror: (err: any) => {
            console.error("Gemini Live error:", err);
            setError(`Erro na API Live: ${err.message || 'Erro desconhecido'}`);
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null;
            stopSilenceTimer();
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
          // ✅ Detecta fala pelo volume para reiniciar timer
          if (sum / combined.length > 0.01) resetSilenceTimer();
          if (!isMutedRef.current && sessionRef.current && isConnectedRef.current) {
            sessionRef.current.then((session: any) => {
              if (!isConnectedRef.current) return;
              try { session.sendRealtimeInput({ audio: { data: toBase64(combined.buffer), mimeType: 'audio/pcm;rate=16000' } }); }
              catch (e) { /* WebSocket fechado — ignora */ }
            }).catch(() => {});
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
    performWebSearch, readUrlContent, generateImage,
    resetSilenceTimer, stopSilenceTimer
  ]);

  // ============================================================
  // 📺 COMPARTILHAMENTO DE TELA — com análise automática
  // Detecta troca de tela comparando hash de pixels
  // Avisa a IA quando o usuário muda de app
  // ============================================================

  const startScreenSharing = useCallback(async () => {
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      setError("Compartilhamento de tela não suportado em dispositivos móveis.");
      return;
    }
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      screenAnalysisActiveRef.current = true;
      lastScreenHashRef.current = '';

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Avisa a IA que o compartilhamento começou
      if (sessionRef.current && isConnectedRef.current) {
        sessionRef.current.then((session: any) => {
          if (!isConnectedRef.current) return;
          try { session.sendRealtimeInput({ text: '[SISTEMA: Compartilhamento de tela iniciado. Você pode ver a tela do usuário. Analise o que está sendo exibido e comente proativamente: descreva o que vê, sugira ações, alerte sobre erros, e quando o usuário trocar de app/tela analise o novo contexto automaticamente.]' }); }
          catch (e) { /* WebSocket fechado — ignora */ }
        }).catch(() => {});
      }

      const sendFrame = async () => {
        if (!screenStreamRef.current?.active || !sessionRef.current || !screenAnalysisActiveRef.current) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        // ✅ Detecta troca de tela ANTES de enviar frame
        const currentHash = computeCurrentHash(canvas, ctx);
        const screenChanged = currentHash && lastScreenHashRef.current &&
          computeHashSimilarity(lastScreenHashRef.current, currentHash) < 0.6;

        screenFrameCountRef.current++;
        const isKeepalive = screenFrameCountRef.current % 5 === 0; // envia a cada 5 ciclos (~10s) mesmo sem mudança

        // Só envia frame se a tela mudou ou é keepalive
        if ((screenChanged || isKeepalive) && isConnectedRef.current) {
          const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
          sessionRef.current.then((session: any) => {
            if (!isConnectedRef.current) return;
            try { session.sendRealtimeInput({ video: { data: base64, mimeType: 'image/jpeg' } }); }
            catch (e) { /* WebSocket fechado — ignora */ }
          }).catch(() => {});
        }

        // Mensagem SISTEMA de troca de tela com debounce de 5s
        if (screenChanged) {
          const now = Date.now();
          if (now - lastScreenChangeMsgRef.current > 5_000) {
            lastScreenChangeMsgRef.current = now;
            console.log('[tela] Troca detectada — solicitando análise automática');
            sessionRef.current?.then((session: any) => {
              if (!isConnectedRef.current) return;
              try { session.sendRealtimeInput({ text: '[SISTEMA: O usuário acabou de trocar de tela ou abrir outro aplicativo. Analise o novo contexto que está sendo exibido e comente o que você vê. Se houver algo relevante, útil ou que mereça atenção, diga proativamente.]' }); }
              catch (e) { /* WebSocket fechado — ignora */ }
            }).catch(() => {});
          }
        }

        if (currentHash) lastScreenHashRef.current = currentHash;
        setTimeout(sendFrame, SCREEN_ANALYSIS_INTERVAL_MS);
      };

      sendFrame();

      // Para ao encerrar stream
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        screenAnalysisActiveRef.current = false;
        lastScreenHashRef.current = '';
        if (sessionRef.current && isConnectedRef.current) {
          sessionRef.current.then((session: any) => {
            if (!isConnectedRef.current) return;
            try { session.sendRealtimeInput({ text: '[SISTEMA: Compartilhamento de tela encerrado.]' }); }
            catch (e) { /* WebSocket fechado — ignora */ }
          }).catch(() => {});
        }
      });

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
      resetSilenceTimer();
      setIsThinking(true);
      sessionRef.current.then((s: any) => s.sendRealtimeInput({ text })).catch(console.error);
    }
  }, [setIsThinking, resetSilenceTimer]);

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
    screenAnalysisActiveRef.current = false;
    lastScreenHashRef.current = '';
    stopSilenceTimer();
    sessionRef.current?.then((s: any) => s.close()).catch(console.error);
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    stopAudio(isReconnecting);
  }, [stopAudio, stopSilenceTimer]);

  return {
    isConnected, isSpeaking, isListening, isThinking, volume, error, history,
    connect, disconnect, startScreenSharing,
    sendMessage, sendLiveMessage, sendFile, generateImage
  };
};

// ─── Computa hash rápido de um canvas para detectar troca de tela ────────────
function computeCurrentHash(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): string {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return '';
  const step = Math.max(1, Math.floor(Math.min(w, h) / SCREEN_HASH_SAMPLE));
  let hash = '';
  for (let y = 0; y < h; y += step * 4) {
    for (let x = 0; x < w; x += step * 4) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      hash += `${d[0]},${d[1]},${d[2]};`;
    }
  }
  return hash;
}
