import { RefObject } from 'react';

export interface MainLayoutProps {
  // Theme
  moodColor: string;
  mood: string;
  personality: string;
  MOOD_CONFIG: Record<string, { color: string; label: string; emoji: string }>;
  PERSONALITY_CONFIG: Record<string, { label: string; emoji: string; color: string; voice: string; description: string; greeting: string }>;

  // AI state
  statusLabel: string;
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  isMuted: boolean;
  volume: number;

  // Chat
  messages: Array<{ id?: string; role: 'user' | 'model'; text: string; imageUrl?: string; createdAt?: any }>;
  transcriptRef: RefObject<HTMLDivElement | null>;
  memory: { workspace?: string; userName?: string };
  assistantName: string;

  // Input
  inputText: string;
  setInputText: (v: string) => void;
  onSendText: () => void;
  onMicToggle: () => void;
  onDisconnect: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  showAttachMenu: boolean;
  setShowAttachMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  onFileClick: () => void;
  onScreenShare: () => Promise<void>;

  // Orb click (connect/disconnect)
  onOrbClick: () => void;

  // Top bar
  currentTime: Date;
  systemMetrics: { cpu: number; mem: number };
  focusMode: boolean;
  onFocusModeToggle: () => void;
  isAmbientEnabled: boolean;
  onAmbientToggle: () => void;
  onOpenMenu: () => void;
  onOpenSettings: () => void;
  onOpenMoodSettings: () => void;
  onOpenPersonalityPicker: () => void;
  onOpenWorkspace: () => void;
  onRestart: () => void;

  // PWA
  showInstallBanner: boolean;
  onDismissInstallBanner: () => void;
  installPrompt: any;
  isInstalled: boolean;
  onInstallApp: () => void;
}
