import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Send, Settings, ChevronUp, ChevronDown, Volume1, Copy, Check, PhoneOff } from 'lucide-react';
import type { MainLayoutProps } from '../../types/layout';

// ─── Paleta "Her" (2013) ──────────────────────────────────────────────────────
const HER = {
  peach:      '#d4895c',
  terra:      '#c4724a',
  burnt:      '#9b5a3a',
  golden:     '#c4a882',
  cream:      '#e8d0b8',
  bg:         '#1a0e08',
  bgMid:      '#231510',
  dimCream:   'rgba(232,208,184,0.35)',
  dimPeach:   'rgba(212,137,92,0.25)',
};

// ─── 5 formas morfáveis (M + 4C cada — estrutura idêntica para interpolação) ──
// Todas começam aproximadamente no ponto mais à direita e percorrem sentido horário.
const SHAPES = [
  // Círculo (radius ~45, centro 100,55)
  "M 145,55 C 145,30 122,10 100,10 C 78,10 55,30 55,55 C 55,80 78,100 100,100 C 122,100 145,80 145,55",
  // Quadrado arredondado (80×80, centro 100,55)
  "M 140,55 C 140,90 130,95 100,95 C 70,95 60,90 60,55 C 60,20 70,15 100,15 C 130,15 140,20 140,55",
  // Coração (ponto de início = pico direito do lóbulo)
  "M 158,42 C 168,62 140,86 100,100 C 60,86 32,62 42,42 C 48,22 78,15 100,36 C 122,15 152,22 158,42",
  // Estrela de 4 pontas (ponto direito externo)
  "M 148,55 C 120,75 120,75 100,103 C 80,75 80,75 52,55 C 80,35 80,35 100,7 C 120,35 120,35 148,55",
  // Infinito / Ouroboros (ponto mais à direita = 170,55)
  "M 170,55 C 170,86 100,86 100,55 C 100,24 30,24 30,55 C 30,86 100,86 100,55 C 100,24 170,24 170,55",
];

// ─── Símbolo que muda de forma ────────────────────────────────────────────────
function MorphingSymbol({
  isConnected, isSpeaking, isListening, isThinking, volume,
}: {
  isConnected: boolean; isSpeaking: boolean; isListening: boolean;
  isThinking: boolean; volume: number;
}) {
  const [shapeIdx, setShapeIdx] = useState(4); // começa no infinito
  const v      = Math.min(1, volume * 6);
  const active = isConnected && (isSpeaking || isListening);
  const think  = isConnected && isThinking && !active;

  // Ciclo automático — mais rápido quando falando/ouvindo
  useEffect(() => {
    const interval = isSpeaking ? 1800 : isListening ? 2600 : 4200;
    const timer = setInterval(() => {
      setShapeIdx(i => (i + 1) % SHAPES.length);
    }, interval);
    return () => clearInterval(timer);
  }, [isSpeaking, isListening]);

  const dur = active ? Math.max(0.28, 0.7 - v * 0.45) : think ? 1.2 : 3.5;
  const sw  = isConnected ? 1.5 + v * 3 : 0.8;

  // Transição de morph suave com easing cinematográfico
  const morphTransition = { duration: 1.6, ease: [0.4, 0, 0.2, 1] as any };

  return (
    <motion.div
      className="relative flex items-center justify-center"
      animate={{ scale: isConnected ? [1, 1 + v * 0.04, 1] : 1 }}
      transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Halo externo */}
      <motion.div
        className="absolute pointer-events-none"
        animate={{
          opacity: isConnected
            ? active ? [0.18 + v * 0.25, 0.35 + v * 0.35, 0.18 + v * 0.25]
            : think  ? [0.08, 0.18, 0.08]
            :          [0.04, 0.09, 0.04]
            : 0,
        }}
        transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 280, height: 160,
          background: `radial-gradient(ellipse at center, ${HER.peach} 0%, transparent 68%)`,
          filter: 'blur(32px)',
          top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
        }}
      />

      <svg width="240" height="130" viewBox="0 0 200 110">
        <defs>
          <filter id="her-glow" x="-50%" y="-70%" width="200%" height="240%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sombra de profundidade */}
        <motion.path
          fill="none"
          strokeLinecap="round"
          stroke="rgba(196,114,74,0.06)"
          strokeWidth={14}
          filter="url(#her-glow)"
          animate={{ d: SHAPES[shapeIdx] }}
          transition={morphTransition}
        />

        {/* Traço eco (aura) */}
        <motion.path
          fill="none"
          strokeLinecap="round"
          stroke={isConnected ? 'rgba(212,137,92,0.28)' : 'transparent'}
          filter="url(#her-glow)"
          animate={{
            d: SHAPES[shapeIdx],
            strokeWidth: isConnected ? [sw + 3, sw + 6, sw + 3] : 0,
          }}
          transition={{
            d: morphTransition,
            strokeWidth: { duration: dur, repeat: Infinity, ease: 'easeInOut' },
          }}
        />

        {/* Traço principal */}
        <motion.path
          fill="none"
          strokeLinecap="round"
          stroke={isConnected ? HER.peach : 'rgba(196,162,130,0.18)'}
          filter={isConnected ? 'url(#her-glow)' : 'none'}
          animate={{
            d: SHAPES[shapeIdx],
            strokeWidth: isConnected ? [sw, sw + v * 1.5, sw] : [0.8, 1, 0.8],
          }}
          transition={{
            d: morphTransition,
            strokeWidth: { duration: dur, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      </svg>
    </motion.div>
  );
}

// ─── Ações de mensagem ────────────────────────────────────────────────────────
function MsgActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleSpeak = () => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR'; u.rate = 1.0; u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  };
  return (
    <div className="flex items-center justify-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
      <button onClick={handleSpeak}
        className="flex items-center gap-1 text-[10px] hover:opacity-70 transition-opacity"
        style={{ color: HER.peach, fontFamily: 'Cormorant Garamond, serif' }}>
        <Volume1 size={10} /> ouvir
      </button>
      <span style={{ color: 'rgba(196,162,130,0.3)', fontSize: 10 }}>·</span>
      <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="flex items-center gap-1 text-[10px] hover:opacity-70 transition-opacity"
        style={{ color: HER.peach, fontFamily: 'Cormorant Garamond, serif' }}>
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? 'copiado' : 'copiar'}
      </button>
    </div>
  );
}

// ─── Layout principal ─────────────────────────────────────────────────────────
export function HerLayout({
  personality, PERSONALITY_CONFIG,
  statusLabel, isConnected, isSpeaking, isListening, isThinking, isMuted, volume,
  messages, transcriptRef,
  inputText, setInputText, onSendText, onMicToggle, onDisconnect,
  onOrbClick, currentTime, onOpenSettings, onOpenPersonalityPicker, onOpenMenu,
  showInstallBanner, onDismissInstallBanner, installPrompt, isInstalled, onInstallApp,
}: MainLayoutProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const hasMessages = messages.length > 0;

  const v = Math.min(1, volume * 6);

  return (
    <div className="fixed inset-0 overflow-hidden select-none"
      style={{ background: `linear-gradient(165deg, ${HER.bg} 0%, ${HER.bgMid} 55%, ${HER.bg} 100%)` }}>

      {/* Textura de grão sutil */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")", backgroundSize: '200px 200px' }} />

      {/* Vinheta radial quente */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: isConnected ? [0.05, 0.1, 0.05] : 0.03 }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: `radial-gradient(ellipse 70% 55% at 50% 48%, ${HER.peach} 0%, transparent 100%)` }}
      />

      {/* PWA Banner */}
      <AnimatePresence>
        {showInstallBanner && installPrompt && !isInstalled && (
          <motion.div
            initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
            className="fixed top-16 left-4 right-4 z-[60] p-4 rounded-2xl flex items-center justify-between gap-4"
            style={{ backgroundColor: 'rgba(212,137,92,0.08)', border: '1px solid rgba(212,137,92,0.18)' }}>
            <p className="text-xs" style={{ fontFamily: 'Cormorant Garamond, serif', color: HER.cream }}>
              Instalar no dispositivo
            </p>
            <div className="flex gap-2">
              <button onClick={onDismissInstallBanner}
                className="text-[11px] px-3 py-1.5 rounded-lg"
                style={{ color: 'rgba(232,208,184,0.35)' }}>agora não</button>
              <button onClick={onInstallApp}
                className="text-[11px] px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'rgba(212,137,92,0.22)', color: HER.cream }}>instalar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOP BAR — desaparece quando conectado ──────────────────────────── */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-50"
        animate={{ opacity: isConnected ? 0 : 1, y: isConnected ? -10 : 0 }}
        transition={{ duration: 0.55, ease: 'easeInOut' }}
        style={{ pointerEvents: isConnected ? 'none' : 'auto' }}
      >
        <div className="flex items-center gap-3">
          <button onClick={onOpenMenu}
            className="flex flex-col gap-[5px] items-center justify-center opacity-25 hover:opacity-65 transition-opacity">
            <span className="block h-px w-[15px] rounded-full" style={{ backgroundColor: HER.cream }} />
            <span className="block h-px w-[15px] rounded-full" style={{ backgroundColor: HER.cream }} />
            <span className="block h-px w-[15px] rounded-full" style={{ backgroundColor: HER.cream }} />
          </button>
          <button onClick={onOpenPersonalityPicker}
            className="text-[11px] tracking-[0.3em] uppercase hover:opacity-70 transition-opacity"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: 'rgba(232,208,184,0.4)' }}>
            {PERSONALITY_CONFIG[personality]?.label ?? 'OSONE'}
          </button>
        </div>

        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 11, color: 'rgba(232,208,184,0.22)', letterSpacing: '0.15em' }}>
          {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>

        <button onClick={onOpenSettings} className="opacity-22 hover:opacity-55 transition-opacity">
          <Settings size={14} color={HER.cream} />
        </button>
      </motion.div>

      {/* ── CENTRO — Símbolo morfável + status ─────────────────────────────── */}
      <div className="fixed inset-0 flex flex-col items-center justify-center"
        style={{
          top: isConnected ? '0px' : '56px',
          bottom: isConnected ? '148px' : '140px',
          transition: 'top 0.55s ease, bottom 0.55s ease',
          pointerEvents: 'none',
        }}>
        <button
          onClick={onOrbClick}
          className="flex flex-col items-center gap-5"
          style={{ outline: 'none', background: 'none', border: 'none', cursor: 'pointer', pointerEvents: 'auto' }}
        >
          <MorphingSymbol
            isConnected={isConnected}
            isSpeaking={isSpeaking}
            isListening={isListening}
            isThinking={isThinking}
            volume={volume}
          />

          <motion.p
            key={statusLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-[11px] italic tracking-[0.22em]"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              color: isConnected ? HER.peach : 'rgba(232,208,184,0.18)',
            }}
          >
            {statusLabel.toLowerCase()}
          </motion.p>
        </button>
      </div>

      {/* ── PAINEL DE CHAT — desliza para cima ─────────────────────────────── */}
      <AnimatePresence>
        {chatOpen && hasMessages && (
          <motion.div
            ref={transcriptRef}
            key="chat-panel"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
            className="fixed left-0 right-0 overflow-y-auto"
            style={{
              bottom: 140,
              maxHeight: '46vh',
              padding: '28px 32px 12px',
              background: 'linear-gradient(to bottom, transparent 0%, rgba(26,14,8,0.97) 18%)',
            }}
          >
            {[...messages].reverse().slice(0, 25).map((msg, idx) => (
              <motion.div
                key={msg.id ?? idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: Math.max(0.18, 0.95 - idx * 0.1) }}
                className="text-center mb-5 group"
              >
                <p style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: idx === 0 ? '1.18rem' : '1rem',
                  color: msg.role === 'model' ? HER.cream : 'rgba(232,208,184,0.52)',
                  lineHeight: 1.7,
                  fontStyle: msg.role === 'user' ? 'italic' : 'normal',
                }}>
                  {msg.text}
                </p>
                {msg.role === 'model' && idx === 0 && <MsgActions text={msg.text} />}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ÁREA INFERIOR ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-[20]"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 16px))' }}>

        {/* Toggle de chat — aparece apenas quando há mensagens */}
        <AnimatePresence>
          {hasMessages && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center px-7 mb-2"
            >
              <button
                onClick={() => setChatOpen(v => !v)}
                className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
                style={{
                  color: chatOpen ? HER.peach : HER.golden,
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  opacity: chatOpen ? 0.7 : 0.35,
                }}
              >
                {chatOpen
                  ? <><ChevronDown size={12} /> fechar</>
                  : <><ChevronUp size={12} /> mensagens</>
                }
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── MODO CONECTADO: mic grande central ──────────────────────────── */}
        {isConnected ? (
          <div className="flex flex-col items-center gap-3 px-6">
            {/* Mic */}
            <motion.button
              onClick={onMicToggle}
              className="relative flex items-center justify-center rounded-full"
              animate={{
                boxShadow: !isMuted && (isSpeaking || isListening)
                  ? [`0 0 ${16 + v * 36}px rgba(212,137,92,${0.12 + v * 0.28})`,
                     `0 0 ${24 + v * 48}px rgba(212,137,92,${0.18 + v * 0.32})`,
                     `0 0 ${16 + v * 36}px rgba(212,137,92,${0.12 + v * 0.28})`]
                  : '0 0 0px transparent',
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              style={{
                width: 68, height: 68,
                background: isMuted
                  ? 'rgba(232,208,184,0.05)'
                  : `radial-gradient(circle at 40% 35%, rgba(212,137,92,0.22) 0%, rgba(212,137,92,0.07) 100%)`,
                border: `1.5px solid ${isMuted ? 'rgba(232,208,184,0.12)' : 'rgba(212,137,92,0.32)'}`,
              }}
            >
              {isMuted
                ? <MicOff size={26} color="rgba(232,208,184,0.3)" />
                : <Mic size={26} color={isListening || isSpeaking ? HER.peach : 'rgba(212,137,92,0.65)'} />
              }
            </motion.button>

            {/* Input de texto + desconectar */}
            <div className="w-full max-w-xs flex items-center gap-3">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSendText(); }}
                placeholder="ou escreva..."
                className="flex-1 bg-transparent focus:outline-none text-center"
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: '0.88rem',
                  color: 'rgba(232,208,184,0.38)',
                  borderBottom: '1px solid rgba(196,114,74,0.14)',
                  padding: '5px 0',
                  caretColor: HER.peach,
                }}
              />
              {inputText.trim() && (
                <button onClick={onSendText} className="opacity-45 hover:opacity-90 transition-opacity flex-shrink-0">
                  <Send size={13} color={HER.peach} />
                </button>
              )}
              <button onClick={onDisconnect} className="opacity-18 hover:opacity-50 transition-opacity flex-shrink-0">
                <PhoneOff size={13} color={HER.cream} />
              </button>
            </div>
          </div>
        ) : (
          /* ── MODO DESCONECTADO: input padrão ──────────────────────────── */
          <div className="px-6">
            <div className="max-w-lg mx-auto flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-18"
                style={{ backgroundColor: HER.cream }} />
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSendText(); }}
                placeholder="diga algo..."
                className="flex-1 bg-transparent focus:outline-none"
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: '1rem',
                  color: HER.cream,
                  borderBottom: '1px solid rgba(196,114,74,0.22)',
                  padding: '8px 0',
                  caretColor: HER.peach,
                }}
              />
              {inputText.trim() ? (
                <button onClick={onSendText} className="opacity-45 hover:opacity-90 transition-opacity">
                  <Send size={15} color={HER.peach} />
                </button>
              ) : (
                <button onClick={onMicToggle} className="opacity-45 hover:opacity-90 transition-opacity">
                  {isMuted
                    ? <MicOff size={15} color="rgba(232,208,184,0.35)" />
                    : <Mic size={15} color="rgba(212,137,92,0.65)" />
                  }
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
