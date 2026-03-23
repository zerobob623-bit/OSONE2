import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '../firebase';

export type VoiceName = 'Charon' | 'Kore' | 'Puck' | 'Zephyr' | 'Fenrir';
export type Mood = 'happy' | 'calm' | 'focused' | 'playful' | 'melancholic' | 'angry' | 'singing';

export const VOICE_MAPPING: Record<VoiceName, string> = {
  'Charon': 'Charon',
  'Kore': 'Kore',
  'Puck': 'Puck',
  'Zephyr': 'Zephyr',
  'Fenrir': 'Fenrir'
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

export interface SystemMetrics {
  cpu: number;
  mem: number;
}

interface AppState {
  // User
  user: User | null;
  setUser: (user: User | null) => void;
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
  
  // API Key
  apiKey: string;
  setApiKey: (key: string) => void;

  // IMAP Config
  imapConfig: {
    host: string;
    port: number;
    user: string;
    pass: string;
    secure: boolean;
  } | null;
  setImapConfig: (config: any) => void;

  // Reset
  resetSystem: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // User
      user: null,
      setUser: (user) => set({ user }),
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

      // API Key
      apiKey: (typeof process !== 'undefined' && (process.env.GEMINI_API_KEY || process.env.API_KEY)) || (import.meta as any).env?.VITE_GEMINI_API_KEY || '',
      setApiKey: (apiKey) => set({ apiKey }),

      // IMAP Config
      imapConfig: null,
      setImapConfig: (imapConfig) => set({ imapConfig }),

      // Reset System
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
      // Only persist certain fields
      partialize: (state) => ({ 
        voice: state.voice, 
        history: state.history,
        systemMetrics: state.systemMetrics,
        onboardingStep: state.onboardingStep,
        userProfile: state.userProfile,
        assistantName: state.assistantName,
        isMascotVisible: state.isMascotVisible,
        mascotAppearance: state.mascotAppearance,
        apiKey: state.apiKey,
        imapConfig: state.imapConfig,
        focusMode: state.focusMode,
        mood: state.mood
      }),
    }
  )
);
