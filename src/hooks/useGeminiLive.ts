import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { useAppStore, VoiceName, VOICE_MAPPING } from '../store/useAppStore';

export interface UseGeminiLiveProps {
  onToggleScreenSharing?: (enabled: boolean) => void;
  onChangeVoice?: (voice: VoiceName) => void;
  onOpenUrl?: (url: string) => void;
  onInteract?: (action: string, x?: number, y?: number, text?: string) => void;
  onMessage?: (msg: { role: 'user' | 'model'; text: string }) => void;
  onToolCall?: (toolName: string, args: any) => void;
  isMuted?: boolean;
}

export const useGeminiLive = ({ 
  onToggleScreenSharing, 
  onChangeVoice, 
  onOpenUrl, 
  onInteract, 
  onMessage, 
  onToolCall, 
  isMuted = false 
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
    setAssistantName,
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

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

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

  // ============================================
  // 🛠️ DECLARAÇÕES DE FERRAMENTAS (TOOLS)
  // ============================================

  const toggleScreenSharingFunc: FunctionDeclaration = {
    name: "toggle_screen_sharing",
    description: "Ativa ou desativa o compartilhamento de tela para que a IA possa ver o que o usuário está fazendo.",
    parameters: {
      type: Type.OBJECT,
      properties: { enabled: { type: Type.BOOLEAN, description: "True para ativar, False para desativar." } },
      required: ["enabled"]
    }
  };

  const changeVoiceFunc: FunctionDeclaration = {
    name: "change_voice",
    description: "Altera a voz do sistema operacional (IA).",
    parameters: {
      type: Type.OBJECT,
      properties: { voice_name: { type: Type.STRING, description: "O nome da nova voz.", enum: ["Charon", "Kore", "Puck", "Zephyr", "Fenrir"] } },
      required: ["voice_name"]
    }
  };

  const openUrlFunc: FunctionDeclaration = {
    name: "open_url",
    description: "Abre uma URL ou site em uma nova aba (ex: YouTube, Google, etc).",
    parameters: {
      type: Type.OBJECT,
      properties: { url: { type: Type.STRING, description: "A URL completa para abrir." } },
      required: ["url"]
    }
  };

  const interactFunc: FunctionDeclaration = {
    name: "interact_with_screen",
    description: "Simula uma interação na tela (clique, scroll, digitar, etc).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, description: "Ação: 'click', 'type', 'scroll_up', 'scroll_down'." },
        text: { type: Type.STRING, description: "Texto a ser digitado (se action for 'type')." },
        x: { type: Type.NUMBER, description: "Coordenada X (0-1920)." },
        y: { type: Type.NUMBER, description: "Coordenada Y (0-1080)." }
      },
      required: ["action"]
    }
  };

  const mascotControlFunc: FunctionDeclaration = {
    name: "mascot_control",
    description: "Controla as ações do mascote visualmente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, description: "Ação: 'point', 'click'.", enum: ['point', 'click'] },
        target: { type: Type.STRING, description: "ID do elemento ou coordenadas (ex: 'x:500,y:300')." },
      },
      required: ["action", "target"],
    },
  };

  const saveProfileInfoFunc: FunctionDeclaration = {
    name: "save_profile_info",
    description: "Salva informações do perfil do usuário durante o onboarding.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        field: { type: Type.STRING, enum: ['hobbies', 'relationships', 'lifestyle', 'gender_preference', 'personality', 'assistant_name', 'social_level', 'mother_relationship'] },
        value: { type: Type.STRING }
      },
      required: ["field", "value"]
    }
  };

  const completeOnboardingFunc: FunctionDeclaration = {
    name: "complete_onboarding",
    description: "Finaliza o processo de onboarding e inicia a animação de nascimento (Supernova).",
    parameters: { type: Type.OBJECT, properties: {} }
  };

  const showLyricsFunc: FunctionDeclaration = {
    name: "show_lyrics",
    description: "Mostra a letra de uma música na tela linha por linha enquanto canta.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lines: { type: Type.ARRAY, items: { type: Type.STRING }, description: "As linhas da letra." },
        tempo: { type: Type.NUMBER, description: "O tempo em ms entre cada linha." }
      },
      required: ["lines"]
    }
  };

  const setMoodFunc: FunctionDeclaration = {
    name: "set_mood",
    description: "Altera o humor atual da IA.",
    parameters: {
      type: Type.OBJECT,
      properties: { mood: { type: Type.STRING, enum: ["happy", "calm", "focused", "playful", "melancholic", "angry"] } },
      required: ["mood"]
    }
  };

  const setFocusModeFunc: FunctionDeclaration = {
    name: "set_focus_mode",
    description: "Ativa ou desativa o modo foco.",
    parameters: {
      type: Type.OBJECT,
      properties: { enabled: { type: Type.BOOLEAN } },
      required: ["enabled"]
    }
  };

  const saveMemoryFunc: FunctionDeclaration = {
    name: "save_memory",
    description: "Salva informações importantes sobre o usuário.",
    parameters: {
      type: Type.OBJECT,
      properties: { userName: { type: Type.STRING }, fact: { type: Type.STRING }, preference: { type: Type.STRING } }
    }
  };

  const addImportantDateFunc: FunctionDeclaration = {
    name: "add_important_date",
    description: "Salva uma data importante do usuário.",
    parameters: {
      type: Type.OBJECT,
      properties: { label: { type: Type.STRING }, date: { type: Type.STRING }, year: { type: Type.STRING } },
      required: ["label", "date"]
    }
  };

  const writeDiaryFunc: FunctionDeclaration = {
    name: "write_diary",
    description: "Escreve uma reflexão no diário.",
    parameters: {
      type: Type.OBJECT,
      properties: { content: { type: Type.STRING } },
      required: ["content"]
    }
  };

  const searchWebFunc: FunctionDeclaration = {
    name: "search_web",
    description: "Pesquisa algo na web e retorna resultados relevantes com resumos. Use para notícias, informações atuais, dados online.",
    parameters: {
      type: Type.OBJECT,
      properties: { 
        query: { type: Type.STRING, description: "Termo de pesquisa para buscar na internet." },
        num_results: { type: Type.NUMBER, description: "Número máximo de resultados (1-10).", default: 5 }
      },
      required: ["query"]
    }
  };

  const readUrlContentFunc: FunctionDeclaration = {
    name: "read_url_content",
    description: "Lê e extrai o conteúdo textual principal de uma página da web específica.",
    parameters: {
      type: Type.OBJECT,
      properties: { 
        url: { type: Type.STRING, description: "A URL completa da página para ler (ex: https://exemplo.com/artigo)." } 
      },
      required: ["url"]
    }
  };

  const updateWorkspaceFunc: FunctionDeclaration = {
    name: "update_workspace",
    description: "Escreve ou atualiza o conteúdo na Área de Trabalho (Workspace).",
    parameters: {
      type: Type.OBJECT,
      properties: { content: { type: Type.STRING } },
      required: ["content"]
    }
  };

  const clearWorkspaceFunc: FunctionDeclaration = {
    name: "clear_workspace",
    description: "Limpa todo o conteúdo da Área de Trabalho (Workspace).",
    parameters: { type: Type.OBJECT, properties: {} }
  };

  const saveSemanticFactFunc: FunctionDeclaration = {
    name: "save_semantic_fact",
    description: "Salva um fato semântico estruturado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        concept: { type: Type.STRING },
        definition: { type: Type.STRING },
        category: { type: Type.STRING }
      },
      required: ["concept", "definition", "category"]
    }
  };

  const searchSemanticMemoryFunc: FunctionDeclaration = {
    name: "search_semantic_memory",
    description: "Pesquisa na memória semântica por contexto.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING } },
      required: ["query"]
    }
  };

  const searchGmailFunc: FunctionDeclaration = {
    name: "search_gmail",
    description: "Pesquisa nos e-mails do usuário (Gmail).",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING } },
      required: ["query"]
    }
  };

  const saveConversationSummaryFunc: FunctionDeclaration = {
    name: "save_conversation_summary",
    description: "Salva um resumo da conversa atual.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        topics: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["summary", "topics"]
    }
  };

  // ============================================
  // 🎵 FUNÇÕES DE CONTROLE DE ÁUDIO
  // ============================================

  const stopAudio = useCallback((isReconnecting = false) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close().catch(console.error);
      inputAudioContextRef.current = null;
    }
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (!isReconnecting && audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
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
    
    for (let i = 0; i < chunk.length; i++) {
      channelData[i] = chunk[i] / 0x7FFF;
    }
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now + 0.05;
    }
    
    const startTime = nextStartTimeRef.current;
    source.start(startTime);
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

  const toBase64 = useCallback((buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
    }
    return window.btoa(binary);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (sessionRef.current && isConnectedRef.current) {
      setIsThinking(true);
      sessionRef.current.then((session: any) => session.sendRealtimeInput({ text }));
    }
  }, [setIsThinking]);

  const sendFile = useCallback((base64Data: string, mimeType: string, prompt: string) => {
    if (sessionRef.current && isConnectedRef.current) {
      setIsThinking(true);
      sessionRef.current.then((session: any) => {
        session.sendRealtimeInput({
          video: { mimeType, data: base64Data }
        });
        setTimeout(() => {
          session.sendRealtimeInput({ text: prompt });
        }, 300);
      });
    }
  }, [setIsThinking]);

  // ============================================
  // 🌐 FUNÇÕES DE PESQUISA E LEITURA DA WEB
  // ✅ CORRIGIDO: Usando proxy /api/web-search para evitar CORS
  // ============================================

  /**
   * Pesquisa na web usando o proxy da API route (sem CORS)
   * O arquivo pages/api/web-search.ts faz a chamada ao Jina AI pelo servidor
   */
  const performWebSearch = useCallback(async (query: string, numResults: number = 5): Promise<string> => {
    try {
      // ✅ CORRIGIDO: Chama o proxy backend em vez do Jina diretamente (evita CORS)
      const response = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, num_results: numResults })
      });

      if (!response.ok) {
        throw new Error(`Erro na busca: ${response.status}`);
      }

      const data = await response.json();

      if (data.results && Array.isArray(data.results)) {
        const results = data.results.slice(0, numResults).map((item: any, index: number) => {
          return `[${index + 1}] ${item.title}\nURL: ${item.url}\nResumo: ${item.description || item.content?.substring(0, 300) || 'Sem descrição disponível'}\n`;
        }).join('\n---\n');

        return `🔍 Resultados para "${query}":\n\n${results}\n\n💡 Dica: Use "read_url_content" para ler o conteúdo completo de qualquer URL listada acima.`;
      }

      return data.text || `Nenhum resultado encontrado para "${query}".`;

    } catch (error) {
      console.error('Erro na pesquisa web:', error);
      return await fallbackDuckDuckGoSearch(query, numResults);
    }
  }, []);

  /**
   * Fallback usando DuckDuckGo via proxy
   */
  const fallbackDuckDuckGoSearch = useCallback(async (query: string, numResults: number = 5): Promise<string> => {
    try {
      // ✅ CORRIGIDO: Chama o proxy backend para DuckDuckGo também (evita CORS)
      const response = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, num_results: numResults, engine: 'duckduckgo' })
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();
      let result = `🔍 Resultados para "${query}":\n\n`;

      if (data.abstract) {
        result += `📋 ${data.abstract}\nFonte: ${data.source || 'DuckDuckGo'}\n\n`;
      }

      if (data.topics && Array.isArray(data.topics)) {
        const topics = data.topics.slice(0, numResults).map((topic: any, i: number) => {
          if (topic.text) {
            return `[${i + 1}] ${topic.text}${topic.url ? `\nURL: ${topic.url}` : ''}`;
          }
          return null;
        }).filter(Boolean).join('\n\n');

        if (topics) result += `🔗 Tópicos relacionados:\n${topics}`;
      }

      return result.trim() || `Nenhum resultado encontrado para "${query}". Tente reformular sua busca.`;

    } catch (error) {
      console.error('Erro no fallback DuckDuckGo:', error);
      return `⚠️ Não foi possível realizar a busca no momento. Verifique sua conexão com a internet e tente novamente.`;
    }
  }, []);

  /**
   * Lê o conteúdo de uma URL usando proxy backend (sem CORS)
   */
  const readUrlContent = useCallback(async (url: string): Promise<string> => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      // ✅ CORRIGIDO: Chama o proxy backend em vez do Jina diretamente (evita CORS)
      const response = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, action: 'read' })
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Acesso negado. O site pode bloquear leitores automáticos.');
        }
        throw new Error(`Erro ao ler URL: ${response.status}`);
      }

      const data = await response.json();

      if (data.content) {
        const content = data.content.substring(0, 4000);
        return `📄 Conteúdo de ${url}:\n\n${content}\n\n${data.content.length > 4000 ? '⚠️ Conteúdo truncado. Peça para ler seções específicas se necessário.' : ''}`;
      }

      return `❌ Não foi possível extrair conteúdo de "${url}".`;

    } catch (error: any) {
      console.error('Erro ao ler URL:', error);
      return `❌ Não foi possível ler o conteúdo de "${url}".\n\nMotivo possível:\n• O site bloqueia acesso automatizado\n• A URL está incorreta ou inacessível\n• Conteúdo requer login ou JavaScript\n\n💡 Dica: Tente usar "search_web" para encontrar informações sobre este tópico.`;
    }
  }, []);

  // ============================================
  // 🔌 CONEXÃO COM A API GEMINI LIVE
  // ============================================

  const connect = useCallback(async (systemInstruction: string) => {
    try {
      setError(null);
      const apiKey = storedApiKey || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error("Chave de API não encontrada. Por favor, configure-a nas Configurações.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const workletCode = `
        class AudioProcessor extends AudioWorkletProcessor {
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input.length > 0) {
              const channelData = input[0];
              const int16Data = new Int16Array(channelData.length);
              for (let i = 0; i < channelData.length; i++) {
                int16Data[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
              }
              this.port.postMessage(int16Data);
            }
            return true;
          }
        }
        registerProcessor('audio-processor', AudioProcessor);
      `;
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await audioContextRef.current.audioWorklet.addModule(workletUrl);
      
      console.log("🚀 Iniciando conexão com Gemini Live API...");

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          // ✅ CORRIGIDO: Adicionado TEXT para que respostas de busca sejam visíveis
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          systemInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_MAPPING[voice] || 'Kore' } },
          },
          tools: [
            { functionDeclarations: [
              toggleScreenSharingFunc, changeVoiceFunc, openUrlFunc, interactFunc,
              mascotControlFunc, saveProfileInfoFunc, completeOnboardingFunc, showLyricsFunc,
              setMoodFunc, setFocusModeFunc, saveMemoryFunc, addImportantDateFunc,
              writeDiaryFunc, searchWebFunc, readUrlContentFunc, updateWorkspaceFunc,
              clearWorkspaceFunc, saveSemanticFactFunc, searchSemanticMemoryFunc,
              searchGmailFunc, saveConversationSummaryFunc
            ]}
          ]
        },
        callbacks: {
          onopen: () => {
            console.log("✅ Conectado com sucesso à Live API!");
            setIsConnected(true);
            isConnectedRef.current = true;
            setIsListening(true);
          },

          onmessage: async (message: any) => {
            if (message.serverContent?.modelTurn?.parts) {
              setIsThinking(false);
              const textParts = message.serverContent.modelTurn.parts
                .filter((p: any) => p.text)
                .map((p: any) => p.text)
                .join('');
              if (textParts) {
                addMessage({ role: 'model', text: textParts });
                onMessageRef.current?.({ role: 'model', text: textParts });
              }
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const base64Data = part.inlineData.data;
                  const binaryString = atob(base64Data);
                  const len = binaryString.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const int16Array = new Int16Array(bytes.buffer, 0, Math.floor(len / 2));
                  audioQueue.current.push(int16Array);
                  playNextChunk();
                }
              }
            }

            if (message.serverContent?.userTurn?.parts) {
              const userText = message.serverContent.userTurn.parts
                .filter((p: any) => p.text)
                .map((p: any) => p.text)
                .join('');
              if (userText) {
                addMessage({ role: 'user', text: userText });
                onMessageRef.current?.({ role: 'user', text: userText });
              }
            }

            // ============================================
            // ✅ CORRIGIDO: Handler de tool calls sem dupla resposta
            // ============================================
            if (message.toolCall) {
              setIsThinking(true);

              // Processamos todas as calls, separando as assíncronas (busca/leitura)
              // das síncronas (todas as outras)
              const syncResponses: any[] = [];
              const asyncPromises: Promise<void>[] = [];

              for (const call of message.toolCall.functionCalls) {
                const name = call.name;
                const args = call.args || {};

                // --- Ferramentas síncronas simples ---
                const delegatedTools = [
                  'show_lyrics', 'set_mood', 'set_focus_mode', 'save_memory',
                  'add_important_date', 'write_diary', 'update_workspace',
                  'clear_workspace', 'save_semantic_fact', 'search_semantic_memory',
                  'search_gmail', 'save_conversation_summary', 'save_profile_info'
                ];

                if (delegatedTools.includes(name)) {
                  onToolCallRef.current?.(name, args);
                  syncResponses.push({ name, id: call.id, response: { success: true } });

                } else if (name === "toggle_screen_sharing") {
                  onToggleScreenSharingRef.current?.(args.enabled as boolean);
                  syncResponses.push({ name, id: call.id, response: { success: true, message: `Compartilhamento de tela ${args.enabled ? 'ativado' : 'desativado'}.` } });

                } else if (name === "open_url") {
                  onOpenUrlRef.current?.(args.url as string);
                  syncResponses.push({ name, id: call.id, response: { success: true, message: `Abrindo URL: ${args.url}` } });

                } else if (name === "change_voice") {
                  onChangeVoiceRef.current?.(args.voice_name as VoiceName);
                  syncResponses.push({ name, id: call.id, response: { success: true, message: `Voz alterada para ${args.voice_name}.` } });

                } else if (name === "interact_with_screen") {
                  onInteractRef.current?.(args.action, args.x, args.y, args.text);
                  syncResponses.push({ name, id: call.id, response: { success: true } });

                } else if (name === "mascot_control") {
                  setMascotAction(args.action === 'click' ? 'clicking' : 'pointing');
                  setMascotTarget(args.target);
                  syncResponses.push({ name, id: call.id, response: { success: true } });

                } else if (name === "complete_onboarding") {
                  setOnboardingStep('completed');
                  syncResponses.push({ name, id: call.id, response: { success: true } });

                // ✅ CORRIGIDO: search_web — envia UMA única resposta com o resultado real
                } else if (name === "search_web") {
                  onToolCallRef.current?.(name, args);
                  const query = args.query as string;
                  const numResults = (args.num_results as number) || 5;

                  // Executa a busca de forma assíncrona e envia a resposta quando terminar
                  asyncPromises.push(
                    performWebSearch(query, numResults)
                      .then(searchResult => {
                        sessionPromise.then((session: any) => {
                          session.sendToolResponse({
                            functionResponses: [{
                              name,
                              id: call.id,
                              response: { success: true, content: searchResult, query }
                            }]
                          });
                        });
                      })
                      .catch(err => {
                        console.error('Erro na tool search_web:', err);
                        sessionPromise.then((session: any) => {
                          session.sendToolResponse({
                            functionResponses: [{
                              name,
                              id: call.id,
                              response: { success: false, error: `Erro na busca: ${err.message || 'Erro desconhecido'}` }
                            }]
                          });
                        });
                      })
                  );

                // ✅ CORRIGIDO: read_url_content — envia UMA única resposta com o conteúdo real
                } else if (name === "read_url_content") {
                  onToolCallRef.current?.(name, args);
                  const url = args.url as string;

                  asyncPromises.push(
                    readUrlContent(url)
                      .then(content => {
                        sessionPromise.then((session: any) => {
                          session.sendToolResponse({
                            functionResponses: [{
                              name,
                              id: call.id,
                              response: { success: true, content, url }
                            }]
                          });
                        });
                      })
                      .catch(err => {
                        console.error('Erro na tool read_url_content:', err);
                        sessionPromise.then((session: any) => {
                          session.sendToolResponse({
                            functionResponses: [{
                              name,
                              id: call.id,
                              response: { success: false, error: `Erro ao ler URL: ${err.message || 'Erro desconhecido'}` }
                            }]
                          });
                        });
                      })
                  );

                } else {
                  // Ferramenta não reconhecida
                  syncResponses.push({ name, id: call.id, response: { success: false, error: "Ferramenta não implementada" } });
                }
              }

              // ✅ CORRIGIDO: Envia as respostas síncronas todas de uma vez
              if (syncResponses.length > 0) {
                sessionPromise.then(session =>
                  session.sendToolResponse({ functionResponses: syncResponses })
                );
              }

              // As assíncronas (busca/leitura) enviam as respostas individualmente quando terminam
              // Não bloqueamos aqui — elas já estão rodando em paralelo
              if (asyncPromises.length > 0) {
                Promise.all(asyncPromises).finally(() => setIsThinking(false));
              } else {
                setIsThinking(false);
              }
            }

            if (message.serverContent?.interrupted) {
              audioQueue.current = [];
              activeSourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
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
            console.error("Live API Error Details:", err);
            setError(`Erro na API Live: ${err.message || 'Erro desconhecido'}`);
            setIsConnected(false);
            isConnectedRef.current = false;
            sessionRef.current = null;
          }
        }
      });

      sessionRef.current = sessionPromise;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } 
      });
      streamRef.current = stream;
      
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;
      const source = inputCtx.createMediaStreamSource(stream);
      await inputCtx.audioWorklet.addModule(workletUrl);
      const inputWorklet = new AudioWorkletNode(inputCtx, 'audio-processor');
      audioWorkletNodeRef.current = inputWorklet;
      source.connect(inputWorklet);
      
      let audioBuffer: Int16Array[] = [];
      let currentBufferSize = 0;
      const TARGET_BUFFER_SIZE = 2048;

      inputWorklet.port.onmessage = (event) => {
        const int16Data = event.data;
        audioBuffer.push(int16Data);
        currentBufferSize += int16Data.length;
        if (currentBufferSize >= TARGET_BUFFER_SIZE) {
          const combined = new Int16Array(currentBufferSize);
          let offset = 0;
          for (const chunk of audioBuffer) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          let sum = 0;
          for (let i = 0; i < combined.length; i++) {
            sum += Math.abs(combined[i] / 0x7FFF);
          }
          setVolume(sum / combined.length);
          
          if (!isMutedRef.current && sessionRef.current && isConnectedRef.current) {
            try {
              sessionRef.current.then((session: any) => {
                session.sendRealtimeInput({
                  audio: { data: toBase64(combined.buffer), mimeType: 'audio/pcm;rate=16000' }
                });
              });
            } catch (e) {
              console.error("Error sending audio:", e);
            }
          }
          audioBuffer = [];
          currentBufferSize = 0;
        }
      };

    } catch (err: any) {
      console.error("Connection failed:", err);
      setError(err.message);
      setIsConnected(false);
      isConnectedRef.current = false;
    }
  }, [voice, stopAudio, playNextChunk, toBase64, setError, storedApiKey, setIsConnected, setIsListening, addMessage, setMascotAction, setMascotTarget, setOnboardingStep, setVolume, performWebSearch, readUrlContent]);

  // ============================================
  // 📺 COMPARTILHAMENTO DE TELA
  // ============================================

  const startScreenSharing = useCallback(async () => {
    try {
      const mediaDevices = navigator.mediaDevices as any;
      if (!mediaDevices) throw new Error("O navegador não suporta APIs de mídia.");
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) throw new Error("O compartilhamento de tela não é suportado em dispositivos móveis.");

      const getDisplayMedia = mediaDevices.getDisplayMedia?.bind(mediaDevices) || (navigator as any).getDisplayMedia?.bind(navigator);
      if (!getDisplayMedia) throw new Error("O compartilhamento de tela não é suportado neste navegador (tente abrir em uma nova aba).");
      
      const stream = await getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const sendFrame = async () => {
        if (!screenStreamRef.current || !sessionRef.current || !ctx) return;
        try {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
          sessionRef.current.then((session: any) => {
            session.sendRealtimeInput({ video: { data: base64, mimeType: 'image/jpeg' } });
          });
          if (screenStreamRef.current.active) setTimeout(sendFrame, 1000);
        } catch (e) {
          console.error("Frame capture error:", e);
        }
      };
      sendFrame();
    } catch (e: any) {
      console.error("Screen share error:", e);
      let msg = "Falha ao iniciar compartilhamento de tela";
      if (e.name === 'NotAllowedError') {
        msg = "Permissão negada pelo usuário ou bloqueada pelo navegador. Verifique se o compartilhamento de tela está permitido.";
      } else if (e.name === 'NotFoundError') {
        msg = "Nenhuma fonte de tela encontrada.";
      }
      setError(msg);
    }
  }, [setError]);

  const disconnect = useCallback((isReconnecting = false) => {
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => session.close());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
    }
    stopAudio(isReconnecting);
  }, [stopAudio]);

  return {
    isConnected,
    isSpeaking,
    isListening,
    isThinking,
    volume,
    error,
    connect,
    disconnect,
    startScreenSharing,
    history,
    sendMessage,
    sendFile
  };
};
