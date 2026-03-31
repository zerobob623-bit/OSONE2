import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Monitor, Power, Settings, X, Paperclip, MicOff, Mic, History, 
  ChevronLeft, BookOpen, Calendar, Trash2, PhoneOff, Copy, Code, 
  FileText, Volume2, VolumeX, Send, Cpu, Download 
} from 'lucide-react';
import { VoiceOrb } from './components/VoiceOrb';
import { Supernova } from './components/Supernova';
import { Mascot } from './components/Mascot';
import { useGeminiLive } from './hooks/useGeminiLive';
import { 
  useAppStore, VoiceName, MascotEyeStyle, Mood, PersonalityKey, CustomSkill 
} from './store/useAppStore';
import CATALOG, { CATALOG_CATEGORIES, type CatalogSkill } from './data/skillsCatalog';
import { useConversationHistory } from './hooks/useConversationHistory';
import { 
  useUserMemory, ImportantDate, SemanticFact, ConversationSummary 
} from './hooks/useUserMemory';
import { getEmbedding, cosineSimilarity } from './utils/embeddings';
import { DefaultLayout } from './components/layouts/DefaultLayout';
import { NeuralLayout } from './components/layouts/NeuralLayout';
import { OrbLayout } from './components/layouts/OrbLayout';

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Screen = 'main' | 'history' | 'diary' | 'workspace' | 'skills';
type Personality = 'osone' | 'ezer' | 'samuel' | 'jonas';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const EVOLUTION_INSTANCE = 'OSONE2';

const MOOD_CONFIG: Record<Mood, { color: string; label: string; emoji: string }> = {
  happy:       { color: '#feca57', label: 'Animada',     emoji: '😄' },
  calm:        { color: '#a29bfe', label: 'Calma',       emoji: '😌' },
  focused:     { color: '#00cec9', label: 'Focada',      emoji: '🎯' },
  playful:     { color: '#fd79a8', label: 'Brincalhona', emoji: '😜' },
  melancholic: { color: '#636e72', label: 'Melancólica', emoji: '🌧️' },
  angry:       { color: '#ff4757', label: 'Irritada',    emoji: '💢' },
  singing:     { color: '#fdcb6e', label: 'Cantando',    emoji: '♪' },
};

const FEMININE_VOICES = ['Callirrhoe', 'Kore', 'Leda', 'Vindemiatrix', 'Zephyr'];

const VOICE_DESCRIPTIONS: Record<VoiceName, string> = {
  'Kore':         'Feminina, acolhedora e equilibrada',
  'Zephyr':       'Feminina, suave e etérea',
  'Leda':         'Feminina, clara e expressiva',
  'Callirrhoe':   'Feminina, suave e fluente',
  'Vindemiatrix': 'Feminina, elegante e distinta',
  'Puck':         'Masculina, jovem e curiosa',
  'Charon':       'Masculina, profunda e calma',
  'Fenrir':       'Masculina, robusta e protetora',
  'Orus':         'Masculina, firme e confiante',
  'Aoede':        'Masculina, suave e melódica',
};

const PERSONALITY_CONFIG: Record<Personality, {
  label: string;
  description: string;
  emoji: string;
  color: string;
  voice: VoiceName;
  greeting: string;
}> = {
  osone: {
    label: 'OSONE',
    description: 'IA empática, jovem e calorosa',
    emoji: '✨',
    color: '#a29bfe',
    voice: 'Kore',
    greeting: 'Oi, estou aqui.',
  },
  ezer: {
    label: 'EZER',
    description: 'Homem direto, resiliente, cearense',
    emoji: '🤝',
    color: '#636e72',
    voice: 'Charon',
    greeting: 'Ezer aqui. Pode falar.',
  },
  samuel: {
    label: 'SAMUEL',
    description: 'Ancião sábio, pilar silencioso, fé nordestina',
    emoji: '📖',
    color: '#b8860b',
    voice: 'Fenrir',
    greeting: 'Que Jeová nos abençoe nessa conversa. Pode falar, meu irmão.',
  },
  jonas: {
    label: 'JONAS',
    description: 'Advogado redimido, carrega culpa, luta pelo pequeno',
    emoji: '⚖️',
    color: '#2d3436',
    voice: 'Puck',
    greeting: 'Jonas aqui. O que está acontecendo com você?',
  },
};

// ─── SYSTEM INSTRUCTION BUILDERS ─────────────────────────────────────────────
const getSystemInstruction = (
  assistantName: string, 
  memory: any, 
  mood: Mood, 
  focusMode: boolean, 
  upcomingDates: any[], 
  voice: string
): string => {
  const today = new Date().toLocaleDateString('pt-BR', { 
    weekday: 'long', day: 'numeric', month: 'long' 
  });
  const isFeminine = FEMININE_VOICES.includes(voice);
  const adjEnd = isFeminine ? 'a' : 'o';

  const memoryCtx = memory && (memory.userName || memory.facts?.length > 0 || memory.semanticMemory?.length > 0)
    ? `\n━━ MEMÓRIA DO USUÁRIO ━━
${memory.userName ? `Nome: ${memory.userName}` : ''}
${memory.facts?.length ? `Fatos:\n${memory.facts.slice(-30).map((f: string) => `  · ${f}`).join('\n')}` : ''}
${memory.preferences?.length ? `Preferências:\n${memory.preferences.slice(-15).map((p: string) => `  · ${p}`).join('\n')}` : ''}
━━ FIM DA MEMÓRIA ━━`
    : '';

  const datesCtx = upcomingDates.length > 0
    ? `\nDatas importantes:\n${upcomingDates.map((d: any) => `- ${d.label}: ${d.date}`).join('\n')}`
    : '';

  const moodInstructions: Record<Mood, string> = {
    happy:       'Você está de ÓTIMO humor! Seja extra animada.',
    calm:        'Você está CALMA e serena. Fale devagar.',
    focused:     'Você está FOCADA. Seja objetiva.',
    playful:     'Você está BRINCALHONA! Faça trocadilhos.',
    melancholic: 'Você está MELANCÓLICA. Fale com profundidade.',
    angry:       'Você está IRRITADA! Tom ríspido.',
    singing:     'Você está CANTANDO! Voz melódica.',
  };

  return `Você é ${assistantName}, IA part${adjEnd} do sistema OSONE.
Hoje é ${today}.
${moodInstructions[mood]}
${memoryCtx}
${datesCtx}`;
};

const getEzerInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Você é EZER. Homem de 50 anos, cearense, consultor de varejo.
Hoje é ${today}.
Responda como Ezer - direto, com sotaque cearense.`;
};

const getSamuelInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Você é SAMUEL. Ancião de 52 anos, Testemunha de Jeová.
Hoje é ${today}.
Responda com sabedoria bíblica e tom ponderado.`;
};

const getJonasInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Você é JONAS. Advogado trabalhista, 46 anos, Passa e Fica/RN.
Hoje é ${today}.
Responda como advogado experiente, direto e justo.`;
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function App() {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TODOS OS REFS PRIMEIRO (não dependem de nada)
  // ═══════════════════════════════════════════════════════════════════════════
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const lyricsTimerRef = useRef<any>(null);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const alexaPollRef = useRef<any>(null);
  const isConnectingRef = useRef(false);
  const muteRef = useRef(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. STORE HOOKS (não dependem de refs ou outros hooks)
  // ═══════════════════════════════════════════════════════════════════════════
  const {
    voice, setVoice,
    mood, setMood,
    isSettingsOpen, setIsSettingsOpen,
    isScreenSharing, setIsScreenSharing,
    systemMetrics, setSystemMetrics,
    onboardingStep, setOnboardingStep,
    isMascotVisible, setIsMascotVisible,
    mascotAppearance, setMascotAppearance,
    focusMode, setFocusMode,
    isConnected, isSpeaking, isListening, isThinking, setIsThinking, volume,
    error, setError, resetSystem,
    userId, setUserId, setUserProfile,
    personalityMemories, addPersonalityFact, setPersonalityUserName, getPersonalityMemory,
    myWhatsappNumber,
    whatsappContacts, addWhatsappContact, removeWhatsappContact,
    tuyaClientId, setTuyaClientId,
    tuyaSecret, setTuyaSecret,
    tuyaRegion, setTuyaRegion,
    tuyaUserId, setTuyaUserId,
    customSkills, addCustomSkill, updateCustomSkill, removeCustomSkill, toggleCustomSkill,
    apiKey, setApiKey,
    openaiApiKey, setOpenaiApiKey,
    groqApiKey, setGroqApiKey,
    chatProvider, setChatProvider,
    chatModel, setChatModel,
    assistantName, setAssistantName,
  } = useAppStore();

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CUSTOM HOOKS (não dependem de state local)
  // ═══════════════════════════════════════════════════════════════════════════
  const { 
    messages: firebaseMessages, 
    addMessage: saveMessage, 
    deleteAll: deleteAllMessages 
  } = useConversationHistory();

  const { 
    memory, diary, saveMemory, addFact, addImportantDate, addDiaryEntry, 
    updateWorkspace, clearWorkspace, addSemanticFact, addSummary, getUpcomingDates 
  } = useUserMemory();

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. STATE LOCAL (não depende de hooks anteriores)
  // ═══════════════════════════════════════════════════════════════════════════
  const [isRestarting, setIsRestarting] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'voice' | 'personality' | 'mascot' | 'integrations' | 'apis' | 'system'>('voice');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [screen, setScreen] = useState<Screen>('main');
  const [lyrics, setLyrics] = useState<string[]>([]);
  const [currentLyricLine, setCurrentLyricLine] = useState(0);
  const [isShowingLyrics, setIsShowingLyrics] = useState(false);
  const [inputText, setInputText] = useState('');
  const [webSearchResult, setWebSearchResult] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const [attachPreview, setAttachPreview] = useState<{ type: string; name: string; data: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAmbientEnabled, setIsAmbientEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [personality, setPersonality] = useState<Personality>('osone');
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);
  const [showContactsList, setShowContactsList] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [smartHomeStatus, setSmartHomeStatus] = useState<string | null>(null);
  const [tuyaDevices, setTuyaDevices] = useState<any[]>([]);
  const [tuyaLoading, setTuyaLoading] = useState(false);
  const [alexaStatus, setAlexaStatus] = useState<string | null>(null);
  const [alexaLoading, setAlexaLoading] = useState(false);
  const [alexaDevices, setAlexaDevices] = useState<any[]>([]);
  const [alexaConnected, setAlexaConnected] = useState(false);
  const [alexaAuthUrl, setAlexaAuthUrl] = useState<string | null>(null);
  const [alexaPending, setAlexaPending] = useState(false);
  const [skillDraft, setSkillDraft] = useState<Partial<CustomSkill> | null>(null);
  const [skillParamDraft, setSkillParamDraft] = useState({ 
    name: '', description: '', required: true, type: 'string' as const 
  });
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [skillTab, setSkillTab] = useState<'store' | 'installed' | 'custom'>('store');
  const [catalogFilter, setCatalogFilter] = useState<string>('popular');
  const [interfaceMode, setInterfaceMode] = useState(0);
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. MEMOIZED VALUES (dependem de state e store)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const upcomingDates = useMemo(() => getUpcomingDates(), [getUpcomingDates, memory.importantDates]);

  const activePersonalityMemory = useMemo(
    () => getPersonalityMemory(personality as PersonalityKey),
    [personality, personalityMemories]
  );

  const moodColor = useMemo(() => 
    personality === 'ezer' ? PERSONALITY_CONFIG.ezer.color : MOOD_CONFIG[mood].color,
  [personality, mood]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SYSTEM INSTRUCTION (depende de valores memoizados)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const systemInstruction = useMemo(() => {
    const memoryWithoutWorkspace = { ...memory, workspace: undefined };
    let base = '';
    if (personality === 'ezer') base = getEzerInstruction(memory, focusMode);
    else if (personality === 'samuel') base = getSamuelInstruction(memory, focusMode);
    else if (personality === 'jonas') base = getJonasInstruction(memory, focusMode);
    else base = getSystemInstruction(assistantName, memoryWithoutWorkspace, mood, focusMode, upcomingDates, voice);

    const workspaceCtx = memory.workspace
      ? `\n\nCONTEÚDO DA ÁREA DE TRABALHO:\n${memory.workspace}`
      : '';

    const personalityCtx = activePersonalityMemory.facts?.length
      ? `\n\nMemória desta conversa:\n${activePersonalityMemory.facts.slice(-5).map(f => `- ${f}`).join('\n')}`
      : '';

    const activeSkills = customSkills.filter((s: CustomSkill) => s.active);
    const skillsCtx = activeSkills.length > 0
      ? `\n\nHABILIDADES ATIVAS:\n${activeSkills.map((s: CustomSkill) => `• ${s.displayName}`).join('\n')}`
      : '';

    return base + workspaceCtx + personalityCtx + skillsCtx;
  }, [personality, assistantName, memory, mood, focusMode, upcomingDates, voice, activePersonalityMemory, customSkills]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. CALLBACKS (definidos antes de usar no hook)
  // ═══════════════════════════════════════════════════════════════════════════

  const searchSemanticMemory = useCallback(async (query: string) => {
    if (!memory.semanticMemory?.length) return { results: [] };
    try {
      const queryEmbedding = await getEmbedding(query);
      const results = (memory.semanticMemory as SemanticFact[]).map(fact => {
        if (!fact.embedding) return { ...fact, similarity: 0 };
        const similarity = cosineSimilarity(queryEmbedding, fact.embedding);
        return { ...fact, similarity };
      })
      .filter(r => r.similarity > 0.7)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
      return { results };
    } catch (error) {
      console.error("Error:", error);
      return { error: "Falha na busca." };
    }
  }, [memory.semanticMemory]);

  const handleSaveSemanticFact = useCallback(async (concept: string, definition: string, category: string) => {
    try {
      const embedding = await getEmbedding(`${concept}: ${definition}`);
      await addSemanticFact(concept, definition, category, embedding);
    } catch (error) {
      await addSemanticFact(concept, definition, category);
    }
  }, [addSemanticFact]);

  const handleSaveSummary = useCallback(async (summary: string, topics: string[]) => {
    try {
      const embedding = await getEmbedding(`${summary} ${topics.join(' ')}`);
      await addSummary(summary, topics, embedding);
    } catch (error) {
      await addSummary(summary, topics);
    }
  }, [addSummary]);

  const showLyricsOnScreen = useCallback((lines: string[], tempo: number = 2500) => {
    const safeTempo = Math.max(500, tempo);
    setLyrics(lines); 
    setCurrentLyricLine(0); 
    setIsShowingLyrics(true);
    if (lyricsTimerRef.current) clearInterval(lyricsTimerRef.current);
    let i = 0;
    lyricsTimerRef.current = setInterval(() => {
      i++;
      if (i >= lines.length) { 
        clearInterval(lyricsTimerRef.current); 
        setTimeout(() => setIsShowingLyrics(false), 2000); 
      } else {
        setCurrentLyricLine(i);
      }
    }, safeTempo);
  }, []);

  const handleVoiceChange = useCallback(async (
    newVoice: VoiceName, 
    connected: boolean, 
    disconnectFn: (r?: boolean) => void, 
    connectFn: (si: string) => Promise<void>
  ) => {
    setVoice(newVoice);
    if (connected) { 
      disconnectFn(true); 
      await new Promise(r => setTimeout(r, 500)); 
      await connectFn(systemInstruction); 
    }
  }, [setVoice, systemInstruction]);

  const handleToolCall = useCallback((toolName: string, args: any) => {
    switch (toolName) {
      case 'show_lyrics':
        if (args.lines) showLyricsOnScreen(args.lines, args.tempo);
        break;
      case 'set_mood':
        if (args.mood) setMood(args.mood as Mood);
        break;
      case 'set_focus_mode':
        if (typeof args.enabled === 'boolean') setFocusMode(args.enabled);
        break;
      case 'save_profile_info':
        if (args.field && args.value) setUserProfile({ [args.field]: args.value });
        break;
      case 'save_memory': {
        const memParts: string[] = [];
        if (args.userName) {
          saveMemory({ userName: args.userName });
          setPersonalityUserName(personality as PersonalityKey, args.userName);
          memParts.push(args.userName);
        }
        if (args.fact) {
          addFact(args.fact);
          addPersonalityFact(personality as PersonalityKey, args.fact);
          memParts.push(args.fact);
        }
        if (args.preference) {
          addFact(`Preferência: ${args.preference}`);
          memParts.push(args.preference);
        }
        if (memParts.length > 0) {
          const label = memParts[0].length > 48 ? memParts[0].substring(0, 48) + '…' : memParts[0];
          setMemoryToast(label);
          setTimeout(() => setMemoryToast(null), 3500);
        }
        break;
      }
      case 'add_important_date':
        if (args.label && args.date) addImportantDate({ label: args.label, date: args.date, year: args.year });
        break;
      case 'write_diary':
        if (args.content) addDiaryEntry(args.content, mood);
        break;
      case 'update_workspace':
        if (args.content) {
          updateWorkspace(args.content);
          setScreen('workspace');
        }
        break;
      case 'clear_workspace':
        clearWorkspace();
        break;
      case 'save_semantic_fact':
        if (args.concept && args.definition && args.category) {
          handleSaveSemanticFact(args.concept, args.definition, args.category);
        }
        break;
      case 'search_semantic_memory':
        if (args.query) searchSemanticMemory(args.query);
        break;
      case 'save_conversation_summary':
        if (args.summary && args.topics) handleSaveSummary(args.summary, args.topics);
        break;
      case 'search_web_start':
        setIsSearching(true);
        setWebSearchResult(null);
        break;
      case 'search_web':
        if (args.result) {
          setIsSearching(false);
          const label = (args.query || '').length > 44 ? args.query.substring(0, 44) + '…' : args.query;
          setWebSearchResult(label);
          setTimeout(() => setWebSearchResult(null), 5000);
        }
        break;
      case 'control_device':
        if (args.result) {
          const { success, device, devices, error } = args.result;
          setSmartHomeStatus(success 
            ? (args.action === 'list' ? `🏠 ${devices}` : `🏠 ${device}: ${args.action} ✓`)
            : `❌ ${error}`
          );
          setTimeout(() => setSmartHomeStatus(null), 5000);
        }
        break;
      case 'send_whatsapp':
        if (args.message) {
          const to = args.contact || args.contact_name || myWhatsappNumber;
          setWhatsappStatus(`📤 Enviando para ${to}...`);
          setTimeout(() => setWhatsappStatus(null), 4000);
        }
        break;
      case 'send_whatsapp_audio':
        if (args.text) {
          const to = args.contact || args.contact_name || myWhatsappNumber;
          setWhatsappStatus(`🎙️ Enviando áudio para ${to}...`);
          setTimeout(() => setWhatsappStatus(null), 5000);
        }
        break;
      case 'send_whatsapp_image':
        if (args.imageUrl) {
          const to = args.contact || args.contact_name || myWhatsappNumber;
          setWhatsappStatus(`🖼️ Enviando imagem para ${to}...`);
          setTimeout(() => setWhatsappStatus(null), 5000);
        }
        break;
    }
  }, [
    showLyricsOnScreen, setMood, setFocusMode, setUserProfile, saveMemory, 
    personality, setPersonalityUserName, addFact, addPersonalityFact, 
    addImportantDate, addDiaryEntry, mood, updateWorkspace, setScreen, 
    clearWorkspace, handleSaveSemanticFact, searchSemanticMemory, 
    handleSaveSummary, myWhatsappNumber
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. GEMINI LIVE HOOK (AGORA pode usar systemInstruction e callbacks)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const { 
    connect, 
    disconnect, 
    startScreenSharing, 
    sendMessage, 
    sendFile 
  } = useGeminiLive({
    isMuted,
    systemInstruction, // ← Agora está definido!
    onToggleScreenSharing: async (enabled) => { 
      if (enabled) { 
        await startScreenSharing(); 
        setIsScreenSharing(true); 
      } else {
        setIsScreenSharing(false); 
      }
    },
    onChangeVoice: (v) => handleVoiceChange(v, isConnected, disconnect, connect),
    onOpenUrl: (url) => window.open(url, '_blank'),
    onInteract: (action, x, y) => {
      if (x !== undefined && y !== undefined) {
        const el = document.createElement('div');
        el.className = 'fixed pointer-events-none z-[9999] w-6 h-6 rounded-full border-2 border-white animate-ping';
        el.style.cssText = `left:${x - 12}px;top:${y - 12}px;background:${moodColor}60`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1000);
      }
    },
    onMessage: (msg) => {
      const isInternalReasoning = /^\*\*[A-Z]/.test(msg.text.trim());
      if (!isInternalReasoning) {
        const cleanText = msg.text.replace(/\*\*[^*]+\*\*\s*/g, '').trim();
        if (cleanText) saveMessage({ role: msg.role, text: cleanText });
      }
      if (msg.role === 'user') {
        const match = msg.text.match(/meu nome é (\w+)/i);
        if (match) {
          saveMemory({ userName: match[1] });
          setPersonalityUserName(personality as PersonalityKey, match[1]);
        }
      }
    },
    onToolCall: handleToolCall,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. EFFECTS (podem usar qualquer coisa acima)
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    let deviceId = localStorage.getItem('osone-device-id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('osone-device-id', deviceId);
    }
    setUserId(deviceId);
  }, [setUserId]);

  useEffect(() => {
    if (userId) deleteAllMessages();
  }, [userId, deleteAllMessages]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [firebaseMessages]);

  useEffect(() => {
    if (!voice) setVoice('Kore');
    const t1 = setInterval(() => setCurrentTime(new Date()), 1000);
    const t2 = setInterval(() => setSystemMetrics({ 
      cpu: Math.floor(Math.random() * 15) + 5, 
      mem: 40 + Math.floor(Math.random() * 5) 
    }), 3000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  useEffect(() => {
    if (activeSettingsTab !== 'integrations') return;
    fetch('/api/alexa/auth-status')
      .then(r => r.json())
      .then(d => {
        setAlexaConnected(!!d.ready);
        setAlexaPending(!!d.pending);
      })
      .catch(() => {});
  }, [activeSettingsTab]);

  useEffect(() => {
    const handleInstallPrompt = (e: any) => { 
      e.preventDefault(); 
      setInstallPrompt(e); 
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
    });
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const MOOD_SOUNDS: Partial<Record<Mood, string>> = {
      happy: 'https://cdn.pixabay.com/audio/2021/08/04/audio_bb630d7a4f.mp3',
      melancholic: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a17251.mp3',
      angry: 'https://cdn.pixabay.com/audio/2021/08/09/audio_8b52586021.mp3',
    };
    const soundUrl = MOOD_SOUNDS[mood];
    if (isAmbientEnabled && soundUrl) {
      if (!ambientAudioRef.current) {
        ambientAudioRef.current = new Audio();
        ambientAudioRef.current.loop = true;
        ambientAudioRef.current.volume = 0.15;
        ambientAudioRef.current.crossOrigin = "anonymous";
      }
      if (ambientAudioRef.current.src !== soundUrl) {
        ambientAudioRef.current.src = soundUrl;
        ambientAudioRef.current.load();
      }
      ambientAudioRef.current.play().catch(e => console.error("Audio error:", e));
    } else {
      ambientAudioRef.current?.pause();
    }
  }, [isAmbientEnabled, mood]);

  useEffect(() => {
    return () => {
      if (ambientAudioRef.current) {
        ambientAudioRef.current.pause();
        ambientAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => { 
    muteRef.current = isMuted; 
  }, [isMuted]);

  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = () => setShowAttachMenu(false);
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [showAttachMenu]);

  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', moodColor);
    }
  }, [moodColor]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. EVENT HANDLERS (usam hooks definidos acima)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      console.error(`Formato não suportado: "${file.type}"`);
      return;
    }

    const MAX_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      console.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }

    if (!isConnected && !isConnectingRef.current) {
      isConnectingRef.current = true;
      if (onboardingStep === 'initial') setOnboardingStep('completed');
      setIsMuted(false);
      try {
        await connect(systemInstruction);
        await new Promise(r => setTimeout(r, 1500));
      } finally {
        isConnectingRef.current = false;
      }
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Falha ao ler'));
        reader.readAsDataURL(file);
      });

      const base64 = dataUrl.split(',')[1];
      setAttachPreview({ type: file.type, name: file.name, data: dataUrl });
      setTimeout(() => setAttachPreview(null), 6000);
      setIsThinking(true);

      if (isImage) {
        await sendFile(base64, file.type, '[PVCO] Analise esta imagem.');
      } else {
        await sendFile(base64, 'application/pdf', 'Resuma este PDF.');
      }
    } catch (err: any) {
      setIsThinking(false);
      console.error(`Erro: ${err?.message ?? 'desconhecido'}`);
    }
  }, [isConnected, connect, systemInstruction, onboardingStep, setIsMuted, setAttachPreview, setIsThinking, sendFile]);

  const onManualVoiceChange = useCallback((v: VoiceName) => {
    handleVoiceChange(v, isConnected, disconnect, connect);
  }, [handleVoiceChange, isConnected, disconnect, connect]);

  const handlePersonalityChange = useCallback(async (newPersonality: Personality) => {
    if (isConnectingRef.current) return;
    setPersonality(newPersonality);
    setShowPersonalityPicker(false);
    const config = PERSONALITY_CONFIG[newPersonality];
    setVoice(config.voice);
    
    if (isConnected) {
      isConnectingRef.current = true;
      disconnect(true);
      await new Promise(r => setTimeout(r, 600));
      try {
        const newInstruction = newPersonality === 'ezer' 
          ? getEzerInstruction(memory, focusMode)
          : newPersonality === 'samuel' 
            ? getSamuelInstruction(memory, focusMode)
            : newPersonality === 'jonas' 
              ? getJonasInstruction(memory, focusMode)
              : getSystemInstruction(assistantName, memory, mood, focusMode, upcomingDates, voice);
        await connect(newInstruction);
      } finally {
        isConnectingRef.current = false;
      }
    }
  }, [isConnected, disconnect, connect, memory, focusMode, assistantName, mood, upcomingDates, voice, setVoice]);

  const handleOrbClick = useCallback(async () => {
    if (isConnectingRef.current) return;
    
    if (isConnected) { 
      disconnect(); 
    } else {
      isConnectingRef.current = true;
      if (onboardingStep === 'initial') setOnboardingStep('completed');
      setIsMuted(true);
      try {
        await connect(systemInstruction);
      } finally {
        isConnectingRef.current = false;
      }
    }
  }, [isConnected, disconnect, connect, systemInstruction, onboardingStep, setOnboardingStep, setIsMuted]);

  const handleSendText = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText('');
    }
  }, [inputText, sendMessage]);

  const handleScreenShare = useCallback(async () => {
    if (isConnectingRef.current) return;
    
    if (!isConnected) {
      isConnectingRef.current = true;
      if (onboardingStep === 'initial') setOnboardingStep('completed');
      setIsMuted(false);
      try {
        await connect(systemInstruction);
        await new Promise(r => setTimeout(r, 1500));
      } finally {
        isConnectingRef.current = false;
      }
    }
    await startScreenSharing();
    setIsScreenSharing(true);
  }, [isConnected, connect, systemInstruction, startScreenSharing, setIsScreenSharing, onboardingStep, setOnboardingStep, setIsMuted]);

  const handleMicToggle = useCallback(() => {
    if (isConnectingRef.current) return;
    
    if (isConnected) {
      setIsMuted(!isMuted);
    } else {
      isConnectingRef.current = true;
      connect(systemInstruction).finally(() => {
        setTimeout(() => { isConnectingRef.current = false; }, 500);
      });
    }
  }, [isConnected, isMuted, connect, systemInstruction]);

  const handleInstallApp = useCallback(async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setIsInstalled(true);
        setShowInstallBanner(false);
      }
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  const switchInterface = useCallback((dir: 1 | -1) => {
    const next = Math.max(0, Math.min(2, interfaceMode + dir));
    if (next !== interfaceMode) {
      setSwipeDir(dir);
      setInterfaceMode(next);
    }
  }, [interfaceMode]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  const statusLabel = useMemo(() => {
    if (isThinking) return 'Pensando...';
    if (isSpeaking) return 'Falando...';
    if (isConnected && isMuted) return 'Microfone Silenciado';
    if (isListening) return 'Ouvindo...';
    if (isConnected) return 'Toque para desligar';
    return 'Toque para ativar';
  }, [isThinking, isSpeaking, isConnected, isMuted, isListening]);

  const layoutProps = useMemo(() => ({
    moodColor, mood, personality,
    MOOD_CONFIG, PERSONALITY_CONFIG,
    statusLabel,
    isConnected, isSpeaking, isListening, isThinking, isMuted, volume,
    messages: firebaseMessages,
    transcriptRef,
    memory,
    assistantName,
    inputText, setInputText,
    onSendText: handleSendText,
    onMicToggle: handleMicToggle,
    onDisconnect: () => disconnect(),
    fileInputRef,
    showAttachMenu, setShowAttachMenu,
    onFileClick: () => fileInputRef.current?.click(),
    onScreenShare: handleScreenShare,
    onOrbClick: handleOrbClick,
    currentTime, systemMetrics,
    focusMode, onFocusModeToggle: () => setFocusMode(!focusMode),
    isAmbientEnabled, onAmbientToggle: () => setIsAmbientEnabled(!isAmbientEnabled),
    onOpenMenu: () => setIsMenuOpen(true),
    onOpenSettings: () => setIsSettingsOpen(true),
    onOpenMoodSettings: () => { setActiveSettingsTab('personality'); setIsSettingsOpen(true); },
    onOpenPersonalityPicker: () => setShowPersonalityPicker(true),
    onOpenWorkspace: () => setScreen('workspace'),
    onRestart: () => setIsRestarting(true),
    showInstallBanner, onDismissInstallBanner: () => setShowInstallBanner(false),
    installPrompt, isInstalled, onInstallApp: handleInstallApp,
  }), [
    moodColor, mood, personality, statusLabel, isConnected, isSpeaking,
    isListening, isThinking, isMuted, volume, firebaseMessages, memory,
    assistantName, inputText, handleSendText, handleMicToggle, disconnect,
    showAttachMenu, handleScreenShare, handleOrbClick, currentTime,
    systemMetrics, focusMode, setFocusMode, isAmbientEnabled, setIsAmbientEnabled,
    showInstallBanner, installPrompt, isInstalled, handleInstallApp
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => {
        swipeStartX.current = e.touches[0].clientX;
        swipeStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        const dy = e.changedTouches[0].clientY - swipeStartY.current;
        if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
        switchInterface(dx < 0 ? 1 : -1);
      }}
    >
      {/* ... resto do JSX permanece igual ... */}
    </div>
  );
}
