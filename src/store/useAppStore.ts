import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ✅ 10 vozes completas do Gemini Live
export type VoiceName = 
  | 'Charon' | 'Kore' | 'Puck' | 'Zephyr' | 'Fenrir'
  | 'Leda' | 'Callirrhoe' | 'Vindemiatrix' | 'Orus' | 'Aoede';

export type Mood = 'happy' | 'calm' | 'focused' | 'playful' | 'melancholic' | 'angry' | 'singing';

export const VOICE_MAPPING: Record<VoiceName, string> = {
  'Charon': 'Charon',
  'Kore': 'Kore',
  'Puck': 'Puck',
  'Zephyr': 'Zephyr',
  'Fenrir': 'Fenrir',
  'Leda': 'Leda',
  'Callirrhoe': 'Callirrhoe',
  'Vindemiatrix': 'Vindemiatrix',
  'Orus': 'Orus',
  'Aoede': 'Aoede',
};

export type OnboardingStep = 'initial' | 'boot' | 'active' | 'supernova' | 'completed';
export type PersonalityType = 'brother' | 'uncle' | 'best_friend' | 'partner' | 'father' | 'mother' | 'none';
export type MascotEyeStyle = 'normal' | 'happy' | 'cool' | 'wink' | 'heart';
export type MascotAction = 'idle' | 'pointing' | 'clicking';

export interface MascotAppearance {
  primaryColor: string;
  secondaryColor: string;
  eyeStyle: MascotEyeStyle;
}

export interface UserProfile {
  hobbies: string;
  relationships: string;
  lifestyle: 'homebody' | 'adventurous' | 'none';
  genderPreference: 'male' | 'female' | 'none';
  personality: PersonalityType;
  socialLevel: string;
  motherRelationship: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
}

export interface CustomSkillParam {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean';
}

export interface CustomSkill {
  id: string;
  displayName: string;
  icon: string;
  description: string;
  webhookUrl: string;
  method: 'GET' | 'POST';
  active: boolean;
  parameters: CustomSkillParam[];
}

// Workspace Files (Modo Dev)
export interface WorkspaceFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: WorkspaceFile[];
  expanded?: boolean;
}

export interface SystemMetrics {
  cpu: number;
  mem: number;
}

// ✅ Memória separada por personagem
export type PersonalityKey = 'osone' | 'ezer' | 'samuel' | 'jonas';

export interface PersonalityMemory {
  facts: string[];
  preferences: string[];
  userName?: string;
}

interface AppState {
  // User
  userId: string | null;
  setUserId: (userId: string | null) => void;

  // Voice and Settings
  voice: VoiceName;
  setVoice: (voice: VoiceName) => void;
  mood: Mood;
  setMood: (mood: Mood) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;

  // Conversation History
  history: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  clearHistory: () => void;

  // System Metrics
  systemMetrics: SystemMetrics;
  setSystemMetrics: (metrics: SystemMetrics) => void;

  // Connection and Status
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
  isSpeaking: boolean;
  setIsSpeaking: (speaking: boolean) => void;
  isListening: boolean;
  setIsListening: (listening: boolean) => void;
  isThinking: boolean;
  setIsThinking: (thinking: boolean) => void;
  isScreenSharing: boolean;
  setIsScreenSharing: (sharing: boolean) => void;
  focusMode: boolean;
  setFocusMode: (enabled: boolean) => void;

  // Mascot
  isMascotVisible: boolean;
  setIsMascotVisible: (visible: boolean) => void;
  mascotTarget: string | null;
  setMascotTarget: (target: string | null) => void;
  mascotAction: MascotAction;
  setMascotAction: (action: MascotAction) => void;
  mascotAppearance: MascotAppearance;
  setMascotAppearance: (appearance: Partial<MascotAppearance>) => void;

  // Onboarding
  onboardingStep: OnboardingStep;
  setOnboardingStep: (step: OnboardingStep) => void;
  userProfile: UserProfile;
  setUserProfile: (profile: Partial<UserProfile>) => void;
  assistantName: string;
  setAssistantName: (name: string) => void;
  bootPhase: number;
  setBootPhase: (phase: number) => void;

  // Audio
  volume: number;
  setVolume: (volume: number) => void;

  // Error
  error: string | null;
  setError: (error: string | null) => void;

  // API Keys
  apiKey: string;
  setApiKey: (key: string) => void;
  openaiApiKey: string;
  setOpenaiApiKey: (key: string) => void;
  groqApiKey: string;
  setGroqApiKey: (key: string) => void;
  chatProvider: 'openai' | 'groq';
  setChatProvider: (provider: 'openai' | 'groq') => void;
  chatModel: string;
  setChatModel: (model: string) => void;

  // ✅ ElevenLabs
  elevenLabsApiKey: string;
  setElevenLabsApiKey: (key: string) => void;
  elevenLabsVoiceId: string;
  setElevenLabsVoiceId: (id: string) => void;

  // WhatsApp
  myWhatsappNumber: string;
  setMyWhatsappNumber: (number: string) => void;
  whatsappContacts: { name: string; phone: string }[];
  addWhatsappContact: (contact: { name: string; phone: string }) => void;
  removeWhatsappContact: (index: number) => void;

  // Tuya Smart Home
  tuyaClientId: string;
  setTuyaClientId: (id: string) => void;
  tuyaSecret: string;
  setTuyaSecret: (secret: string) => void;
  tuyaRegion: string;
  setTuyaRegion: (region: string) => void;
  tuyaUserId: string;
  setTuyaUserId: (id: string) => void;

  // Alexa
  alexaCookie: string;
  setAlexaCookie: (cookie: string) => void;

  // Custom Skills (Agente Infinito)
  customSkills: CustomSkill[];
  addCustomSkill: (skill: CustomSkill) => void;
  updateCustomSkill: (id: string, updates: Partial<CustomSkill>) => void;
  removeCustomSkill: (id: string) => void;
  toggleCustomSkill: (id: string) => void;

  // Workspace Dev Mode
  workspaceProjectName: string;
  setWorkspaceProjectName: (name: string) => void;
  workspaceFiles: WorkspaceFile[];
  setWorkspaceFiles: (files: WorkspaceFile[]) => void;
  addWorkspaceFile: (parentId: string | null, file: WorkspaceFile) => void;
  updateWorkspaceFile: (id: string, updates: Partial<WorkspaceFile>) => void;
  deleteWorkspaceFile: (id: string) => void;
  toggleWorkspaceFolder: (id: string) => void;

  // Modo Operador
  operatorMode: boolean;
  operatorTask: string;
  operatorSteps: number;
  operatorMaxSteps: number;
  setOperatorMode: (active: boolean) => void;
  setOperatorTask: (task: string) => void;
  incrementOperatorStep: () => void;
  resetOperator: () => void;

  // ✅ Memória por personagem
  personalityMemories: Record<PersonalityKey, PersonalityMemory>;
  addPersonalityFact: (personality: PersonalityKey, fact: string) => void;
  setPersonalityUserName: (personality: PersonalityKey, name: string) => void;
  getPersonalityMemory: (personality: PersonalityKey) => PersonalityMemory;

  // Reset
  resetSystem: () => void;
}

const defaultPersonalityMemory = (): PersonalityMemory => ({
  facts: [],
  preferences: [],
});

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // User
      userId: null,
      setUserId: (userId) => set({ userId }),

      // Voice and Settings
      voice: 'Kore',
      setVoice: (voice) => set({ voice }),
      mood: 'calm',
      setMood: (mood) => set({ mood }),
      isSettingsOpen: false,
      setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),

      // Conversation History
      history: [],
      addMessage: (message) => set((state) => ({
        history: [message, ...state.history].slice(0, 50)
      })),
      clearHistory: () => set({ history: [] }),

      // System Metrics
      systemMetrics: { cpu: 0, mem: 0 },
      setSystemMetrics: (systemMetrics) => set({ systemMetrics }),

      // Connection and Status
      isConnected: false,
      setIsConnected: (isConnected) => set({ isConnected }),
      isSpeaking: false,
      setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
      isListening: false,
      setIsListening: (isListening) => set({ isListening }),
      isThinking: false,
      setIsThinking: (isThinking) => set({ isThinking }),
      isScreenSharing: false,
      setIsScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
      focusMode: false,
      setFocusMode: (focusMode) => set({ focusMode }),

      // Mascot
      isMascotVisible: false,
      setIsMascotVisible: (isMascotVisible) => set({ isMascotVisible }),
      mascotTarget: null,
      setMascotTarget: (mascotTarget) => set({ mascotTarget }),
      mascotAction: 'idle',
      setMascotAction: (mascotAction) => set({ mascotAction }),
      mascotAppearance: {
        primaryColor: '#ff6b6b',
        secondaryColor: '#ffffff',
        eyeStyle: 'normal'
      },
      setMascotAppearance: (appearance) => set((state) => ({
        mascotAppearance: { ...state.mascotAppearance, ...appearance }
      })),

      // Onboarding
      onboardingStep: 'initial',
      setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
      userProfile: {
        hobbies: '',
        relationships: '',
        lifestyle: 'none',
        genderPreference: 'none',
        personality: 'none',
        socialLevel: '',
        motherRelationship: ''
      },
      setUserProfile: (profile) => set((state) => ({
        userProfile: { ...state.userProfile, ...profile }
      })),
      assistantName: 'OSONE',
      setAssistantName: (assistantName) => set({ assistantName }),
      bootPhase: 0,
      setBootPhase: (bootPhase) => set({ bootPhase }),

      // Audio
      volume: 0,
      setVolume: (volume) => set({ volume }),

      // Error
      error: null,
      setError: (error) => set({ error }),

      // API Keys
      apiKey: (typeof process !== 'undefined' && (process.env.GEMINI_API_KEY || process.env.API_KEY)) || (import.meta as any).env?.VITE_GEMINI_API_KEY || '',
      setApiKey: (apiKey) => set({ apiKey }),
      openaiApiKey: (import.meta as any).env?.VITE_OPENAI_API_KEY || '',
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
      groqApiKey: (import.meta as any).env?.VITE_GROQ_API_KEY || '',
      setGroqApiKey: (groqApiKey) => set({ groqApiKey }),
      chatProvider: 'openai',
      setChatProvider: (chatProvider) => set({ chatProvider }),
      chatModel: 'gpt-4.1-mini',
      setChatModel: (chatModel) => set({ chatModel }),

      // ✅ ElevenLabs
      elevenLabsApiKey: (import.meta as any).env?.VITE_ELEVENLABS_API_KEY || '',
      setElevenLabsApiKey: (elevenLabsApiKey) => set({ elevenLabsApiKey }),
      elevenLabsVoiceId: (import.meta as any).env?.VITE_ELEVENLABS_VOICE_ID || '',
      setElevenLabsVoiceId: (elevenLabsVoiceId) => set({ elevenLabsVoiceId }),

      // WhatsApp
      myWhatsappNumber: '',
      setMyWhatsappNumber: (myWhatsappNumber) => set({ myWhatsappNumber }),
      whatsappContacts: [],
      addWhatsappContact: (contact) => set(s => ({ whatsappContacts: [...s.whatsappContacts, contact] })),
      removeWhatsappContact: (index) => set(s => ({ whatsappContacts: s.whatsappContacts.filter((_, i) => i !== index) })),

      // Tuya Smart Home
      tuyaClientId: '',
      setTuyaClientId: (tuyaClientId) => set({ tuyaClientId }),
      tuyaSecret: '',
      setTuyaSecret: (tuyaSecret) => set({ tuyaSecret }),
      tuyaRegion: 'us',
      setTuyaRegion: (tuyaRegion) => set({ tuyaRegion }),
      tuyaUserId: '',
      setTuyaUserId: (tuyaUserId) => set({ tuyaUserId }),

      // Alexa
      alexaCookie: '',
      setAlexaCookie: (alexaCookie) => set({ alexaCookie }),

      // Custom Skills
      customSkills: [],
      addCustomSkill: (skill) => set(s => ({ customSkills: [...s.customSkills, skill] })),
      updateCustomSkill: (id, updates) => set(s => ({ customSkills: s.customSkills.map(sk => sk.id === id ? { ...sk, ...updates } : sk) })),
      removeCustomSkill: (id) => set(s => ({ customSkills: s.customSkills.filter(sk => sk.id !== id) })),
      toggleCustomSkill: (id) => set(s => ({ customSkills: s.customSkills.map(sk => sk.id === id ? { ...sk, active: !sk.active } : sk) })),

      // ✅ Memória por personagem
      personalityMemories: {
        osone:  defaultPersonalityMemory(),
        ezer:   defaultPersonalityMemory(),
        samuel: defaultPersonalityMemory(),
        jonas:  defaultPersonalityMemory(),
      },
      addPersonalityFact: (personality, fact) => set((state) => ({
        personalityMemories: {
          ...state.personalityMemories,
          [personality]: {
            ...state.personalityMemories[personality],
            facts: [...(state.personalityMemories[personality]?.facts || []), fact].slice(-20),
          }
        }
      })),
      setPersonalityUserName: (personality, name) => set((state) => ({
        personalityMemories: {
          ...state.personalityMemories,
          [personality]: {
            ...state.personalityMemories[personality],
            userName: name,
          }
        }
      })),
      getPersonalityMemory: (personality) => {
        return get().personalityMemories[personality] || defaultPersonalityMemory();
      },

      // Workspace Dev Mode
      workspaceProjectName: '',
      setWorkspaceProjectName: (name) => set({ workspaceProjectName: name }),
      workspaceFiles: [],
      setWorkspaceFiles: (files) => set({ workspaceFiles: files }),
      addWorkspaceFile: (parentId, file) => set((s) => {
        if (!parentId) return { workspaceFiles: [...s.workspaceFiles, file] };
        const addToParent = (nodes: WorkspaceFile[]): WorkspaceFile[] =>
          nodes.map(n => n.id === parentId
            ? { ...n, children: [...(n.children || []), file], expanded: true }
            : n.children ? { ...n, children: addToParent(n.children) } : n
          );
        return { workspaceFiles: addToParent(s.workspaceFiles) };
      }),
      updateWorkspaceFile: (id, updates) => set((s) => {
        const update = (nodes: WorkspaceFile[]): WorkspaceFile[] =>
          nodes.map(n => n.id === id ? { ...n, ...updates } : n.children ? { ...n, children: update(n.children) } : n);
        return { workspaceFiles: update(s.workspaceFiles) };
      }),
      deleteWorkspaceFile: (id) => set((s) => {
        const del = (nodes: WorkspaceFile[]): WorkspaceFile[] =>
          nodes.filter(n => n.id !== id).map(n => n.children ? { ...n, children: del(n.children) } : n);
        return { workspaceFiles: del(s.workspaceFiles) };
      }),
      toggleWorkspaceFolder: (id) => set((s) => {
        const toggle = (nodes: WorkspaceFile[]): WorkspaceFile[] =>
          nodes.map(n => n.id === id ? { ...n, expanded: !n.expanded } : n.children ? { ...n, children: toggle(n.children) } : n);
        return { workspaceFiles: toggle(s.workspaceFiles) };
      }),

      // Modo Operador
      operatorMode: false,
      operatorTask: '',
      operatorSteps: 0,
      operatorMaxSteps: 50,
      setOperatorMode: (active) => set({ operatorMode: active, ...(active ? {} : { operatorTask: '', operatorSteps: 0 }) }),
      setOperatorTask: (task) => set({ operatorTask: task }),
      incrementOperatorStep: () => set((s) => ({ operatorSteps: s.operatorSteps + 1 })),
      resetOperator: () => set({ operatorMode: false, operatorTask: '', operatorSteps: 0 }),

      // Reset
      resetSystem: () => set({
        onboardingStep: 'initial',
        history: [],
        userProfile: {
          hobbies: '',
          relationships: '',
          lifestyle: 'none',
          genderPreference: 'none',
          personality: 'none',
          socialLevel: '',
          motherRelationship: ''
        },
        assistantName: 'OSONE',
        mood: 'calm',
        isConnected: false,
        isMascotVisible: false,
        isScreenSharing: false,
        focusMode: false,
        bootPhase: 0
      }),
    }),
    {
      name: 'her-os-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        voice: state.voice,
        systemMetrics: state.systemMetrics,
        onboardingStep: state.onboardingStep,
        userProfile: state.userProfile,
        assistantName: state.assistantName,
        isMascotVisible: state.isMascotVisible,
        mascotAppearance: state.mascotAppearance,
        apiKey: state.apiKey,
        openaiApiKey: state.openaiApiKey,
        groqApiKey: state.groqApiKey,
        chatProvider: state.chatProvider,
        chatModel: state.chatModel,
        focusMode: state.focusMode,
        mood: state.mood,
        personalityMemories: state.personalityMemories,
        myWhatsappNumber: state.myWhatsappNumber,
        whatsappContacts: state.whatsappContacts,
        tuyaClientId: state.tuyaClientId,
        tuyaSecret: state.tuyaSecret,
        tuyaRegion: state.tuyaRegion,
        tuyaUserId: state.tuyaUserId,
        alexaCookie: state.alexaCookie,
        customSkills: state.customSkills,
        workspaceProjectName: state.workspaceProjectName,
        workspaceFiles: state.workspaceFiles,
        // ✅ ElevenLabs persiste no localStorage
        elevenLabsApiKey: state.elevenLabsApiKey,
        elevenLabsVoiceId: state.elevenLabsVoiceId,
      }),
    }
  )
);
