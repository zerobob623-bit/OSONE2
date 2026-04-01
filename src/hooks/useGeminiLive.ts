// src/hooks/useGeminiLive.ts
// Chat via Gemini API (text/multimodal) — sem Gemini Live / WebSocket / áudio bidirecional

import { useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { useAppStore } from '../store/useAppStore';

export interface UseGeminiLiveProps {
  onMessage?: (msg: { role: 'user' | 'model'; text: string; imageUrl?: string }) => void;
  onToolCall?: (toolName: string, args: any) => void;
  systemInstruction?: string;
}

export const useGeminiLive = ({
  onMessage,
  onToolCall,
  systemInstruction = ""
}: UseGeminiLiveProps) => {
  const {
    isThinking, setIsThinking,
    error, setError,
    history, addMessage,
    apiKey: storedApiKey,
    openaiApiKey,
    groqApiKey,
    chatProvider,
    chatModel,
  } = useAppStore();

  const onMessageRef = useRef(onMessage);
  const onToolCallRef = useRef(onToolCall);

  // Keep refs up to date
  const updateRefs = useCallback(() => {
    onMessageRef.current = onMessage;
    onToolCallRef.current = onToolCall;
  }, [onMessage, onToolCall]);
  updateRefs();

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
        } catch { /* fallback */ }
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
  // 💬 ENVIO DE MENSAGEM — Gemini como primário, OpenAI/Groq como fallback
  // ============================================================

  const sendMessage = useCallback(async (text: string) => {
    addMessage({ role: 'user', text });
    onMessageRef.current?.({ role: 'user', text });
    setIsThinking(true);
    try {
      const IMAGE_KEYWORDS = ['gere uma imagem', 'crie uma imagem', 'gerar imagem', 'criar imagem', 'desenhe', 'faça uma imagem'];
      const lower = text.toLowerCase();
      const matchedKw = IMAGE_KEYWORDS.find(kw => lower.includes(kw));
      if (matchedKw) {
        const prompt = text.substring(lower.indexOf(matchedKw) + matchedKw.length).trim();
        if (prompt) { await generateImage(prompt); return; }
      }

      let replyText = '';
      const geminiKey = storedApiKey || process.env.GEMINI_API_KEY;
      const activeAltKey = chatProvider === 'groq' ? groqApiKey : openaiApiKey;

      if (geminiKey) {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const contents = [
          ...history.slice(-20).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model' as 'user' | 'model',
            parts: [{ text: msg.text }]
          })),
          { role: 'user' as const, parts: [{ text }] }
        ];
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: systemInstruction ? { systemInstruction } : undefined,
        });
        replyText = response.text ?? '';
      } else if (activeAltKey) {
        const baseUrl = chatProvider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';
        const defaultModel = chatProvider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4.1-mini';
        const contextHistory = history.slice(-20).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text
        }));
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeAltKey}` },
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
          body: JSON.stringify({ messages: [...history.slice(-20).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })), { role: 'user', content: text }], systemInstruction }),
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
      const msg = `Erro: ${err.message || 'Erro desconhecido'}`;
      addMessage({ role: 'model', text: msg });
      onMessageRef.current?.({ role: 'model', text: msg });
    } finally {
      setIsThinking(false);
    }
  }, [history, addMessage, setIsThinking, systemInstruction, generateImage, storedApiKey, openaiApiKey, groqApiKey, chatProvider, chatModel]);

  // ============================================================
  // 📎 ENVIO DE ARQUIVO — análise de imagem/PDF via Gemini multimodal
  // ============================================================

  const sendFile = useCallback(async (base64Data: string, mimeType: string, prompt: string): Promise<void> => {
    setIsThinking(true);
    try {
      setError(null);
      const apiKey = storedApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chave de API não encontrada. Configure nas Configurações.");

      const LIVE_MODEL = "gemini-3.1-flash-live";
      console.group("[GeminiLive] 🔌 Iniciando conexão...");
      console.log("[GeminiLive] API key prefix:", apiKey.substring(0, 8) + "...");
      console.log("[GeminiLive] Modelo:", LIVE_MODEL);
      console.log("[GeminiLive] Hora:", new Date().toISOString());
      console.groupEnd();

      const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });

      // Contexto de saída (playback 24kHz)
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        console.log("[GeminiLive] AudioContext de saída criado, state:", audioContextRef.current.state);
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log("[GeminiLive] AudioContext resumido ok");
      }

      console.log("[GeminiLive] Chamando ai.live.connect()...");
      const sessionPromise = ai.live.connect({
        model: LIVE_MODEL,
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
            console.log("[GeminiLive] ✅ onopen — WebSocket aberto com sucesso!", new Date().toISOString());
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
                catch (e) { console.warn('[tool] sendToolResponse ignorado:', e); }
              };
              const finishAsync = () => {
                asyncPending--;
                if (asyncPending === 0) setIsThinking(false);
              };
              for (const call of message.toolCall.functionCalls) {
                const { name, args = {}, id } = call;
                if (name === "show_lyrics") {
                  onToolCallRef.current?.(name, args);
                  syncResponses.push({ name, id, response: { success: true, message: "Letra exibida!" } });
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
                        onToolCallRef.current?.(name, { action: args.action, imageUrl: `data:${data.mimeType};base64,${data.image}` });
                        if (isConnectedRef.current) {
                          try {
                            session.sendRealtimeInput({ video: { data: data.image, mimeType: data.mimeType } });
                            session.sendRealtimeInput({ text: '[Sistema: Screenshot capturado e enviado.]' });
                          } catch {}
                        }
                        safeSend({ name, id, response: { success: true, message: 'Screenshot enviado.' } });
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
                if (name === "send_whatsapp" || name === "send_whatsapp_audio" || name === "send_whatsapp_image") {
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
                  const endpoint = name === "send_whatsapp_image" ? '/api/whatsapp/send-image'
                    : name === "send_whatsapp_audio" ? '/api/whatsapp/send-audio'
                    : '/api/whatsapp/send';
                  const body = name === "send_whatsapp_image"
                    ? { imageUrl: args.imageUrl, caption: args.caption, phone: resolvedPhone }
                    : name === "send_whatsapp_audio"
                    ? { text: args.text, phone: resolvedPhone }
                    : { message: args.message, phone: resolvedPhone };
                  fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
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
                    safeSend({ name, id, response: { success: false, error: 'Habilidade não encontrada.' } });
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
          onclose: (event: any) => {
            const code = event?.code ?? '?';
            const reason = event?.reason ?? '(sem razão)';
            const wasClean = event?.wasClean ?? '?';
            console.error(`[GeminiLive] ❌ onclose — code=${code}, reason="${reason}", wasClean=${wasClean}`, new Date().toISOString());
            const closeMsg = `WS fechou: code=${code}${reason ? ` reason="${reason}"` : ''}`;
            isConnectingRef.current = false;
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null;
            stopSilenceTimer();
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            if (inputAudioContextRef.current?.state !== 'closed') {
              inputAudioContextRef.current?.close().catch(() => {});
              inputAudioContextRef.current = null;
            }
            setIsListening(false);
            if (!wasClean || code !== 1000) {
              setError(closeMsg);
            }
          },
          onerror: (err: any) => {
            console.error("[GeminiLive] 🔴 onerror:", err, new Date().toISOString());
            const msg = err?.message || err?.type || JSON.stringify(err) || 'Erro desconhecido';
            isConnectingRef.current = false;
            setError(`Erro na API Live: ${msg}`);
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null;
            stopSilenceTimer();
          }
        }
      });
      const replyText = response.text ?? 'Não consegui analisar o arquivo.';
      addMessage({ role: 'model', text: replyText });
      onMessageRef.current?.({ role: 'model', text: replyText });
    } catch (err: any) {
      const msg = `Erro ao analisar arquivo: ${err.message}`;
      addMessage({ role: 'model', text: msg });
      onMessageRef.current?.({ role: 'model', text: msg });
    } finally {
      setIsThinking(false);
    }
  }, [storedApiKey, addMessage, setIsThinking]);

  return {
    isThinking, error, history,
    sendMessage, sendFile, generateImage
  };
};
