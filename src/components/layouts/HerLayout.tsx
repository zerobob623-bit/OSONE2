import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MicOff, Mic, PhoneOff, Send, Settings, Volume1, Copy, Check } from 'lucide-react';
import type { MainLayoutProps } from '../../types/layout';

function speak(text: string) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR'; u.rate = 1.0; u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

function HerMsgActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const HER_ACCENT = '#c8784a';
  return (
    <div className="flex items-center justify-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={() => speak(text)} className="flex items-center gap-1 text-[10px] transition-opacity hover:opacity-80" style={{ color: HER_ACCENT, fontFamily: 'Cormorant Garamond, serif' }}>
        <Volume1 size={11} /> ouvir
      </button>
      <span style={{ color: 'rgba(200,120,74,0.3)', fontSize: 10 }}>·</span>
      <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="flex items-center gap-1 text-[10px] transition-opacity hover:opacity-80" style={{ color: HER_ACCENT, fontFamily: 'Cormorant Garamond, serif' }}>
        {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'copiado' : 'copiar'}
      </button>
    </div>
  );
}

// EQ bars visualizer — warm amber, 10 bars
function HerEqualizer({ isConnected, isSpeaking, isListening, isThinking, volume }: {
  isConnected: boolean; isSpeaking: boolean; isListening: boolean; isThinking: boolean; volume: number;
}) {
  const bars = 10;
  const active = isConnected && (isSpeaking || isListening || isThinking);
  return (
    <div className="flex items-end justify-center gap-[3px] h-14 w-32">
      {Array.from({ length: bars }).map((_, i) => {
        const baseH = active ? (20 + Math.sin(i * 1.3) * 14) : 4;
        const delay = i * 0.07;
        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{ width: 4, backgroundColor: '#c8784a' }}
            animate={{
              height: active
                ? [baseH, baseH + (volume * 20 + 8), baseH - 4, baseH + (volume * 12), baseH]
                : [4, 6, 4],
              opacity: isConnected ? 0.9 : 0.25,
            }}
            transition={{
              duration: active ? 0.8 : 1.4,
              repeat: Infinity,
              delay,
              ease: 'easeInOut',
            }}
          />
        );
      })}
    </div>
  );
}

export function HerLayout({
  moodColor, personality, PERSONALITY_CONFIG,
  statusLabel, isConnected, isSpeaking, isListening, isThinking, isMuted, volume,
  messages, transcriptRef,
  inputText, setInputText, onSendText, onMicToggle, onDisconnect,
  fileInputRef, showAttachMenu, setShowAttachMenu, onFileClick, onScreenShare,
  onOrbClick, currentTime, onOpenSettings, onOpenPersonalityPicker, onOpenMenu,
  showInstallBanner, onDismissInstallBanner, installPrompt, isInstalled, onInstallApp,
}: MainLayoutProps) {
  const HER_ACCENT = '#c8784a';
  const HER_BG = 'linear-gradient(160deg, #0d0604 0%, #1a0b06 60%, #0d0604 100%)';

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ background: HER_BG }}>

      {/* Warm vignette overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 40%, rgba(200,120,74,0.04) 0%, transparent 70%)'
      }} />

      {/* PWA Banner */}
      <AnimatePresence>
        {showInstallBanner && installPrompt && !isInstalled && (
          <motion.div initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
            className="fixed top-16 left-4 right-4 z-[60] p-4 rounded-2xl flex items-center justify-between gap-4"
            style={{ backgroundColor: 'rgba(200,120,74,0.12)', border: '1px solid rgba(200,120,74,0.25)' }}>
            <p className="text-xs" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#e8d0b8' }}>Instalar OSONE no dispositivo</p>
            <div className="flex gap-2">
              <button onClick={onDismissInstallBanner} className="text-[11px] px-3 py-1.5 rounded-lg" style={{ color: 'rgba(232,208,184,0.4)' }}>agora não</button>
              <button onClick={onInstallApp} className="text-[11px] px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(200,120,74,0.3)', color: '#e8d0b8' }}>instalar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MINIMAL TOP BAR */}
      <div className="fixed top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <button onClick={onOpenMenu} className="flex flex-col gap-[4px] items-center justify-center opacity-30 hover:opacity-70 transition-opacity">
            <span className="block h-[1.5px] w-4 rounded-full" style={{ backgroundColor: '#e8d0b8' }} />
            <span className="block h-[1.5px] w-4 rounded-full" style={{ backgroundColor: '#e8d0b8' }} />
            <span className="block h-[1.5px] w-4 rounded-full" style={{ backgroundColor: '#e8d0b8' }} />
          </button>
          <button onClick={onOpenPersonalityPicker}
            className="text-[11px] tracking-[0.25em] uppercase transition-opacity hover:opacity-70"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: 'rgba(232,208,184,0.5)', letterSpacing: '0.3em' }}>
            {PERSONALITY_CONFIG[personality]?.label || 'OSONE'}
          </button>
        </div>
        <span className="text-[11px]" style={{ fontFamily: 'Cormorant Garamond, serif', color: 'rgba(232,208,184,0.3)', letterSpacing: '0.15em' }}>
          {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button onClick={onOpenSettings} className="opacity-30 hover:opacity-60 transition-opacity">
          <Settings size={15} color="#e8d0b8" />
        </button>
      </div>

      {/* CENTER AREA — orb click zone + EQ visualizer */}
      <div className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: '56px', bottom: '120px' }}>
        {/* Tap zone */}
        <button
          onClick={onOrbClick}
          className="pointer-events-auto flex flex-col items-center gap-6 group"
          style={{ outline: 'none', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {/* EQ bars */}
          <div className="relative">
            <HerEqualizer
              isConnected={isConnected}
              isSpeaking={isSpeaking}
              isListening={isListening}
              isThinking={isThinking}
              volume={volume}
            />
            {/* Glow behind bars */}
            {isConnected && (
              <div className="absolute inset-0 blur-xl opacity-20 pointer-events-none"
                style={{ backgroundColor: HER_ACCENT }} />
            )}
          </div>

          {/* Status text */}
          <motion.p
            key={statusLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] italic"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: isConnected ? HER_ACCENT : 'rgba(232,208,184,0.25)', letterSpacing: '0.2em' }}
          >
            {statusLabel}
          </motion.p>
        </button>
      </div>

      {/* CHAT TRANSCRIPT — large, centered, no bubbles */}
      <div
        ref={transcriptRef}
        className="fixed left-0 right-0 overflow-y-auto"
        style={{ bottom: '130px', maxHeight: '200px', padding: '0 32px' }}
      >
        <AnimatePresence initial={false}>
          {messages.slice(0, 2).reverse().map((msg, idx) => (
            <motion.div
              key={msg.id || idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: idx === 0 ? 0.9 : 0.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center mb-4 group"
            >
              <p
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: idx === 0 ? '1.2rem' : '1rem',
                  color: msg.role === 'model' ? '#e8d0b8' : 'rgba(232,208,184,0.6)',
                  lineHeight: 1.6,
                  fontStyle: msg.role === 'model' ? 'normal' : 'italic',
                }}
              >
                {msg.text}
              </p>
              {msg.role === 'model' && idx === 0 && <HerMsgActions text={msg.text} />}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* INPUT — minimal, warm serif */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[20]"
        style={{ padding: '0 24px', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 16px))' }}
      >
        <div className="max-w-lg mx-auto relative flex items-center gap-3">
          {/* Connection dot */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${isConnected ? 'animate-pulse' : 'opacity-20'}`}
            style={{ backgroundColor: isConnected ? HER_ACCENT : '#e8d0b8' }} />

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSendText(); }}
            placeholder="diga algo..."
            className="flex-1 bg-transparent focus:outline-none text-sm"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: '1rem',
              color: '#e8d0b8',
              borderBottom: `1px solid rgba(200,120,74,0.3)`,
              padding: '8px 0',
              caretColor: HER_ACCENT,
            }}
          />

          <div className="flex items-center gap-1 flex-shrink-0">
            {inputText.trim() ? (
              <button onClick={onSendText} className="opacity-60 hover:opacity-100 transition-opacity">
                <Send size={16} color={HER_ACCENT} />
              </button>
            ) : (
              <button onClick={onMicToggle} className="opacity-60 hover:opacity-100 transition-opacity">
                {isMuted ? <MicOff size={16} color="rgba(232,208,184,0.4)" /> : <Mic size={16} color={isConnected ? HER_ACCENT : 'rgba(232,208,184,0.4)'} />}
              </button>
            )}
            {isConnected && (
              <button onClick={onDisconnect} className="opacity-40 hover:opacity-70 transition-opacity ml-1">
                <PhoneOff size={14} color="rgba(232,208,184,0.5)" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
