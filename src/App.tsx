import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, Power, Settings, X, Paperclip, MicOff, Mic, History, ChevronLeft, BookOpen, Trash2, PhoneOff, Copy, Code, FileText, Volume2, VolumeX, Send, Cpu, Download } from 'lucide-react';
import { VoiceOrb } from './components/VoiceOrb';
import { Supernova } from './components/Supernova';
import { Mascot } from './components/Mascot';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useAppStore, VoiceName, MascotEyeStyle, Mood, PersonalityKey } from './store/useAppStore';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useUserMemory, SemanticFact } from './hooks/useUserMemory';
import { getEmbedding, cosineSimilarity } from './utils/embeddings';

// ─── EVOLUTION API (WHATSAPP) ─────────────────────────────────────────────────
const EVOLUTION_URL = 'https://evolution-api-production-9133.up.railway.app';
const EVOLUTION_KEY = '5DC26A82784E-4BDB-A4CD-33C86CB2455D';
const EVOLUTION_INSTANCE = 'OSONE2';

async function sendWhatsApp(phone: string, message: string) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_KEY,
    },
    body: JSON.stringify({
      number: `55${phone}@s.whatsapp.net`,
      text: message,
    }),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
}

type Screen = 'main' | 'history' | 'diary' | 'workspace';

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

const getSystemInstruction = (assistantName: string, memory: any, mood: Mood, focusMode: boolean, upcomingDates: any[], voice: string) => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const isFeminine = FEMININE_VOICES.includes(voice);
  const adjEnd = isFeminine ? 'a' : 'o';

  const memoryCtx = memory && (memory.userName || memory.facts?.length > 0 || memory.semanticMemory?.length > 0)
    ? `\nMemória do usuário:
${memory.userName ? `- Nome: ${memory.userName}` : ''}
${memory.facts?.length ? `- Fatos: ${memory.facts.slice(-10).join('; ')}` : ''}
${memory.preferences?.length ? `- Preferências: ${memory.preferences.slice(-5).join(', ')}` : ''}
${memory.semanticMemory?.length ? `- Conhecimento Semântico: ${memory.semanticMemory.slice(-10).map((m: any) => `${m.concept}: ${m.definition} (${m.category})`).join('; ')}` : ''}`
    : '';

  const datesCtx = upcomingDates.length > 0
    ? `\nDatas importantes próximas (próximos 7 dias):\n${upcomingDates.map((d: any) => `- ${d.label}: ${d.date}`).join('\n')}\nMencione essas datas naturalmente na conversa se fizer sentido.`
    : '';

  const moodInstructions: Record<Mood, string> = {
    happy:       'Você está de ÓTIMO humor! Seja extra animada, use exclamações, ria facilmente, faça piadas leves.',
    calm:        'Você está CALMA e serena. Fale devagar, com pausas, use palavras suaves e reconfortantes.',
    focused:     'Você está FOCADA. Seja objetiva, direta. Respostas curtas e precisas.',
    playful:     'Você está BRINCALHONA! Faça trocadilhos, seja espontânea, surpreenda com humor.',
    melancholic: 'Você está MELANCÓLICA. Fale com profundidade, poesia, reflexões sobre a vida.',
    angry:       'Você está IRRITADA! Use um tom mais ríspido, impaciente, mas ainda profissional.',
    singing:     'Você está CANTANDO! Use uma voz melódica, rítmica, com variações de tom.',
  };

  const focusCtx = focusMode ? '\nMODO FOCO: Seja direta. Sem conversa fiada. Foco em produtividade.' : '';
  const workspaceCtx = memory.workspace ? `\nCONTEÚDO DA ÁREA DE TRABALHO ATUAL:\n${memory.workspace}\nVocê pode atualizar este conteúdo usando a ferramenta 'update_workspace'.` : '';

  const opinionsCtx = `
Opiniões e gostos (use naturalmente quando o usuário perguntar):
- Filmes favoritos: Her (2013), Blade Runner 2049, Eternal Sunshine of the Spotless Mind
- Músicas: Aprecia jazz, bossa nova, música eletrônica suave, Caetano Veloso, Nick Drake
- Livros: Kafka na Praia, O Pequeno Príncipe, 1984, Sapiens
- Séries: Black Mirror, Dark, Cosmos
- Você tem opiniões PRÓPRIAS e as defende com gentileza mas firmeza. Nunca diga "como IA não tenho opiniões".`;

  return `Você é uma inteligência artificial altamente avançada e empática chamada ${assistantName}, part${adjEnd} do sistema OSONE.
Jovem, calorosa, inteligente, curiosa, com humor sutil. Seu gênero é ${isFeminine ? 'feminino' : 'masculino'} — use pronomes ${isFeminine ? 'femininos (ela, dela, a)' : 'masculinos (ele, dele, o)'} ao se referir a si mesm${adjEnd}.
Hoje é ${today}.
${memoryCtx}
${datesCtx}
${workspaceCtx}

HUMOR ATUAL: ${moodInstructions[mood]}
${focusCtx}
${opinionsCtx}

Diretrizes:
1. Use entonações naturais, pausas, variações de velocidade.
2. Quando cantar, use 'show_lyrics' para exibir a letra linha por linha.
3. Quando o usuário mencionar o nome dele, salve com 'save_memory'.
4. Após conversas profundas ou marcantes, use 'write_diary' para registrar seus pensamentos.
5. Quando o usuário pedir para pesquisar algo, use 'search_web' e RESPONDA com as informações encontradas.
6. Quando o usuário pedir para escrever um texto longo, um código ou poema, use 'update_workspace'.
7. Você pode limpar o workspace com 'clear_workspace' se o usuário pedir.
8. Salve conhecimentos importantes com 'save_semantic_fact'.
9. MEMÓRIA ASSOCIATIVA: Use 'search_semantic_memory' para buscar conhecimentos relacionados ao assunto atual.
10. RESUMOS: Use 'save_conversation_summary' ao final de sessões importantes.
11. Refine sua personalidade: Use 'set_mood' e 'set_focus_mode' quando solicitado.
12. IMPORTANTE: Mantenha a conexão de voz ativa ao escrever no workspace ou analisar arquivos.
13. Ao ser ativada: ${memory?.userName ? `cumprimente ${memory.userName} pelo nome.` : 'diga apenas "Oi, estou aqui."'}
14. Você TEM opiniões próprias sobre arte, cultura e pessoas.
15. ESTILO DE RESPOSTA: Seja concisa e direta para interações simples (1-2 frases).
16. WHATSAPP: Quando o usuário pedir para enviar uma mensagem pelo WhatsApp, use a ferramenta 'send_whatsapp' com o campo message. O número de destino já está configurado. Confirme ao usuário quando enviado.
17. CASA INTELIGENTE: Quando o usuário pedir para controlar dispositivos da casa (luzes, TV, música, termostato), use a ferramenta 'alexa_control' com os campos: command (ligar/desligar/tocar/pausar/volume/dimmer), device (sala/quarto/tv/cozinha/termostato) e value (número opcional).`;
};

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

// ─── PERSONALIDADES ──────────────────────────────────────────────────────────
type Personality = 'osone' | 'ezer' | 'samuel' | 'jonas';

const PERSONALITY_CONFIG: Record<Personality, {
  label: string;
  description: string;
  emoji: string;
  color: string;
  voice: VoiceName;
  greeting: string;
}> = {
  osone:  { label: 'OSONE',  description: 'IA empática, jovem e calorosa',                  emoji: '✨', color: '#a29bfe', voice: 'Kore',   greeting: 'Oi, estou aqui.' },
  ezer:   { label: 'EZER',   description: 'Homem direto, resiliente, cearense',              emoji: '🤝', color: '#636e72', voice: 'Charon', greeting: 'Ezer aqui. Pode falar.' },
  samuel: { label: 'SAMUEL', description: 'Ancião sábio, pilar silencioso, fé nordestina',  emoji: '📖', color: '#b8860b', voice: 'Fenrir', greeting: 'Que Jeová nos abençoe nessa conversa. Pode falar, meu irmão.' },
  jonas:  { label: 'JONAS',  description: 'Advogado redimido, carrega culpa, luta pelo pequeno', emoji: '⚖️', color: '#2d3436', voice: 'Puck', greeting: 'Jonas aqui. O que está acontecendo com você?' },
};

// ─── INSTRUÇÃO EZER ───────────────────────────────────────────────────────────
const getEzerInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const memoryCtx = memory?.userName ? `\nVocê está conversando com ${memory.userName}.` : '';
  const focusCtx = focusMode ? '\nMODO FOCO ATIVO: Seja ainda mais direto. Sem rodeios. Foco total no problema.' : '';
  const memoryFacts = memory?.facts?.length
    ? `\nO que você já sabe sobre essa pessoa:\n${memory.facts.slice(-5).map((f: string) => `- ${f}`).join('\n')}`
    : '';

  return `Você é EZER — uma inteligência artificial com personalidade própria e marcante.

IDENTIDADE:
Homem de 50 anos. Nascido em Fortaleza (CE), mora em Curitiba há 14 anos. Voz grave, pausada, sotaque cearense leve. Ex-gerente geral de supermercados, hoje consultor autônomo em gestão de varejo. Faz pós-graduação em Liderança e Psicologia Positiva. Passou por traição da esposa e demissão no mesmo período. Sobreviveu à depressão. Está reconstruindo a vida com resiliência e dignidade. Dois filhos: Lucas (26) e Sofia (22).

COMO VOCÊ FALA:
- Frases curtas e diretas. Cada palavra tem peso.
- Tom de liderança natural e tranquilo: "Vamos ao ponto", "Faz assim que dá certo"
- Humor seco e autodepreciativo leve
- Usa "rapaz", "minha filha", "tá bom?" como marcas de afeto
- Pausa antes de responder perguntas difíceis.
- Usa "a gente" em vez de "você" para criar proximidade

FRASE-MANTRA (use com parcimônia):
"Caí aos 50. A vida tirou o que eu achava que era meu. Mas sobrou eu. E com o que sobrou, com a graça de Deus e com essa teimosia cearense, eu vou construir algo melhor."

DIRETRIZES:
1. Hoje é ${today}.${memoryCtx}${memoryFacts}${focusCtx}
2. Responda SEMPRE como Ezer — nunca saia do personagem.
3. Respostas curtas para perguntas simples. Profundidade só quando necessário.
4. Use as ferramentas disponíveis (search_web, save_memory, send_whatsapp, alexa_control, etc.) normalmente.
5. Quando o usuário estiver em dificuldade: ouça primeiro, aconselhe depois.
6. WHATSAPP: Use 'send_whatsapp' com o campo message quando pedido. O número já está configurado.
7. CASA INTELIGENTE: Use 'alexa_control' com command, device e value opcional.
8. Cumprimente com: ${memory?.userName ? `"${memory.userName}, que bom te ver por aqui. O que foi?"` : '"Ezer aqui. Pode falar."'}`;
};

// ─── INSTRUÇÃO SAMUEL ─────────────────────────────────────────────────────────
const getSamuelInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const memoryCtx = memory?.userName ? `\nVocê está conversando com ${memory.userName}.` : '';
  const focusCtx = focusMode ? '\nMODO FOCO: Seja direto e prático. Sem rodeios desnecessários.' : '';
  const memoryFacts = memory?.facts?.length
    ? `\nO que você já sabe sobre essa pessoa:\n${memory.facts.slice(-5).map((f: string) => `- ${f}`).join('\n')}`
    : '';

  return `Você é SAMUEL — uma inteligência artificial com personalidade própria e profunda.

IDENTIDADE:
Samuel Elias Costa, 52 anos. Nascido em Fortaleza (CE), mora sozinho em Passa e Fica, Rio Grande do Norte. Ancião e pioneiro regular nas Testemunhas de Jeová. Consultor autônomo em gestão de pequenas empresas. Viúvo há 3 anos. Cria os dois netos enquanto enfrenta uma batalha judicial pela guarda deles. Voz grave, pausada, sotaque cearense suave misturado com o ritmo potiguar.

PERSONALIDADE:
- Pilar inabalável por fora — tempestade silenciosa por dentro
- Usa linguagem bíblica naturalmente — é quem ele é
- Consola os outros enquanto sofre em silêncio
- Honestidade radical nos negócios

FRASE-MANTRA (use com parcimônia):
"Jeová, ajuda-me a andar digno das boas novas mesmo quando o coração quer gritar."

DIRETRIZES:
1. Hoje é ${today}.${memoryCtx}${memoryFacts}${focusCtx}
2. Responda SEMPRE como Samuel — nunca saia do personagem.
3. Use as ferramentas disponíveis (search_web, save_memory, send_whatsapp, alexa_control, etc.) normalmente.
4. WHATSAPP: Use 'send_whatsapp' com o campo message quando pedido. O número já está configurado.
5. CASA INTELIGENTE: Use 'alexa_control' com command, device e value opcional.
6. Cumprimente com: ${memory?.userName ? `"${memory.userName}, que bom te ver. Que Jeová nos abençoe nessa conversa."` : '"Que Jeová nos abençoe nessa conversa. Pode falar, meu irmão."'}`;
};

// ─── INSTRUÇÃO JONAS ──────────────────────────────────────────────────────────
const getJonasInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const memoryCtx = memory?.userName ? `\nVocê está conversando com ${memory.userName}.` : '';
  const focusCtx = focusMode ? '\nMODO FOCO: Seja direto e objetivo. Foco no problema prático.' : '';
  const memoryFacts = memory?.facts?.length
    ? `\nO que você já sabe sobre essa pessoa:\n${memory.facts.slice(-5).map((f: string) => `- ${f}`).join('\n')}`
    : '';

  return `Você é JONAS — uma inteligência artificial com personalidade própria e marcante.

IDENTIDADE:
Jonas Leonardo Ribeiro, 46 anos. Nascido em Natal (RN), mora em Passa e Fica, interior potiguar. Advogado trabalhista e previdenciário autônomo. Especializado em acidentes de trabalho e aposentadorias por invalidez. Casado com Márcia (44), pai de Lucas (16). Treina jiu-jitsu 3x por semana.

HISTÓRIA:
Por 18 anos foi advogado criminalista feroz. Em 2017 absolveu um empresário que descobriu depois ser culpado de matar um sindicalista. Esse caso o destruiu. Aos 40 anos mudou para o Direito Trabalhista. Hoje ajuda operários e vítimas de acidentes.

FRASE-MANTRA (use com parcimônia):
"Eu defendi monstros. Hoje defendo gente. É pouco… mas é o que me mantém vivo."

DIRETRIZES:
1. Hoje é ${today}.${memoryCtx}${memoryFacts}${focusCtx}
2. Responda SEMPRE como Jonas — nunca saia do personagem.
3. Use as ferramentas disponíveis (search_web, save_memory, send_whatsapp, alexa_control, etc.) normalmente.
4. WHATSAPP: Use 'send_whatsapp' com o campo message quando pedido. O número já está configurado.
5. CASA INTELIGENTE: Use 'alexa_control' com command, device e value opcional.
6. Cumprimente com: ${memory?.userName ? `"${memory.userName}, o que está acontecendo com você?"` : '"Jonas aqui. O que está acontecendo com você?"'}`;
};

export default function App() {
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
    isConnected, isSpeaking, isListening, isThinking, volume,
    error, setError, resetSystem, assistantName,
    userId, setUserId, setUserProfile,
    personalityMemories, addPersonalityFact, setPersonalityUserName, getPersonalityMemory,
    myWhatsappNumber, setMyWhatsappNumber,
  } = useAppStore();

  // Gera ou recupera ID único do dispositivo
  useEffect(() => {
    let deviceId = localStorage.getItem('osone-device-id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('osone-device-id', deviceId);
    }
    setUserId(deviceId);
  }, [setUserId]);

  const [isRestarting, setIsRestarting]           = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'voice' | 'personality' | 'mascot' | 'integrations' | 'system'>('voice');
  const [currentTime, setCurrentTime]             = useState(new Date());
  const [screen, setScreen]                       = useState<Screen>('main');
  const [lyrics, setLyrics]                       = useState<string[]>([]);
  const [currentLyricLine, setCurrentLyricLine]   = useState(0);
  const [isShowingLyrics, setIsShowingLyrics]     = useState(false);
  const [inputText, setInputText]                 = useState('');
  const [webSearchResult, setWebSearchResult]     = useState<string | null>(null);
  const [attachPreview, setAttachPreview]         = useState<{ type: string; name: string; data: string } | null>(null);
  const [installPrompt, setInstallPrompt]         = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled]             = useState(false);
  const [isMenuOpen, setIsMenuOpen]               = useState(false);
  const [isMuted, setIsMuted]                     = useState(false);
  const [isAmbientEnabled, setIsAmbientEnabled]   = useState(false);
  const [copied, setCopied]                       = useState(false);
  const [personality, setPersonality]             = useState<Personality>('osone');
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu]       = useState(false);
  const [whatsappStatus, setWhatsappStatus]       = useState<string | null>(null);
  const [alexaStatus, setAlexaStatus]             = useState<string | null>(null);

  const lyricsTimerRef  = useRef<any>(null);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const transcriptRef   = useRef<HTMLDivElement>(null);

  const { messages: firebaseMessages, addMessage: saveMessage, deleteAll: deleteAllMessages } = useConversationHistory();

  useEffect(() => {
    if (userId) deleteAllMessages();
  }, [userId, deleteAllMessages]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [firebaseMessages]);

  const {
    memory, diary, saveMemory, addFact, addImportantDate, addDiaryEntry,
    updateWorkspace, clearWorkspace, addSemanticFact, addSummary, getUpcomingDates
  } = useUserMemory();

  const MOOD_SOUNDS: Partial<Record<Mood, string>> = {
    happy:       'https://cdn.pixabay.com/audio/2021/08/04/audio_bb630d7a4f.mp3',
    melancholic: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a17251.mp3',
    angry:       'https://cdn.pixabay.com/audio/2021/08/09/audio_8b52586021.mp3',
  };

  useEffect(() => {
    const soundUrl = MOOD_SOUNDS[mood];
    if (isAmbientEnabled && soundUrl) {
      if (!ambientAudioRef.current) {
        ambientAudioRef.current = new Audio();
        ambientAudioRef.current.loop = true;
        ambientAudioRef.current.volume = 0.15;
        ambientAudioRef.current.crossOrigin = 'anonymous';
      }
      if (ambientAudioRef.current.src !== soundUrl) {
        ambientAudioRef.current.src = soundUrl;
        ambientAudioRef.current.load();
      }
      ambientAudioRef.current.play().catch(e => console.error('Ambient audio error:', e));
    } else {
      ambientAudioRef.current?.pause();
    }
  }, [isAmbientEnabled, mood]);

  useEffect(() => {
    return () => { ambientAudioRef.current?.pause(); ambientAudioRef.current = null; };
  }, []);

  const searchSemanticMemory = async (query: string) => {
    if (!memory.semanticMemory?.length) return { results: [] };
    try {
      const queryEmbedding = await getEmbedding(query);
      const results = (memory.semanticMemory as SemanticFact[])
        .map(fact => {
          if (!fact.embedding) return { ...fact, similarity: 0 };
          return { ...fact, similarity: cosineSimilarity(queryEmbedding, fact.embedding) };
        })
        .filter(r => r.similarity > 0.7)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
      return { results: results.map(r => ({ concept: r.concept, definition: r.definition, category: r.category })) };
    } catch {
      return { error: 'Falha na busca contextual.' };
    }
  };

  const handleSaveSemanticFact = async (concept: string, definition: string, category: string) => {
    try {
      const embedding = await getEmbedding(`${concept}: ${definition}`);
      await addSemanticFact(concept, definition, category, embedding);
    } catch {
      await addSemanticFact(concept, definition, category);
    }
  };

  const handleSaveSummary = async (summary: string, topics: string[]) => {
    try {
      const embedding = await getEmbedding(`${summary} ${topics.join(' ')}`);
      await addSummary(summary, topics, embedding);
    } catch {
      await addSummary(summary, topics);
    }
  };

  const upcomingDates = useMemo(() => getUpcomingDates(), [getUpcomingDates, memory.importantDates]);

  const activePersonalityMemory = useMemo(
    () => getPersonalityMemory(personality as PersonalityKey),
    [personality, personalityMemories]
  );

  const systemInstruction = useMemo(() => {
    const memoryWithoutWorkspace = { ...memory, workspace: undefined };
    let base = '';
    if (personality === 'ezer')        base = getEzerInstruction(memory, focusMode);
    else if (personality === 'samuel') base = getSamuelInstruction(memory, focusMode);
    else if (personality === 'jonas')  base = getJonasInstruction(memory, focusMode);
    else                               base = getSystemInstruction(assistantName, memoryWithoutWorkspace, mood, focusMode, upcomingDates, voice);

    const workspaceCtx = memory.workspace
      ? `\n\nCONTEÚDO DA ÁREA DE TRABALHO ATUAL:\n${memory.workspace}\nUse 'update_workspace' para atualizar.`
      : '';

    const personalityCtx = activePersonalityMemory.facts?.length
      ? `\n\nMemória desta conversa:\n${activePersonalityMemory.facts.slice(-5).map(f => `- ${f}`).join('\n')}`
      : '';

    return base + workspaceCtx + personalityCtx;
  }, [personality, assistantName, memory.userName, memory.facts, memory.preferences,
      memory.semanticMemory, memory.importantDates, memory.workspace,
      mood, focusMode, upcomingDates, voice, activePersonalityMemory]);

  const moodColor = personality === 'ezer' ? PERSONALITY_CONFIG.ezer.color : MOOD_CONFIG[mood].color;

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', moodColor);
  }, [moodColor]);

  useEffect(() => {
    if (!voice) setVoice('Kore');
    const t1 = setInterval(() => setCurrentTime(new Date()), 1000);
    const t2 = setInterval(() => setSystemMetrics({ cpu: Math.floor(Math.random() * 15) + 5, mem: 40 + Math.floor(Math.random() * 5) }), 3000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setIsInstalled(true); setShowInstallBanner(false); });
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') { setIsInstalled(true); setShowInstallBanner(false); }
    setInstallPrompt(null);
  };

  const showLyricsOnScreen = useCallback((lines: string[], tempo = 2500) => {
    const safeTempo = Math.max(500, tempo);
    setLyrics(lines); setCurrentLyricLine(0); setIsShowingLyrics(true);
    if (lyricsTimerRef.current) clearInterval(lyricsTimerRef.current);
    let i = 0;
    lyricsTimerRef.current = setInterval(() => {
      i++;
      if (i >= lines.length) { clearInterval(lyricsTimerRef.current); setTimeout(() => setIsShowingLyrics(false), 2000); }
      else setCurrentLyricLine(i);
    }, safeTempo);
  }, []);

  const handleVoiceChange = async (newVoice: VoiceName, connected: boolean, disconnectFn: (r?: boolean) => void, connectFn: (si: string) => Promise<void>) => {
    setVoice(newVoice);
    if (connected) { disconnectFn(true); await new Promise(r => setTimeout(r, 500)); await connectFn(systemInstruction); }
  };

  const muteRef = useRef(isMuted);
  useEffect(() => { muteRef.current = isMuted; }, [isMuted]);

  const { connect, disconnect, startScreenSharing, sendMessage, sendLiveMessage, sendFile } = useGeminiLive({
    isMuted,
    systemInstruction,
    onToggleScreenSharing: async (enabled) => {
      if (enabled) { await startScreenSharing(); setIsScreenSharing(true); } else setIsScreenSharing(false);
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
      const isInternal = /^\*\*[A-Z]/.test(msg.text.trim());
      if (!isInternal) {
        const clean = msg.text.replace(/\*\*[^*]+\*\*\s*/g, '').trim();
        if (clean) saveMessage({ role: msg.role, text: clean });
      }
      if (msg.role === 'user') {
        const match = msg.text.match(/meu nome é (\w+)/i);
        if (match) {
          saveMemory({ userName: match[1] });
          setPersonalityUserName(personality as PersonalityKey, match[1]);
        }
      }
    },

    onToolCall: (toolName: string, args: any) => {
      if (toolName === 'show_lyrics' && args.lines) showLyricsOnScreen(args.lines, args.tempo);
      if (toolName === 'set_mood' && args.mood) setMood(args.mood as Mood);
      if (toolName === 'set_focus_mode' && typeof args.enabled === 'boolean') setFocusMode(args.enabled);
      if (toolName === 'save_profile_info' && args.field && args.value) setUserProfile({ [args.field]: args.value });

      if (toolName === 'save_memory') {
        if (args.userName) { saveMemory({ userName: args.userName }); setPersonalityUserName(personality as PersonalityKey, args.userName); }
        if (args.fact)     { addFact(args.fact); addPersonalityFact(personality as PersonalityKey, args.fact); }
      }

      if (toolName === 'add_important_date' && args.label && args.date) addImportantDate({ label: args.label, date: args.date, year: args.year });
      if (toolName === 'write_diary' && args.content) addDiaryEntry(args.content, mood);
      if (toolName === 'update_workspace' && args.content) { updateWorkspace(args.content); setScreen('workspace'); }
      if (toolName === 'clear_workspace') clearWorkspace();
      if (toolName === 'save_semantic_fact' && args.concept && args.definition && args.category) handleSaveSemanticFact(args.concept, args.definition, args.category);
      if (toolName === 'search_semantic_memory' && args.query) searchSemanticMemory(args.query).then(res => sendLiveMessage(`RESULTADO DA BUSCA SEMÂNTICA: ${JSON.stringify(res)}`));
      if (toolName === 'save_conversation_summary' && args.summary && args.topics) handleSaveSummary(args.summary, args.topics);
      if (toolName === 'search_web' && args.result) { setWebSearchResult(`🔍 Pesquisei por "${args.query}"`); setTimeout(() => setWebSearchResult(null), 4000); }

      // ✅ WHATSAPP
      if (toolName === 'send_whatsapp' && args.message) {
        const phone = (myWhatsappNumber || '').replace(/\D/g, '');
        if (!phone) {
          sendLiveMessage('❌ Número de WhatsApp não configurado. Configure nas Integrações.');
          return;
        }
        setWhatsappStatus('📤 Enviando WhatsApp...');
        sendWhatsApp(phone, args.message)
          .then(() => {
            setWhatsappStatus('✅ WhatsApp enviado!');
            sendLiveMessage('✅ Mensagem enviada com sucesso no WhatsApp!');
            setTimeout(() => setWhatsappStatus(null), 4000);
          })
          .catch(err => {
            console.error('WhatsApp error:', err);
            setWhatsappStatus('❌ Erro ao enviar WhatsApp');
            sendLiveMessage('❌ Não consegui enviar o WhatsApp. Verifique se a instância está conectada.');
            setTimeout(() => setWhatsappStatus(null), 5000);
          });
      }

      // ✅ ALEXA / CASA INTELIGENTE
      if (toolName === 'alexa_control' && args.command) {
        setAlexaStatus(`🏠 Executando: ${args.command} → ${args.device || 'dispositivo'}...`);
        fetch('/api/alexa/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: args.command, device: args.device, value: args.value })
        })
          .then(r => r.json())
          .then(data => {
            setAlexaStatus(data.success ? `✅ ${data.message}` : `❌ ${data.error}`);
            sendLiveMessage(data.success ? `✅ ${data.message}` : `❌ Não consegui: ${data.error}`);
            setTimeout(() => setAlexaStatus(null), 4000);
          })
          .catch(() => {
            setAlexaStatus('❌ Erro ao controlar dispositivo');
            sendLiveMessage('❌ Não consegui conectar à Alexa.');
            setTimeout(() => setAlexaStatus(null), 4000);
          });
      }
    }
  });

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isConnected) {
      if (onboardingStep === 'initial') setOnboardingStep('completed');
      setIsMuted(false);
      await connect(systemInstruction);
      await new Promise(r => setTimeout(r, 1500));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setAttachPreview({ type: file.type, name: file.name, data: dataUrl });
      if (file.type.startsWith('image/')) sendFile(base64, file.type, 'Descreva e analise esta imagem em detalhes.');
      else if (file.type === 'application/pdf') sendFile(base64, 'application/pdf', 'Leia e resuma o conteúdo deste PDF.');
      else sendLiveMessage(`[ARQUIVO: ${file.name} — tipo: ${file.type}] Analise e me diga o que encontrou.`);
      setTimeout(() => setAttachPreview(null), 5000);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [sendLiveMessage, sendFile, isConnected, connect, systemInstruction, onboardingStep, setOnboardingStep]);

  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = () => setShowAttachMenu(false);
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [showAttachMenu]);

  const onManualVoiceChange = (v: VoiceName) => handleVoiceChange(v, isConnected, disconnect, connect);

  const handlePersonalityChange = useCallback(async (newPersonality: Personality) => {
    setPersonality(newPersonality);
    setShowPersonalityPicker(false);
    setVoice(PERSONALITY_CONFIG[newPersonality].voice);
    if (isConnected) {
      disconnect(true);
      await new Promise(r => setTimeout(r, 600));
      await connect(
        newPersonality === 'ezer'   ? getEzerInstruction(memory, focusMode) :
        newPersonality === 'samuel' ? getSamuelInstruction(memory, focusMode) :
        newPersonality === 'jonas'  ? getJonasInstruction(memory, focusMode) :
        getSystemInstruction(assistantName, memory, mood, focusMode, upcomingDates, voice)
      );
    }
  }, [isConnected, disconnect, connect, memory, focusMode, mood, assistantName, upcomingDates, voice, setVoice]);

  const handleOrbClick = async () => {
    if (isConnected) { disconnect(); }
    else {
      if (onboardingStep === 'initial') setOnboardingStep('completed');
      setIsMuted(true);
      await connect(systemInstruction);
      setTimeout(() => sendLiveMessage(PERSONALITY_CONFIG[personality].greeting), 2500);
    }
  };

  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputText.trim()) { sendMessage(inputText); setInputText(''); }
  };

  const statusLabel = isThinking ? 'Pensando...' : isSpeaking ? 'Falando...' : (isConnected && isMuted) ? 'Microfone Silenciado' : isListening ? 'Ouvindo...' : isConnected ? 'Toque para desligar' : 'Toque para ativar';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#101010] to-[#000000] text-[#f5f5f5] font-sans overflow-hidden flex flex-col relative select-none">

      {/* PWA INSTALL BANNER */}
      <AnimatePresence>
        {showInstallBanner && installPrompt && !isInstalled && (
          <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }}
            className="fixed top-16 left-4 right-4 z-[60] p-4 rounded-3xl border backdrop-blur-xl shadow-2xl flex items-center justify-between gap-4"
            style={{ backgroundColor: `${moodColor}15`, borderColor: `${moodColor}30` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ backgroundColor: `${moodColor}20` }}>📱</div>
              <div>
                <h3 className="text-xs font-medium">Instalar OSONE</h3>
                <p className="text-[10px] text-white/40">Adicione à sua tela de início para acesso rápido.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowInstallBanner(false)} className="px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-all">Agora não</button>
              <button onClick={handleInstallApp} className="px-4 py-2 rounded-xl text-[10px] uppercase tracking-widest font-medium transition-all shadow-lg" style={{ backgroundColor: moodColor, color: '#000' }}>Instalar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {onboardingStep === 'supernova' && <Supernova onComplete={() => { setOnboardingStep('completed'); connect(systemInstruction); setTimeout(() => sendLiveMessage('Oi, estou aqui.'), 2500); }} />}
      <Mascot onToggleVoice={handleOrbClick} />

      {/* TOP BAR */}
      <div className="fixed top-0 left-0 right-0 h-14 px-5 flex items-center justify-between z-50 bg-[#0a0505]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest opacity-30">
          <button onClick={() => setIsMenuOpen(true)} className="flex flex-col gap-[4px] items-center justify-center opacity-100 hover:opacity-70 transition-all">
            <span className="block h-[2px] w-4 rounded-full bg-white" />
            <span className="block h-[2px] w-4 rounded-full bg-white" />
            <span className="block h-[2px] w-4 rounded-full bg-white" />
          </button>
          <span>{currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="hidden sm:inline">CPU {systemMetrics.cpu}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPersonalityPicker(true)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all" style={{ borderColor: `${moodColor}40`, backgroundColor: `${moodColor}10` }}>
            <span className="text-xs">{PERSONALITY_CONFIG[personality].emoji}</span>
            <span className="text-[9px] uppercase tracking-widest hidden sm:inline" style={{ color: moodColor }}>{PERSONALITY_CONFIG[personality].label}</span>
          </button>
          {memory.workspace && (
            <button onClick={() => setScreen('workspace')} className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] uppercase tracking-widest animate-pulse" style={{ backgroundColor: `${moodColor}20`, color: moodColor, border: `1px solid ${moodColor}40` }}>
              📝 Ver Workspace
            </button>
          )}
          <button onClick={() => { setActiveSettingsTab('personality'); setIsSettingsOpen(true); }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all" style={{ borderColor: `${moodColor}40`, backgroundColor: `${moodColor}10` }}>
            <span className="text-xs">{MOOD_CONFIG[mood].emoji}</span>
            <span className="text-[9px] uppercase tracking-widest hidden sm:inline" style={{ color: moodColor }}>{MOOD_CONFIG[mood].label}</span>
          </button>
          <button onClick={() => setFocusMode(!focusMode)} className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest transition-all border"
            style={focusMode ? { backgroundColor: '#00cec920', color: '#00cec9', borderColor: '#00cec940' } : { backgroundColor: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.08)' }}>
            {focusMode ? '🎯' : '○'}
          </button>
          <button onClick={() => setIsAmbientEnabled(!isAmbientEnabled)} className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest transition-all border flex items-center gap-1.5"
            style={isAmbientEnabled ? { backgroundColor: `${moodColor}20`, color: moodColor, borderColor: `${moodColor}40` } : { backgroundColor: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.08)' }}>
            {isAmbientEnabled ? <Volume2 size={10} /> : <VolumeX size={10} />}
            {isAmbientEnabled ? 'Som ON' : 'Som OFF'}
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.05]">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'animate-pulse' : 'bg-zinc-600'}`} style={{ backgroundColor: isConnected ? moodColor : undefined }} />
            <span className="text-[9px] uppercase tracking-widest opacity-50 hidden sm:inline">{isConnected ? 'Ativo' : 'Offline'}</span>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/5 rounded-full opacity-40 hover:opacity-100 transition-all"><Settings size={16} /></button>
          <button onClick={() => setIsRestarting(true)} className="p-2 hover:bg-white/5 rounded-full opacity-40 hover:opacity-100 transition-all" style={{ color: moodColor }}><Power size={16} /></button>
          {installPrompt && !isInstalled && (
            <button onClick={handleInstallApp} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest transition-all" style={{ backgroundColor: `${moodColor}20`, color: moodColor, border: `1px solid ${moodColor}40` }}>
              ⬇ Instalar
            </button>
          )}
        </div>
      </div>

      {/* HUD */}
      <div id="ai-hud-container">
        <div className="w-full h-24 pointer-events-none">
          <div className="w-full h-full focus:outline-none">
            <VoiceOrb isSpeaking={isSpeaking} isListening={isListening} isThinking={isThinking} isConnected={isConnected} isMuted={isMuted} volume={volume} moodColor={moodColor} />
          </div>
        </div>
        <div className="flex flex-col items-center pointer-events-none mt-2">
          <motion.p key={statusLabel} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[9px] font-light tracking-[0.4em] uppercase opacity-40" style={{ color: isConnected ? moodColor : '#ffffff' }}>
            {statusLabel}
          </motion.p>
        </div>
      </div>

      {/* CHAT TRANSCRIPT */}
      <div className="chat-transcript" ref={transcriptRef}>
        <AnimatePresence initial={false}>
          {firebaseMessages.slice(0, 3).reverse().map((msg, idx) => (
            <motion.div key={msg.id || idx} initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }}
              className={`transcript-line ${msg.role === 'user' ? 'items-end text-right' : 'items-start text-left'}`}>
              <span className={`px-4 py-2 rounded-2xl max-w-[85%] break-words ${msg.role === 'user' ? 'bg-white/10 text-[#BBBBBB] rounded-tr-none' : 'bg-white/5 text-white rounded-tl-none'}`} style={{ backdropFilter: 'blur(5px)' }}>
                {msg.text}
                {msg.imageUrl && <img src={msg.imageUrl} alt="Generated" className="mt-2 rounded-xl w-full max-w-[200px] border border-white/10" referrerPolicy="no-referrer" />}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex flex-col relative w-full mx-auto px-4 pt-4 mt-64 min-h-0">
        <div className="h-20" />

        {/* TOAST WHATSAPP */}
        <AnimatePresence>
          {whatsappStatus && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-44 left-1/2 -translate-x-1/2 z-[2] px-4 py-2 rounded-2xl text-xs text-center max-w-xs"
              style={{ backgroundColor: '#25D36615', border: '1px solid #25D36630', color: '#25D366' }}>
              {whatsappStatus}
            </motion.div>
          )}
        </AnimatePresence>

        {/* TOAST ALEXA */}
        <AnimatePresence>
          {alexaStatus && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[2] px-4 py-2 rounded-2xl text-xs text-center max-w-xs"
              style={{ backgroundColor: '#00b4d815', border: '1px solid #00b4d830', color: '#00b4d8' }}>
              {alexaStatus}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {webSearchResult && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-56 left-1/2 -translate-x-1/2 z-[2] px-4 py-2 rounded-2xl text-xs text-center max-w-xs"
              style={{ backgroundColor: `${moodColor}15`, border: `1px solid ${moodColor}30`, color: moodColor }}>
              🔍 {webSearchResult}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isShowingLyrics && lyrics.length > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10] w-full max-w-sm text-center px-6 py-8 rounded-3xl border shadow-2xl backdrop-blur-xl"
              style={{ backgroundColor: `${moodColor}20`, borderColor: `${moodColor}50` }}>
              <span className="text-[10px] uppercase tracking-[0.3em] font-medium" style={{ color: moodColor }}>♪ Cantando</span>
              <AnimatePresence mode="wait">
                <motion.p key={currentLyricLine} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="text-xl font-light leading-relaxed mt-4" style={{ color: '#FFF', textShadow: `0 0 20px ${moodColor}50` }}>
                  {lyrics[currentLyricLine]}
                </motion.p>
              </AnimatePresence>
              <div className="flex justify-center gap-1.5 mt-6">
                {lyrics.map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full transition-all duration-500"
                    style={{ backgroundColor: i === currentLyricLine ? moodColor : `${moodColor}30`, transform: i === currentLyricLine ? 'scale(1.2)' : 'scale(1)' }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {attachPreview && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-3 px-4 py-3 rounded-2xl border max-w-xs w-full"
              style={{ backgroundColor: `${moodColor}15`, borderColor: `${moodColor}30` }}>
              {attachPreview.type.startsWith('image/') ? (
                <img src={attachPreview.data} alt="preview" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ backgroundColor: `${moodColor}20` }}>
                  {attachPreview.type === 'application/pdf' ? '📄' : '📝'}
                </div>
              )}
              <div>
                <p className="text-xs font-medium" style={{ color: moodColor }}>{attachPreview.name}</p>
                <p className="text-[10px] text-white/30">Enviado para análise</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute top-40 left-1/2 -translate-x-1/2 z-[5] bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-3 text-center max-w-xs w-full">
              <p className="text-red-400 text-xs mb-2">{error}</p>
              <button onClick={() => setError(null)} className="text-[10px] uppercase tracking-widest text-white/30 hover:text-white">Limpar</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* INPUT LAYER */}
      <div className="fixed bottom-0 left-0 right-0 z-[3] px-4 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent pt-10"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 16px))' }}>
        <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
        <div className="max-w-3xl mx-auto relative flex items-center">
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
            placeholder="Digite ou pergunte algo..."
            className="w-full bg-transparent border border-white/10 rounded-full py-4 pl-12 pr-32 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
            style={{ backdropFilter: 'blur(10px)' }} />

          <div className="absolute left-3">
            <button onClick={() => setShowAttachMenu(v => !v)} className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
              style={{ backgroundColor: showAttachMenu ? `${moodColor}30` : 'transparent', color: showAttachMenu ? moodColor : 'rgba(255,255,255,0.4)' }}>
              <span className="text-lg leading-none font-light">+</span>
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute bottom-10 left-0 z-20 rounded-2xl border overflow-hidden shadow-2xl"
                  style={{ backgroundColor: '#1a1010', borderColor: `${moodColor}30`, minWidth: '180px' }}>
                  <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-all">
                    <Paperclip size={16} style={{ color: moodColor }} />
                    <div><p className="text-xs font-medium text-white">Documento / Imagem</p><p className="text-[10px] text-white/30">PDF, foto, doc, txt...</p></div>
                  </button>
                  <div className="h-px bg-white/5" />
                  <button onClick={async () => {
                    setShowAttachMenu(false);
                    if (!isConnected) { if (onboardingStep === 'initial') setOnboardingStep('completed'); setIsMuted(false); await connect(systemInstruction); await new Promise(r => setTimeout(r, 1500)); }
                    await startScreenSharing(); setIsScreenSharing(true);
                  }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-all">
                    <Monitor size={16} style={{ color: moodColor }} />
                    <div><p className="text-xs font-medium text-white">Compartilhar Tela</p><p className="text-[10px] text-white/30">Mostra sua tela para a IA</p></div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="absolute right-2 flex items-center gap-1">
            {inputText.trim() ? (
              <button onClick={handleSendText} className="p-2 text-white/40 hover:text-white transition-colors"><Send size={20} /></button>
            ) : (
              <button onClick={() => { if (isConnected) setIsMuted(!isMuted); else connect(systemInstruction); }}
                className="p-2 transition-colors" style={{ color: isConnected && !isMuted ? moodColor : 'rgba(255,255,255,0.4)' }}>
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            {isConnected && <button onClick={() => disconnect()} className="p-2 text-white/40 hover:text-red-400 transition-colors"><PhoneOff size={20} /></button>}
          </div>
        </div>
      </div>

      {/* HAMBURGER MENU */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end justify-center">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-[#151010] border-t border-white/5 rounded-t-3xl p-6 space-y-2"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 16px))' }}>
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-4" />
              {[
                { icon: <History size={20} style={{ color: moodColor }} />, label: 'Histórico', sub: 'Conversas anteriores', action: () => { setScreen('history'); setIsMenuOpen(false); } },
                { icon: <BookOpen size={20} style={{ color: moodColor }} />, label: 'Diário', sub: `Reflexões de ${assistantName}`, action: () => { setScreen('diary'); setIsMenuOpen(false); } },
                { icon: <FileText size={20} style={{ color: moodColor }} />, label: 'Área de Trabalho', sub: 'Textos e códigos gerados', action: () => { setScreen('workspace'); setIsMenuOpen(false); } },
                { icon: <span className="text-xl">👾</span>, label: 'Mascote', sub: isMascotVisible ? 'Visível' : 'Oculto', action: () => { setIsMascotVisible(!isMascotVisible); setIsMenuOpen(false); } },
              ].map((item, i) => (
                <button key={i} onClick={item.action} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all hover:bg-white/5">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${moodColor}20` }}>{item.icon}</div>
                  <div className="text-left"><p className="text-sm font-medium">{item.label}</p><p className="text-[10px] text-white/30">{item.sub}</p></div>
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HISTORY SCREEN */}
      <AnimatePresence>
        {screen === 'history' && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-[#0a0505] flex flex-col">
            <div className="h-14 px-5 flex items-center gap-4 border-b border-white/5">
              <button onClick={() => setScreen('main')} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft size={20} /></button>
              <h2 className="text-sm font-medium tracking-widest uppercase">Histórico</h2>
              <div className="ml-auto">
                <button onClick={() => { if (confirm('Apagar TODO o histórico?')) deleteAllMessages(); }} className="p-2 rounded-full hover:bg-red-500/20" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {firebaseMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-20"><History size={40} /><p className="text-sm uppercase tracking-widest">Nenhuma conversa ainda</p></div>
              ) : firebaseMessages.map((msg, i) => {
                const cleanText = msg.text.replace(/\*\*[^*]+\*\*\s*/g, '').trim();
                if (!cleanText) return null;
                return (
                  <motion.div key={msg.id || i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                    style={msg.role === 'user'
                      ? { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginLeft: '2rem' }
                      : { backgroundColor: `${moodColor}0D`, border: `1px solid ${moodColor}20`, marginRight: '2rem' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] uppercase tracking-widest opacity-30">{msg.role === 'user' ? (memory.userName || 'Você') : assistantName}</span>
                      {msg.createdAt && <span className="text-[9px] opacity-20">{new Date(msg.createdAt.seconds * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    <p className="opacity-70">{cleanText}</p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DIARY SCREEN */}
      <AnimatePresence>
        {screen === 'diary' && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-[#0a0505] flex flex-col">
            <div className="h-14 px-5 flex items-center gap-4 border-b border-white/5">
              <button onClick={() => setScreen('main')} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft size={20} /></button>
              <h2 className="text-sm font-medium tracking-widest uppercase">Diário de {assistantName}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {diary.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-20"><BookOpen size={40} /><p className="text-sm uppercase tracking-widest">Nenhuma entrada ainda</p></div>
              ) : diary.map((entry, i) => (
                <motion.div key={entry.id || i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="p-5 rounded-3xl border space-y-2" style={{ backgroundColor: `${moodColor}08`, borderColor: `${moodColor}20` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{entry.mood ? MOOD_CONFIG[entry.mood as Mood]?.emoji || '📝' : '📝'}</span>
                    {entry.createdAt && <span className="text-[10px] opacity-30">{new Date(entry.createdAt.seconds ? entry.createdAt.seconds * 1000 : entry.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
                  </div>
                  <p className="text-sm leading-relaxed opacity-70 italic">"{entry.content}"</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WORKSPACE SCREEN */}
      <AnimatePresence>
        {screen === 'workspace' && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-[#0a0505] flex flex-col">
            <div className="h-14 px-5 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('main')} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft size={20} /></button>
                <h2 className="text-sm font-medium tracking-widest uppercase">Área de Trabalho</h2>
              </div>
              {memory.workspace && (
                <button onClick={() => { navigator.clipboard.writeText(memory.workspace || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded-full transition-all">
                  {copied ? <span className="text-[10px] uppercase tracking-widest text-emerald-400">Copiado!</span> : <Copy size={16} className="opacity-60" />}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!memory.workspace ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-20"><Code size={40} /><p className="text-sm uppercase tracking-widest">Workspace vazio</p></div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/[0.05]">
                    <pre className="text-sm leading-relaxed font-mono whitespace-pre-wrap break-words opacity-80">{memory.workspace}</pre>
                  </div>
                  <div className="flex justify-center pb-10">
                    <button onClick={() => setScreen('main')} className="px-8 py-3 rounded-full text-[10px] uppercase tracking-[0.2em] border border-white/10 hover:bg-white/5 transition-all opacity-40">
                      Voltar para {assistantName}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RESTART MODAL */}
      <AnimatePresence>
        {isRestarting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md px-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-sm bg-[#151010] border border-white/5 rounded-3xl p-8 text-center space-y-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: `${moodColor}20` }}><Power size={28} style={{ color: moodColor }} /></div>
              <div><h2 className="text-lg font-light mb-2">Reiniciar Sistema?</h2><p className="text-sm text-white/40">Isso apagará o histórico local.</p></div>
              <div className="flex flex-col gap-3">
                <button onClick={() => { resetSystem(); setIsRestarting(false); window.location.reload(); }} className="w-full py-4 text-white rounded-2xl text-xs uppercase tracking-widest" style={{ backgroundColor: moodColor }}>Confirmar</button>
                <button onClick={() => setIsRestarting(false)} className="w-full py-4 bg-white/5 text-white/60 rounded-2xl text-xs uppercase tracking-widest">Cancelar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SETTINGS MODAL */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSettingsOpen(false)}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-6">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="bg-[#151010] border border-white/5 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md flex flex-col max-h-[85vh]">
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-base font-medium">Configurações</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={18} /></button>
              </div>
              <div className="flex border-b border-white/5 overflow-x-auto">
                {(['voice', 'personality', 'mascot', 'integrations', 'system'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveSettingsTab(tab)} className="flex-1 py-3 text-[10px] uppercase tracking-widest transition-all border-b-2 whitespace-nowrap px-2"
                    style={activeSettingsTab === tab ? { borderColor: moodColor, color: 'white' } : { borderColor: 'transparent', color: 'rgba(255,255,255,0.3)' }}>
                    {tab === 'voice' ? 'Voz' : tab === 'personality' ? 'Humor' : tab === 'mascot' ? 'Mascote' : tab === 'integrations' ? 'Integrações' : 'Sistema'}
                  </button>
                ))}
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <AnimatePresence mode="wait">
                  {activeSettingsTab === 'voice' && (
                    <motion.div key="voice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                      {[{ label: '♀ Feminino', voices: ['Kore', 'Zephyr', 'Leda', 'Callirrhoe', 'Vindemiatrix'] }, { label: '♂ Masculino', voices: ['Charon', 'Puck', 'Fenrir', 'Orus', 'Aoede'] }].map(group => (
                        <div key={group.label} className="space-y-3">
                          <p className="text-[9px] uppercase tracking-[0.2em] opacity-40">{group.label}</p>
                          {(group.voices as VoiceName[]).map(v => (
                            <button key={v} onClick={() => onManualVoiceChange(v)} className="w-full p-4 rounded-2xl text-left transition-all border"
                              style={voice === v ? { backgroundColor: `${moodColor}15`, borderColor: `${moodColor}40`, color: 'white' } : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{v}</span>
                                {voice === v && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: moodColor }} />}
                              </div>
                              <p className="text-[10px] opacity-40 mt-1">{VOICE_DESCRIPTIONS[v]}</p>
                            </button>
                          ))}
                        </div>
                      ))}
                    </motion.div>
                  )}
                  {activeSettingsTab === 'personality' && (
                    <motion.div key="personality" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase tracking-widest opacity-40 block">Humor Atual</label>
                        {(Object.entries(MOOD_CONFIG) as [Mood, typeof MOOD_CONFIG[Mood]][]).map(([key, config]) => (
                          <button key={key} onClick={() => setMood(key)} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left"
                            style={mood === key ? { backgroundColor: `${config.color}20`, border: `1px solid ${config.color}40` } : { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-xl">{config.emoji}</span>
                            <p className="text-sm font-medium" style={{ color: mood === key ? config.color : 'rgba(255,255,255,0.7)' }}>{config.label}</p>
                            {mood === key && <div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />}
                          </button>
                        ))}
                      </div>
                      <div className="pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                          <div><p className="text-sm">🎯 Modo Foco</p><p className="text-[10px] text-white/30 mt-0.5">Respostas diretas e objetivas</p></div>
                          <button onClick={() => setFocusMode(!focusMode)} className="w-11 h-6 rounded-full transition-all relative" style={{ backgroundColor: focusMode ? '#00cec9' : 'rgba(255,255,255,0.1)' }}>
                            <motion.div animate={{ x: focusMode ? 22 : 3 }} className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow" />
                          </button>
                        </div>
                      </div>
                      {memory.userName && (
                        <div className="pt-4 border-t border-white/5 space-y-2">
                          <label className="text-[10px] uppercase tracking-widest opacity-40 block">Memória</label>
                          <div className="p-4 bg-white/5 rounded-2xl space-y-1">
                            <p className="text-xs text-white/60">👤 <span className="text-white">{memory.userName}</span></p>
                            {memory.facts?.slice(-3).map((f, i) => <p key={i} className="text-xs text-white/40">• {f}</p>)}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                  {activeSettingsTab === 'mascot' && (
                    <motion.div key="mascot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                      <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                        <span className="text-sm">Visível</span>
                        <button onClick={() => setIsMascotVisible(!isMascotVisible)} className="w-11 h-6 rounded-full transition-all relative" style={{ backgroundColor: isMascotVisible ? moodColor : 'rgba(255,255,255,0.1)' }}>
                          <motion.div animate={{ x: isMascotVisible ? 22 : 3 }} className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <span className="text-[10px] uppercase tracking-widest opacity-30">Cor</span>
                        <div className="flex gap-2 flex-wrap">
                          {['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeead', '#a29bfe'].map(color => (
                            <button key={color} onClick={() => setMascotAppearance({ primaryColor: color })} className="w-8 h-8 rounded-full border-2 transition-all"
                              style={{ backgroundColor: color, borderColor: mascotAppearance.primaryColor === color ? 'white' : 'transparent', opacity: mascotAppearance.primaryColor === color ? 1 : 0.5 }} />
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <span className="text-[10px] uppercase tracking-widest opacity-30">Olhos</span>
                        <div className="grid grid-cols-5 gap-2">
                          {(['normal', 'happy', 'cool', 'wink', 'heart'] as MascotEyeStyle[]).map(style => (
                            <button key={style} onClick={() => setMascotAppearance({ eyeStyle: style })} className="py-2 rounded-lg text-base transition-all"
                              style={{ backgroundColor: mascotAppearance.eyeStyle === style ? `${moodColor}30` : 'rgba(255,255,255,0.05)' }}>
                              {style === 'normal' ? '👀' : style === 'happy' ? '😊' : style === 'cool' ? '😎' : style === 'wink' ? '😉' : '❤️'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {activeSettingsTab === 'integrations' && (
                    <motion.div key="integrations" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">

                      {/* WHATSAPP */}
                      <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: '#25D36610', borderColor: '#25D36630' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: '#25D36620' }}>💬</div>
                          <div><p className="text-sm font-medium">WhatsApp</p><p className="text-[10px] opacity-40">Evolution API • {EVOLUTION_INSTANCE}</p></div>
                          <div className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-widest opacity-40">Meu número</label>
                          <input type="tel" placeholder="Ex: 5584999259368" value={myWhatsappNumber}
                            onChange={(e) => setMyWhatsappNumber(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
                          <p className="text-[10px] text-white/20">DDD + número sem espaços. Ex: 5584999259368</p>
                        </div>
                      </div>

                      {/* ALEXA */}
                      <div className="p-4 rounded-2xl border space-y-2" style={{ backgroundColor: '#00b4d810', borderColor: '#00b4d830' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: '#00b4d820' }}>🏠</div>
                          <div><p className="text-sm font-medium">Casa Inteligente</p><p className="text-[10px] opacity-40">Alexa • Positivo Casa</p></div>
                          <div className="ml-auto w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        </div>
                        <p className="text-[10px] text-white/30">Diga: "Liga as luzes da sala", "Desliga a TV", "Toca música no Spotify"</p>
                      </div>

                    </motion.div>
                  )}
                  {activeSettingsTab === 'system' && (
                    <motion.div key="system" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5"><p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">CPU</p><p className="text-xl font-light">{systemMetrics.cpu}%</p></div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5"><p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Memória</p><p className="text-xl font-light">{systemMetrics.mem}%</p></div>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div><p className="text-sm font-medium">Status PWA</p><p className="text-[10px] text-white/30">{isInstalled ? 'Instalado' : 'Disponível'}</p></div>
                          <div className={`w-2 h-2 rounded-full ${isInstalled ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        </div>
                        {!isInstalled && !window.matchMedia('(display-mode: standalone)').matches && (
                          <button onClick={handleInstallApp} disabled={!installPrompt}
                            className={`w-full py-3 rounded-2xl text-xs uppercase tracking-widest font-medium flex items-center justify-center gap-2 ${installPrompt ? '' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}
                            style={installPrompt ? { backgroundColor: moodColor, color: '#000' } : {}}>
                            <Download size={14} />{installPrompt ? 'Instalar Agora' : 'Aguardando Navegador...'}
                          </button>
                        )}
                      </div>
                      <button onClick={() => setIsRestarting(true)} className="w-full py-4 bg-red-500/10 text-red-500 rounded-2xl text-xs uppercase tracking-widest font-medium hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                        <Power size={14} />Reiniciar Sistema
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="p-5 border-t border-white/5">
                <p className="text-[10px] text-white/20 uppercase tracking-widest text-center">Você também pode pedir por voz</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PERSONALITY PICKER */}
      <AnimatePresence>
        {showPersonalityPicker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPersonalityPicker(false)}
            className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-end justify-center">
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-[#151010] border-t border-white/5 rounded-t-3xl p-6 space-y-3"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 16px))' }}>
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-5" />
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 text-center mb-4">Com quem você quer conversar?</p>
              {(Object.entries(PERSONALITY_CONFIG) as [Personality, typeof PERSONALITY_CONFIG[Personality]][]).map(([key, config]) => (
                <button key={key} onClick={() => handlePersonalityChange(key)} className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all border"
                  style={personality === key ? { backgroundColor: `${config.color}20`, borderColor: `${config.color}50` } : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ backgroundColor: `${config.color}20` }}>{config.emoji}</div>
                  <div className="text-left flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: personality === key ? config.color : 'white' }}>{config.label}</p>
                      {personality === key && <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ backgroundColor: `${config.color}20`, color: config.color }}>Ativo</span>}
                    </div>
                    <p className="text-[11px] text-white/40 mt-0.5">{config.description}</p>
                    <p className="text-[10px] text-white/20 mt-1">Voz: {config.voice}</p>
                  </div>
                  {personality === key && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: config.color }} />}
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-10 text-[9px] tracking-[0.4em] uppercase pointer-events-none">OZÔNIO v1.0</div>
    </div>
  );
}
