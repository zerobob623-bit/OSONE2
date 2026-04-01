import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Power, MicOff, Mic, PhoneOff, Send, Paperclip, Monitor, Volume2, VolumeX, Copy, Volume1, Check } from 'lucide-react';
import { OrbSphere } from '../OrbSphere';
import type { MainLayoutProps } from '../../types/layout';

function speak(text: string) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR'; u.rate = 1.0; u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

function MsgActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={() => speak(text)} className="p-1 rounded-md hover:bg-white/10 transition-colors" title="Ouvir">
        <Volume1 size={11} className="text-white/40" />
      </button>
      <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="p-1 rounded-md hover:bg-white/10 transition-colors" title="Copiar">
        {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-white/40" />}
      </button>
    </div>
  );
}

export function DefaultLayout({
  moodColor, mood, personality, MOOD_CONFIG, PERSONALITY_CONFIG,
  statusLabel, isConnected, isSpeaking, isListening, isThinking, isMuted, volume,
  messages, transcriptRef, memory, assistantName,
  inputText, setInputText, onSendText, onMicToggle, onDisconnect,
  fileInputRef, showAttachMenu, setShowAttachMenu, onFileClick, onScreenShare,
  onOrbClick, currentTime, systemMetrics, focusMode, onFocusModeToggle,
  isAmbientEnabled, onAmbientToggle, onOpenMenu, onOpenSettings, onOpenMoodSettings,
  onOpenPersonalityPicker, onOpenWorkspace, onRestart,
  showInstallBanner, onDismissInstallBanner, installPrompt, isInstalled, onInstallApp,
}: MainLayoutProps) {
  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#101010] to-[#000000] text-[#f5f5f5] font-sans overflow-hidden select-none">

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
              <button onClick={onDismissInstallBanner} className="px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-all">Agora não</button>
              <button onClick={onInstallApp} className="px-4 py-2 rounded-xl text-[10px] uppercase tracking-widest font-medium transition-all shadow-lg" style={{ backgroundColor: moodColor, color: '#000' }}>Instalar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP BAR */}
      <div className="fixed top-0 left-0 right-0 h-14 px-5 flex items-center justify-between z-50 bg-[#0a0505]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest opacity-30">
          <button onClick={onOpenMenu} className="flex flex-col gap-[4px] items-center justify-center opacity-100 hover:opacity-70 transition-all">
            <span className="block h-[2px] w-4 rounded-full bg-white" />
            <span className="block h-[2px] w-4 rounded-full bg-white" />
            <span className="block h-[2px] w-4 rounded-full bg-white" />
          </button>
          <span>{currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="hidden sm:inline">CPU {systemMetrics.cpu}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenPersonalityPicker} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all" style={{ borderColor: `${moodColor}40`, backgroundColor: `${moodColor}10` }}>
            <span className="text-xs">{PERSONALITY_CONFIG[personality]?.emoji}</span>
            <span className="text-[9px] uppercase tracking-widest hidden sm:inline" style={{ color: moodColor }}>{PERSONALITY_CONFIG[personality]?.label}</span>
          </button>
          {memory.workspace && (
            <button onClick={onOpenWorkspace} className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] uppercase tracking-widest animate-pulse" style={{ backgroundColor: `${moodColor}20`, color: moodColor, border: `1px solid ${moodColor}40` }}>
              📝 Ver Workspace
            </button>
          )}
          <button onClick={onOpenMoodSettings} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all" style={{ borderColor: `${moodColor}40`, backgroundColor: `${moodColor}10` }}>
            <span className="text-xs">{MOOD_CONFIG[mood]?.emoji}</span>
            <span className="text-[9px] uppercase tracking-widest hidden sm:inline" style={{ color: moodColor }}>{MOOD_CONFIG[mood]?.label}</span>
          </button>
          <button onClick={onFocusModeToggle} className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest transition-all border"
            style={focusMode ? { backgroundColor: '#00cec920', color: '#00cec9', borderColor: '#00cec940' } : { backgroundColor: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.08)' }}>
            {focusMode ? '🎯' : '○'}
          </button>
          <button onClick={onAmbientToggle} className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest transition-all border flex items-center gap-1.5"
            style={isAmbientEnabled ? { backgroundColor: `${moodColor}20`, color: moodColor, borderColor: `${moodColor}40` } : { backgroundColor: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.08)' }}>
            {isAmbientEnabled ? <Volume2 size={10} /> : <VolumeX size={10} />}
            {isAmbientEnabled ? 'Som ON' : 'Som OFF'}
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.05]">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'animate-pulse' : 'bg-zinc-600'}`} style={{ backgroundColor: isConnected ? moodColor : undefined }} />
            <span className="text-[9px] uppercase tracking-widest opacity-50 hidden sm:inline">{isConnected ? 'Ativo' : 'Offline'}</span>
          </div>
          <button onClick={onOpenSettings} className="p-2 hover:bg-white/5 rounded-full opacity-40 hover:opacity-100 transition-all"><Settings size={16} /></button>
          <button onClick={onRestart} className="p-2 hover:bg-white/5 rounded-full opacity-40 hover:opacity-100 transition-all" style={{ color: moodColor }}><Power size={16} /></button>
          {installPrompt && !isInstalled && (
            <button onClick={onInstallApp} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest transition-all" style={{ backgroundColor: `${moodColor}20`, color: moodColor, border: `1px solid ${moodColor}40` }}>
              ⬇ Instalar
            </button>
          )}
        </div>
      </div>

      {/* CENTER ORB */}
      <div className="fixed inset-0 flex items-center justify-center" style={{ top: '56px', bottom: '100px', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'all' }}>
          <OrbSphere
            moodColor={moodColor}
            isConnected={isConnected}
            isSpeaking={isSpeaking}
            isListening={isListening}
            isThinking={isThinking}
            volume={volume}
            size={200}
            onClick={onOrbClick}
          />
        </div>
      </div>

      {/* STATUS */}
      <div className="fixed left-0 right-0 flex justify-center" style={{ bottom: '110px', zIndex: 6 }}>
        <motion.p key={statusLabel} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="text-[9px] font-light tracking-[0.4em] uppercase opacity-40"
          style={{ color: isConnected ? moodColor : '#ffffff' }}>
          {statusLabel}
        </motion.p>
      </div>

      {/* CHAT TRANSCRIPT */}
      <div className="chat-transcript" ref={transcriptRef} style={{ zIndex: 8 }}>
        <AnimatePresence initial={false}>
          {messages.slice(0, 3).reverse().map((msg, idx) => (
            <motion.div key={msg.id || idx} initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }}
              className={`transcript-line group ${msg.role === 'user' ? 'items-end text-right' : 'items-start text-left'}`}>
              <span className={`px-4 py-2 rounded-2xl max-w-[85%] break-words ${msg.role === 'user' ? 'bg-white/10 text-[#BBBBBB] rounded-tr-none' : 'bg-white/5 text-white rounded-tl-none'}`} style={{ backdropFilter: 'blur(5px)' }}>
                {msg.text}
                {msg.imageUrl && <img src={msg.imageUrl} alt="Generated" className="mt-2 rounded-xl w-full max-w-[200px] border border-white/10" referrerPolicy="no-referrer" />}
              </span>
              {msg.role === 'model' && <MsgActions text={msg.text} />}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* INPUT LAYER */}
      <div className="fixed bottom-0 left-0 right-0 z-[20] px-4 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent pt-10"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 16px))' }}>
        <div className="max-w-3xl mx-auto relative flex items-center">
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSendText(); }}
            placeholder="Digite ou pergunte algo..."
            className="w-full bg-transparent border border-white/10 rounded-full py-4 pl-12 pr-32 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
            style={{ backdropFilter: 'blur(10px)' }}
          />
          <div className="absolute left-3">
            <button onClick={() => setShowAttachMenu(v => !v)}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
              style={{ backgroundColor: showAttachMenu ? `${moodColor}30` : 'transparent', color: showAttachMenu ? moodColor : 'rgba(255,255,255,0.4)' }}>
              <span className="text-lg leading-none font-light">+</span>
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute bottom-10 left-0 z-20 rounded-2xl border overflow-hidden shadow-2xl"
                  style={{ backgroundColor: '#1a1010', borderColor: `${moodColor}30`, minWidth: '180px' }}>
                  <button onClick={() => { setShowAttachMenu(false); onFileClick(); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-all">
                    <Paperclip size={16} style={{ color: moodColor }} />
                    <div><p className="text-xs font-medium text-white">Documento / Imagem</p><p className="text-[10px] text-white/30">PDF, foto, doc, txt...</p></div>
                  </button>
                  <div className="h-px bg-white/5" />
                  <button onClick={onScreenShare} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-all">
                    <Monitor size={16} style={{ color: moodColor }} />
                    <div><p className="text-xs font-medium text-white">Compartilhar Tela</p><p className="text-[10px] text-white/30">Mostra sua tela para a IA</p></div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="absolute right-2 flex items-center gap-1">
            {inputText.trim() ? (
              <button onClick={onSendText} className="p-2 text-white/40 hover:text-white transition-colors"><Send size={20} /></button>
            ) : (
              <button onClick={onMicToggle} className="p-2 transition-colors relative"
                style={{ color: isConnected && !isMuted ? moodColor : 'rgba(255,255,255,0.4)' }}>
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            {isConnected && (
              <button onClick={onDisconnect} className="p-2 text-white/40 hover:text-red-400 transition-colors"><PhoneOff size={20} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
