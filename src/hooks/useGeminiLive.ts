// src/hooks/useGeminiLive.ts
// Chat via Gemini API (texto/multimodal) — sem Gemini Live / WebSocket / áudio bidirecional

import { useCallback, useEffect, useRef } from 'react';
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

  useEffect(() => {
    onMessageRef.current = onMessage;
    onToolCallRef.current = onToolCall;
  }, [onMessage, onToolCall]);

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
  // 💬 ENVIO DE MENSAGEM — Gemini primário, OpenAI/Groq como fallback
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
            role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
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
          body: JSON.stringify({
            messages: [
              ...history.slice(-20).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
              { role: 'user', content: text }
            ],
            systemInstruction
          }),
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
      const geminiKey = storedApiKey || process.env.GEMINI_API_KEY;
      if (!geminiKey) throw new Error('Configure a API Gemini nas Configurações.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ]}],
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
    sendMessage, sendFile, generateImage,
    // compatibilidade — não fazem nada, existem para evitar erros em chamadas legadas
    performWebSearch, readUrlContent,
  };
};
