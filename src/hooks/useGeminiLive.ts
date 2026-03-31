// src/hooks/useGeminiLive.ts
// ✅ + Análise automática de tela (a cada troca de app)
// ✅ + Fala espontânea após 30s de silêncio

import { useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { useAppStore, VoiceName, VOICE_MAPPING } from '../store/useAppStore';
import { TOOL_DECLARATIONS, DELEGATED_TOOLS, buildCustomToolDeclarations } from './geminiToolDeclarations';

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
const SCREEN_ANALYSIS_INTERVAL_MS = 3_000; // envia frame a cada 3s durante screen share

// Frases de iniciativa espontânea
const SPONTANEOUS_PROMPTS = [
  "Estou aqui se você precisar de algo.",
  "Posso te ajudar com alguma coisa agora?",
  "Você está bem? Já faz um tempo que não conversa.",
  "Se quiser pensar em voz alta, estou ouvindo.",
  "Tem algo em que eu possa ajudar?",
];

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
  const isConnectingRef = useRef(false);  // ← previne double-connect durante handshake
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
  const screenAnalysisActiveRef = useRef(false);

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
      audioWorkletNodeRef.current.port.onmessage = null; // ← para envios residuais
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

    if (activeSourcesRef.current.length > 0 || useAppStore.getState().isThinking) {
      resetSilenceTimer();
      return;
    }

    const prompt = SPONTANEOUS_PROMPTS[
      Math.floor(Math.random() * SPONTANEOUS_PROMPTS.length)
    ];

    console.log(`[silêncio] ${SILENCE_TIMEOUT_MS / 1000}s — iniciando fala espontânea`);

    sessionRef.current
      .then((session: any) => {
        if (!isConnectedRef.current) return;

        try {
          session.sendRealtimeInput({
            text: `[SISTEMA: O usuário está em silêncio há ${SILENCE_TIMEOUT_MS / 1000} segundos. Inicie a conversa naturalmente. Sugestão: "${prompt}"]`
          });
        } catch (e) {}
      })
      .catch(() => {});

  }, SILENCE_TIMEOUT_MS);

const resetSilenceTimer = useCallback(() => {
  stopSilenceTimer();

  silenceTimerRef.current = setTimeout(() => {
    if (!isConnectedRef.current || !sessionRef.current) return;

    const prompt = SPONTANEOUS_PROMPTS[
      Math.floor(Math.random() * SPONTANEOUS_PROMPTS.length)
    ];

    sessionRef.current
      .then((session: any) => {
        if (!isConnectedRef.current) return;

        try {
          session.sendRealtimeInput({
            text: `[SISTEMA: O usuário está em silêncio há ${SILENCE_TIMEOUT_MS / 1000} segundos. Inicie a conversa naturalmente. Sugestão: "${prompt}"]`
          });
        } catch (e) {}
      })
      .catch(() => {});
      
  }, SILENCE_TIMEOUT_MS);

}, [stopSilenceTimer]);
    }, SILENCE_TIMEOUT_MS);
  }, [stopSilenceTimer]);

  // ============================================================
  // 🌐 BUSCA WEB
  // ============================================================

  const fetchT = useCallback(async (url: string, ms = 12_000): Promise<Response> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) { clearTimeout(t); throw e; }
  }, []);

  const wikiSearch = useCallback(async (query: string, lang: 'pt' | 'en', n: number): Promise<string> => {
    const enc = encodeURIComponent(query);
    const res = await fetchT(
      `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${enc}&limit=${n}&format=json&origin=*`
    );
    if (!res.ok) throw new Error(`Wiki-${lang} ${res.status}`);
    const [, titles, descs] = await res.json() as [string, string[], string[], string[]];
    if (!titles.length) return '';

    const summaryLines = await Promise.all(
      titles.slice(0, 2).map(async (title: string) => {
        try {
          const sr = await fetchT(
            `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
          );
          if (!sr.ok) return null;
          const sd = await sr.json();
          return sd.extract ? `**${title}**: ${sd.extract}` : null;
        } catch { return null; }
      })
    );

    const lines: string[] = [];
    summaryLines.forEach((s, i) => {
      if (s) lines.push(s);
      else if (descs[i]) lines.push(`**${titles[i]}**: ${descs[i]}`);
    });
    titles.slice(2).forEach((t, i) => {
      if (descs[i + 2]) lines.push(`${t}: ${descs[i + 2]}`);
    });

    return lines.join('\n\n');
  }, [fetchT]);

  const performWebSearch = useCallback(async (query: string, numResults = 5): Promise<string> => {
    const enc = encodeURIComponent(query);
    const parts: string[] = [];

    try {
      const res = await fetchT(
        `https://api.duckduckgo.com/?q=${enc}&format=json&no_html=1&skip_disambig=1`
      );
      if (res.ok) {
        const d = await res.json();
        if (d.Answer)       parts.push(`📌 ${d.Answer}`);
        if (d.AbstractText) parts.push(`${d.AbstractText}${d.AbstractURL ? '\nFonte: ' + d.AbstractURL : ''}`);
        if (d.Definition)   parts.push(`Definição: ${d.Definition}`);
      }
    } catch (e: any) { console.warn('[search] DDG:', e.message); }

    try {
      const ptResult = await wikiSearch(query, 'pt', numResults);
      if (ptResult) parts.push(ptResult);
    } catch (e: any) { console.warn('[search] Wiki-PT:', e.message); }

    if (parts.length === 0) {
      try {
        const enResult = await wikiSearch(query, 'en', numResults);
        if (enResult) parts.push(enResult);
      } catch (e: any) { console.warn('[search] Wiki-EN:', e.message); }
    }

    if (parts.length === 0) return `⚠️ Nenhum resultado encontrado para "${query}".`;
    return `🔍 "${query}":\n\n${parts.join('\n\n').substring(0, 6000)}`;
  }, [fetchT, wikiSearch]);

  const readUrlContent = useCallback(async (rawUrl: string): Promise<string> => {
    const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    try {
      const res = await fetchT(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const html: string = data.contents ?? '';
      const text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      const trimmed = text.length > 5000 ? text.substring(0, 5000) + '\n\n⚠️ Conteúdo truncado.' : text;
      return `📄 ${url}:\n\n${trimmed}`;
    } catch (err: any) {
      return `❌ Não foi possível ler "${url}". Erro: ${err.message}`;
    }
  }, [fetchT]);

  // ============================================================
  // 🎨 GERAÇÃO DE IMAGEM
  // ============================================================

  const generateImage = useCallback(async (prompt: string, aspectRatio: "1:1" | "16:9" | "9:16" = "1:1") => {
    setIsThinking(true);
    try {
      const sizeMap: Record<string, string> = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' };
      const [w, h] = (sizeMap[aspectRatio] || '1024x1024').split('x');
      let imageUrl: string | null = null;
      let source = '';

      if (openaiApiKey) {
        try {
          const resp = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
            body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: `${w}x${h}`, response_format: 'url' }),
          });
          const data = await resp.json();
          if (resp.ok && data.data?.[0]?.url) {
            imageUrl = data.data[0].url;
            source = 'DALL-E 3';
          }
        } catch { /* cai para fallback */ }
      }

      if (!imageUrl) {
        imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&enhance=true&model=flux`;
        source = 'Pollinations (grátis)';
      }

      addMessage({ role: 'model', text: `Imagem gerada para: "${prompt}" · via ${source}`, imageUrl });
      onMessageRef.current?.({ role: 'model', text: `Imagem gerada para: "${prompt}" · via ${source}`, imageUrl });
    } catch (e: any) {
      const msg = `Não consegui gerar a imagem: ${e.message}`;
      addMessage({ role: 'model', text: msg });
      onMessageRef.current?.({ role: 'model', text: msg });
    } finally {
      setIsThinking(false);
    }
  }, [openaiApiKey, addMessage, setIsThinking]);

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
    // ✅ CORREÇÃO: inclui sessionRef.current no guard para evitar dupla conexão
    if (isConnectedRef.current || isConnectingRef.current || sessionRef.current) {
      console.warn("Já conectado/conectando — ignorando connect() duplicado.");
      return;
    }
    isConnectingRef.current = true;
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
        model: "gemini-live-2.5-flash-native-audio",
        config: {
          responseModalities: [Modality.AUDIO],
          ...(sysInstruction ? { systemInstruction: sysInstruction } : {}),
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_MAPPING[voice] || 'Kore' } },
          },
          tools: [
            { functionDeclarations: [...TOOL_DECLARATIONS, ...buildCustomToolDeclarations(useAppStore.getState().customSkills)] },
            { googleSearch: {} } as any,
          ]
        },
        callbacks: {
          onopen: () => {
            console.log("✅ Gemini Live conectado!");
            isConnectingRef.current = false;
            setIsConnected(true);
            isConnectedRef.current = true;
            setIsListening(true);
            resetSilenceTimer();
          },

          onmessage: async (message: any) => {
            const modelParts = message.serverContent?.modelTurn?.parts;
            if (modelParts) {
              setIsThinking(false);
              resetSilenceTimer();
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
                resetSilenceTimer();
                addMessage({ role: 'user', text: userText });
                onMessageRef.current?.({ role: 'user', text: userText });
              }
            }

            if (message.toolCall) {
              setIsThinking(true);
              const session = await sessionPromise;
              const syncResponses: any[] = [];
              let asyncPending = 0;

              const safeSend = (response: any) => {
                if (!isConnectedRef.current) return;
                try { session.sendToolResponse({ functionResponses: [response] }); }
                catch (e) { console.warn('[tool] sendToolResponse ignorado (conexão encerrada):', e); }
              };

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
                  onToolCallRef.current?.('search_web_start', { query: args.query });
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

                if (name === "control_pc") {
                  asyncPending++;
                  fetch('/api/pc/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: args.action, ...args }),
                  })
                    .then(r => r.json())
                    .then(async (data) => {
                      if (data.image) {
                        onToolCallRef.current?.(name, {
                          action: args.action,
                          imageUrl: `data:${data.mimeType};base64,${data.image}`,
                        });
                        const sess = await sessionPromise;
                        if (isConnectedRef.current) {
                          try {
                            sess.sendRealtimeInput({ video: { data: data.image, mimeType: data.mimeType } });
                            sess.sendRealtimeInput({ text: '[Sistema: Screenshot capturado e enviado como input visual. Descreva detalhadamente o que você está vendo na tela antes de agir.]' });
                          } catch {}
                        }
                        safeSend({ name, id, response: { success: true, message: 'Screenshot capturado — imagem enviada para sua visão.' } });
                      } else {
                        onToolCallRef.current?.(name, { action: args.action, result: data });
                        safeSend({ name, id, response: data });
                      }
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name === "control_device") {
                  asyncPending++;
                  const { tuyaClientId, tuyaSecret, tuyaRegion, tuyaUserId } = useAppStore.getState();
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
                      userId: tuyaUserId || '',
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
                  const { myWhatsappNumber, whatsappContacts } = useAppStore.getState();
                  let resolvedPhone = (args.phone || myWhatsappNumber || '').replace(/\D/g, '');
                  if (args.contact_name) {
                    const found = whatsappContacts.find(c =>
                      c.name.toLowerCase().includes(args.contact_name.toLowerCase()) ||
                      args.contact_name.toLowerCase().includes(c.name.toLowerCase())
                    );
                    if (found) resolvedPhone = found.phone.replace(/\D/g, '');
                  }
                  const contactLabel = args.contact_name || resolvedPhone;
                  fetch('/api/whatsapp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: args.message, phone: resolvedPhone })
                  })
                    .then(r => r.json())
                    .then(data => {
                      onToolCallRef.current?.(name, { ...args, contact: contactLabel });
                      safeSend({ name, id, response: data.success ? { success: true, to: contactLabel } : { success: false, error: data.error } });
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name === "send_whatsapp_audio") {
                  asyncPending++;
                  const { myWhatsappNumber, whatsappContacts } = useAppStore.getState();
                  let resolvedPhone = (args.phone || myWhatsappNumber || '').replace(/\D/g, '');
                  if (args.contact_name) {
                    const found = whatsappContacts.find(c =>
                      c.name.toLowerCase().includes(args.contact_name.toLowerCase()) ||
                      args.contact_name.toLowerCase().includes(c.name.toLowerCase())
                    );
                    if (found) resolvedPhone = found.phone.replace(/\D/g, '');
                  }
                  const contactLabel = args.contact_name || resolvedPhone;
                  fetch('/api/whatsapp/send-audio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: args.text, phone: resolvedPhone })
                  })
                    .then(r => r.json())
                    .then(data => {
                      onToolCallRef.current?.(name, { ...args, contact: contactLabel });
                      safeSend({ name, id, response: data.success ? { success: true, to: contactLabel } : { success: false, error: data.error } });
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name === "send_whatsapp_image") {
                  asyncPending++;
                  const { myWhatsappNumber, whatsappContacts } = useAppStore.getState();
                  let resolvedPhone = (args.phone || myWhatsappNumber || '').replace(/\D/g, '');
                  if (args.contact_name) {
                    const found = whatsappContacts.find((c: any) =>
                      c.name.toLowerCase().includes(args.contact_name.toLowerCase()) ||
                      args.contact_name.toLowerCase().includes(c.name.toLowerCase())
                    );
                    if (found) resolvedPhone = found.phone.replace(/\D/g, '');
                  }
                  const contactLabel = args.contact_name || resolvedPhone;
                  fetch('/api/whatsapp/send-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageUrl: args.imageUrl, caption: args.caption, phone: resolvedPhone })
                  })
                    .then(r => r.json())
                    .then(data => {
                      onToolCallRef.current?.(name, { ...args, contact: contactLabel });
                      safeSend({ name, id, response: data.success ? { success: true, to: contactLabel } : { success: false, error: data.error } });
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name === 'self_read_code' || name === 'self_write_code' || name === 'self_list_files' || name === 'self_git_push') {
                  asyncPending++;
                  const endpoint = name === 'self_read_code' ? '/api/code/read'
                    : name === 'self_write_code' ? '/api/code/write'
                    : name === 'self_list_files' ? '/api/code/list'
                    : '/api/code/git-push';
                  fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(args)
                  })
                    .then(r => r.json())
                    .then(data => {
                      onToolCallRef.current?.(name, args);
                      safeSend({ name, id, response: data.error ? { success: false, error: data.error } : { success: true, result: typeof data === 'string' ? data : JSON.stringify(data) } });
                    })
                    .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                    .finally(finishAsync);
                  continue;
                }

                if (name.startsWith('skill_')) {
                  asyncPending++;
                  const skillId = name.replace('skill_', '');
                  const skill = useAppStore.getState().customSkills.find((s: any) => s.id === skillId && s.active);
                  if (!skill) {
                    safeSend({ name, id, response: { success: false, error: 'Habilidade não encontrada ou desativada.' } });
                    finishAsync();
                  } else {
                    fetch('/api/skill/invoke', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ webhookUrl: skill.webhookUrl, method: skill.method, params: args })
                    })
                      .then(r => r.json())
                      .then(data => {
                        onToolCallRef.current?.(name, { skillName: skill.displayName, ...args });
                        safeSend({ name, id, response: { success: true, result: typeof data === 'string' ? data : JSON.stringify(data) } });
                      })
                      .catch(err => safeSend({ name, id, response: { success: false, error: String(err) } }))
                      .finally(finishAsync);
                  }
                  continue;
                }

                if (name === "alexa_control") {
                  asyncPending++;
                  fetch('/api/alexa/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: args.command, device: args.device })
                  })
                    .then(r => r.json())
                    .then(data => {
                      onToolCallRef.current?.(name, args);
                      safeSend({ name, id, response: data.success ? { success: true, result: data.message } : { success: false, error: data.error } });
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
            isConnectingRef.current = false;
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null; // ✅ limpa ref para liberar guard
            stopSilenceTimer();
          },

          onerror: (err: any) => {
            console.error("Gemini Live error:", err);
            isConnectingRef.current = false;
            setError(`Erro na API Live: ${err.message || 'Erro desconhecido'}`);
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null; // ✅ limpa ref para liberar guard
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
      isConnectingRef.current = false;
      setError(err.message);
      setIsConnected(false);
      isConnectedRef.current = false;
      sessionRef.current = null; // ✅ limpa ref em caso de falha
    }
  }, [
    voice, storedApiKey, stopAudio, playNextChunk, toBase64,
    setError, setIsConnected, setIsListening, setVolume,
    addMessage, setMascotAction, setMascotTarget, setOnboardingStep,
    wikiSearch, performWebSearch, readUrlContent, generateImage,
    resetSilenceTimer, stopSilenceTimer
  ]);

  // ============================================================
  // 📺 COMPARTILHAMENTO DE TELA
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

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      if (sessionRef.current && isConnectedRef.current) {
        sessionRef.current.then((session: any) => {
          if (!isConnectedRef.current) return;
          try {
            session.sendRealtimeInput({ text: '[SISTEMA: Compartilhamento de tela iniciado. Você receberá frames periódicos como contexto visual. Use-os para enriquecer suas respostas. Só descreva a tela quando o usuário perguntar diretamente.]' });
          }
          catch (e) { /* WebSocket fechado — ignora */ }
        }).catch(() => {});
      }

      const sendFrame = () => {
        if (!screenStreamRef.current?.active || !sessionRef.current || !screenAnalysisActiveRef.current) return;
        if (isConnectedRef.current && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const base64 = canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
          safeSessionSend(sessionRef, isConnectedRef, (session) => {
  session.sendRealtimeInput({
    text: `[SISTEMA: O usuário está em silêncio há ${SILENCE_TIMEOUT_MS / 1000} segundos. Inicie a conversa naturalmente.]`
  });
});
            if (!isConnectedRef.current) return;
            try { session.sendRealtimeInput({ video: { data: base64, mimeType: 'image/jpeg' } }); }
            catch (e) { /* WebSocket fechado — ignora */ }
          }).catch(() => {});
        }
        if (!isConnectedRef.current) return;
setTimeout(sendFrame, SCREEN_ANALYSIS_INTERVAL_MS);
      };

      sendFrame();

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        screenAnalysisActiveRef.current = false;
        if (sessionRef.current && isConnectedRef.current) {
          safeSessionSend(sessionRef, isConnectedRef, (session) => {
  session.sendRealtimeInput({
    text: `[SISTEMA: usuário em silêncio...]`
  });
});
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
      safeSessionSend(sessionRef, isConnectedRef, (session) => {
  session.sendRealtimeInput({ text });
});
    }
  }, [setIsThinking, resetSilenceTimer]);

  const sendFile = useCallback(async (base64Data: string, mimeType: string, prompt: string): Promise<void> => {
    if (!sessionRef.current || !isConnectedRef.current) {
      throw new Error('Sessão não está ativa');
    }
    setIsThinking(true);
    const s = await sessionRef.current;
    await s.sendRealtimeInput({ video: { mimeType, data: base64Data } });
    await new Promise(r => setTimeout(r, 300));
    await s.sendRealtimeInput({ text: prompt });
  }, [setIsThinking]);

  // ✅ CORREÇÃO: disconnect limpa sessionRef ANTES de fechar e usa try/catch
  const disconnect = useCallback((isReconnecting = false) => {
    screenAnalysisActiveRef.current = false;
    stopSilenceTimer();
    isConnectedRef.current = false;
    isConnectingRef.current = false;

    const sessionToClose = sessionRef.current;
    sessionRef.current = null; // ← limpa ANTES para barrar novos envios residuais

    sessionToClose?.then((s: any) => {
      try { s.close(); } catch {} // ← try/catch evita throw se já fechado
    }).catch(() => {});

    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    stopAudio(isReconnecting);
  }, [stopAudio, stopSilenceTimer]);

  return {
    isConnected, isSpeaking, isListening, isThinking, volume, error, history,
    connect, disconnect, startScreenSharing,
    sendMessage, sendLiveMessage, sendFile, generateImage
  };
};
