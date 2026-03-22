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

export const useGeminiLive = ({ onToggleScreenSharing, onChangeVoice, onOpenUrl, onInteract, onMessage, onToolCall, isMuted = false }: UseGeminiLiveProps) => {
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

  const toggleScreenSharingFunc: FunctionDeclaration = {
    name: "toggle_screen_sharing",
    description: "Ativa ou desativa o compartilhamento de tela para que a IA possa ver o que o usuário está fazendo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        enabled: {
          type: Type.BOOLEAN,
          description: "True para ativar, False para desativar."
        }
      },
      required: ["enabled"]
    }
  };

  const changeVoiceFunc: FunctionDeclaration = {
    name: "change_voice",
    description: "Altera a voz do sistema operacional (IA).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        voice_name: {
          type: Type.STRING,
          description: "O nome da nova voz.",
          enum: ["Charon", "Kore", "Puck", "Zephyr", "Fenrir"]
        }
      },
      required: ["voice_name"]
    }
  };

  const openUrlFunc: FunctionDeclaration = {
    name: "open_url",
    description: "Abre uma URL ou site em uma nova aba (ex: YouTube, Google, etc).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: "A URL completa para abrir."
        }
      },
      required: ["url"]
    }
  };

  const interactFunc: FunctionDeclaration = {
    name: "interact_with_screen",
    description: "Simula uma interação na tela (clique, scroll, digitar, etc). Use para clicar em botões ou escrever em campos de texto.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "A ação a ser realizada: 'click' (clicar), 'type' (digitar), 'scroll_up', 'scroll_down'."
        },
        text: {
          type: Type.STRING,
          description: "O texto a ser digitado (obrigatório se a ação for 'type')."
        },
        x: { type: Type.NUMBER, description: "Coordenada X na tela (0-1920)." },
        y: { type: Type.NUMBER, description: "Coordenada Y na tela (0-1080)." }
      },
      required: ["action"]
    }
  };

  const mascotControlFunc: FunctionDeclaration = {
    name: "mascot_control",
    description: "Controla as ações do mascote (mover, apontar, clicar). Use para interagir visualmente com a interface.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "A ação a ser realizada: 'point' (mover e apontar), 'click' (mover e clicar).",
          enum: ['point', 'click']
        },
        target: {
          type: Type.STRING,
          description: "O ID do elemento ou coordenadas (ex: 'x:500,y:300') para onde o mascote deve ir.",
        },
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
        field: { 
          type: Type.STRING, 
          enum: ['hobbies', 'relationships', 'lifestyle', 'gender_preference', 'personality', 'assistant_name', 'social_level', 'mother_relationship']
        },
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

  // New tool declarations
  const showLyricsFunc: FunctionDeclaration = {
    name: "show_lyrics",
    description: "Mostra a letra de uma música na tela linha por linha enquanto canta.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lines: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["lines"]
    }
  };

  const setMoodFunc: FunctionDeclaration = {
    name: "set_mood",
    description: "Altera o humor atual da IA.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mood: { type: Type.STRING, enum: ["happy", "calm", "focused", "playful", "melancholic"] }
      },
      required: ["mood"]
    }
  };

  const saveMemoryFunc: FunctionDeclaration = {
    name: "save_memory",
    description: "Salva informações importantes sobre o usuário para lembrar em próximas sessões.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userName: { type: Type.STRING },
        fact: { type: Type.STRING },
        preference: { type: Type.STRING }
      }
    }
  };

  const addImportantDateFunc: FunctionDeclaration = {
    name: "add_important_date",
    description: "Salva uma data importante do usuário.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING },
        date: { type: Type.STRING },
        year: { type: Type.STRING }
      },
      required: ["label", "date"]
    }
  };

  const writeDiaryFunc: FunctionDeclaration = {
    name: "write_diary",
    description: "Escreve uma reflexão no diário após conversas marcantes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING }
      },
      required: ["content"]
    }
  };

  const searchWebFunc: FunctionDeclaration = {
    name: "search_web",
    description: "Pesquisa algo na web.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING }
      },
      required: ["query"]
    }
  };

  const updateWorkspaceFunc: FunctionDeclaration = {
    name: "update_workspace",
    description: "Escreve ou atualiza o conteúdo na Área de Trabalho (Workspace). Use para textos longos, códigos, roteiros ou qualquer conteúdo que precise ser armazenado e visualizado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { 
          type: Type.STRING,
          description: "O conteúdo completo (texto ou código) para ser exibido no Workspace."
        }
      },
      required: ["content"]
    }
  };

  const stopAudio = useCallback((isReconnecting = false) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (!isReconnecting && audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
    setIsSpeaking(false);
    audioQueue.current = [];
    nextStartTimeRef.current = 0;
  }, []);

  const playNextChunk = useCallback(() => {
    if (audioQueue.current.length === 0 || !audioContextRef.current) {
      return;
    }
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
  }, []);

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
  }, []);

  const sendFile = useCallback((base64Data: string, mimeType: string, prompt: string) => {
    if (sessionRef.current && isConnectedRef.current) {
      setIsThinking(true);
      sessionRef.current.then((session: any) => {
        // Send the file as inline data
        session.sendRealtimeInput({
          media: {
            mimeType,
            data: base64Data,
          }
        });
        // Then send the text prompt
        setTimeout(() => {
          session.sendRealtimeInput({ text: prompt });
        }, 300);
      });
    }
  }, []);

  const connect = useCallback(async (systemInstruction: string) => {
    try {
      setError(null);
      const apiKey = storedApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
      
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
      const url = URL.createObjectURL(blob);
      await audioContextRef.current.audioWorklet.addModule(url);
      
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_MAPPING[voice] || 'Kore' } },
          },
          systemInstruction: systemInstruction,
          tools: [
            { functionDeclarations: [
              toggleScreenSharingFunc, changeVoiceFunc, openUrlFunc, mascotControlFunc,
              saveProfileInfoFunc, completeOnboardingFunc,
              interactFunc, showLyricsFunc, setMoodFunc, saveMemoryFunc,
              addImportantDateFunc, writeDiaryFunc, searchWebFunc, updateWorkspaceFunc
            ]}
          ]
        },
        callbacks: {
          onopen: () => {
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

            if (message.toolCall) {
              setIsThinking(true);
              const responses: any[] = [];
              for (const call of message.toolCall.functionCalls) {
                const name = call.name;
                const args = call.args || {};

                // New tools — delegate to App.tsx via onToolCall
                const newTools = ['show_lyrics', 'set_mood', 'save_memory', 'add_important_date', 'write_diary', 'search_web', 'update_workspace'];
                if (newTools.includes(name)) {
                  onToolCallRef.current?.(name, args);
                  responses.push({ name, id: call.id, response: { success: true } });
                  continue;
                }

                // Original tools — same as before
                if (name === "toggle_screen_sharing") {
                  onToggleScreenSharingRef.current?.(args.enabled as boolean);
                  responses.push({ name, id: call.id, response: { success: true, message: `Compartilhamento de tela ${args.enabled ? 'ativado' : 'desativado'}.` } });
                } else if (name === "open_url") {
                  onOpenUrlRef.current?.(args.url as string);
                  responses.push({ name, id: call.id, response: { success: true, message: `Abrindo URL: ${args.url}` } });
                } else if (name === "change_voice") {
                  onChangeVoiceRef.current?.(args.voice_name as VoiceName);
                  responses.push({ name, id: call.id, response: { success: true, message: `Voz alterada para ${args.voice_name}.` } });
                } else if (name === "interact_with_screen") {
                  onInteractRef.current?.(args.action, args.x, args.y, args.text);
                  responses.push({ name, id: call.id, response: { success: true } });
                } else if (name === "mascot_control") {
                  setMascotAction(args.action === 'click' ? 'clicking' : 'pointing');
                  setMascotTarget(args.target);
                  responses.push({ name, id: call.id, response: { success: true } });
                } else if (name === "complete_onboarding") {
                  setOnboardingStep('completed');
                  responses.push({ name, id: call.id, response: { success: true } });
                }
              }
              if (responses.length > 0) {
                sessionPromise.then(session => session.sendToolResponse({ functionResponses: responses }));
              }
              setIsThinking(false);
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
      await inputCtx.audioWorklet.addModule(url);
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
                session.sendRealtimeInput({ audio: { data: toBase64(combined.buffer), mimeType: 'audio/pcm;rate=16000' } });
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
  }, [voice, stopAudio, playNextChunk, toBase64]);

  const startScreenSharing = useCallback(async () => {
    try {
      const mediaDevices = navigator.mediaDevices as any;
      if (!mediaDevices) throw new Error("O navegador não suporta APIs de mídia.");
      const getDisplayMedia = mediaDevices.getDisplayMedia?.bind(mediaDevices) || (navigator as any).getDisplayMedia?.bind(navigator);
      if (!getDisplayMedia) throw new Error("O compartilhamento de tela não é suportado neste navegador (tente abrir em uma nova aba).");
      const stream = await getDisplayMedia({ video: { cursor: "always", displaySurface: "monitor" } });
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
      setError(e.message || "Falha ao iniciar compartilhamento de tela");
    }
  }, []);

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