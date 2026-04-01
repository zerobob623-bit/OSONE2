import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Send, Settings, Paperclip, Monitor, Volume1, Copy, Check } from 'lucide-react';
import type { MainLayoutProps } from '../../types/layout';

function speak(text: string) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR'; u.rate = 1.0; u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

function OrbMsgActions({ text, moodColor }: { text: string; moodColor: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={() => speak(text)} className="p-1 rounded-full hover:bg-white/10 transition-colors" title="Ouvir" style={{ color: moodColor }}>
        <Volume1 size={10} />
      </button>
      <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="p-1 rounded-full hover:bg-white/10 transition-colors" title="Copiar" style={{ color: copied ? '#4ade80' : moodColor }}>
        {copied ? <Check size={10} /> : <Copy size={10} />}
      </button>
    </div>
  );
}

// 8 floating particles orbiting the sphere
const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  angle: (i / 8) * 360,
  radius: 160,
  size: i % 3 === 0 ? 4 : 2.5,
  duration: 4 + i * 0.4,
  delay: i * 0.5,
}));

// ─── Distorção de onda circular invisível (heat-shimmer) ─────────────────────
function DistortionWave({ moodColor, isSpeaking, isListening, volume }: {
  moodColor: string; isSpeaking: boolean; isListening: boolean; volume: number;
}) {
  const turbRef = useRef<SVGFETurbulenceElement | null>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement | null>(null);

  // Refs para evitar recriação do loop RAF a cada mudança de prop
  const volumeRef  = useRef(volume);
  const speakRef   = useRef(isSpeaking);
  const listenRef  = useRef(isListening);

  useEffect(() => { volumeRef.current  = volume;      }, [volume]);
  useEffect(() => { speakRef.current   = isSpeaking;  }, [isSpeaking]);
  useEffect(() => { listenRef.current  = isListening; }, [isListening]);

  // Loop de animação da turbulência — sem re-renders React
  useEffect(() => {
    let t = 0;
    let raf: number;
    const loop = () => {
      t += 0.005;
      if (turbRef.current) {
        const bfx = (0.010 + Math.sin(t) * 0.004).toFixed(4);
        const bfy = (0.013 + Math.cos(t * 0.75) * 0.004).toFixed(4);
        turbRef.current.setAttribute('baseFrequency', `${bfx} ${bfy}`);
        turbRef.current.setAttribute('seed', String(Math.floor(t * 7) % 100));
      }
      if (dispRef.current) {
        const v    = volumeRef.current;
        const speak = speakRef.current;
        const listen = listenRef.current;
        const scale = speak  ? (10 + v * 18).toFixed(1)
          : listen ? '6.0'
          :          '3.0';
        dispRef.current.setAttribute('scale', scale);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ringCount = [0, 1, 2, 3];

  return (
    <>
      {/* Definição do filtro SVG (oculto, sem tamanho) */}
      <svg
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
        aria-hidden="true"
      >
        <defs>
          <filter
            id="orb-heat-distort"
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              ref={turbRef}
              type="turbulence"
              baseFrequency="0.010 0.013"
              numOctaves="3"
              seed="1"
              result="noise"
            />
            <feDisplacementMap
              ref={dispRef}
              in="SourceGraphic"
              in2="noise"
              scale="3"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Camada de distorção — sobreposição quase invisível ao redor do orb */}
      <motion.div
        className="absolute pointer-events-none rounded-full"
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        style={{
          width: 320, height: 320,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          // Gradiente radial extremamente sutil — é ele que "carrega" o deslocamento
          background: `radial-gradient(circle at 50% 50%, ${moodColor}05 0%, ${moodColor}02 50%, transparent 72%)`,
          filter: 'url(#orb-heat-distort)',
        }}
      />

      {/* Anéis de onda expansiva (ripple) */}
      {ringCount.map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          animate={{
            scale: [1, 2.4],
            opacity: [isSpeaking ? 0.14 : 0.06, 0],
          }}
          transition={{
            duration: isSpeaking ? 2.4 : 3.6,
            repeat: Infinity,
            delay: i * (isSpeaking ? 0.6 : 0.9),
            ease: [0.2, 0, 0.6, 1],
          }}
          style={{
            width: 240, height: 240,
            top: '50%', left: '50%',
            x: '-50%', y: '-50%',
            border: `1px solid ${moodColor}`,
            borderRadius: '50%',
          }}
        />
      ))}
    </>
  );
}

function OrbSphere({ moodColor, isSpeaking, isListening, isThinking, volume }: {
  moodColor: string; isSpeaking: boolean;
  isListening: boolean; isThinking: boolean; volume: number;
}) {
  const scale = isSpeaking ? 1 + volume * 0.08 : isListening ? 0.97 : isThinking ? 1.01 : 1;
  const glowIntensity = isSpeaking ? 60 + volume * 40 : (isListening || isThinking) ? 40 : 20;

  const orb3DStyle = {
    width: 220,
    height: 220,
    borderRadius: '50%',
    background: `
      radial-gradient(circle at 35% 32%, rgba(255,255,255,0.18) 0%, transparent 45%),
      radial-gradient(circle at center, ${moodColor}cc 0%, ${moodColor}66 40%, ${moodColor}11 70%, transparent 100%)
    `,
    boxShadow: `
      0 0 ${glowIntensity}px ${moodColor}88,
      0 0 ${glowIntensity * 2}px ${moodColor}44,
      0 0 ${glowIntensity * 3}px ${moodColor}22,
      inset 0 0 40px rgba(0,0,0,0.5),
      inset 0 -20px 40px rgba(0,0,0,0.3)
    `,
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: 320, height: 320 }}>

      {/* Distorção de calor + anéis expansivos */}
      <DistortionWave
        moodColor={moodColor}
        isSpeaking={isSpeaking}
        isListening={isListening}
        volume={volume}
      />

      {/* Outer glow ring */}
      <motion.div
        className="absolute rounded-full"
        animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 260, height: 260,
          border: `1px solid ${moodColor}40`,
          borderRadius: '50%',
        }}
      />

      {/* Orbital rings — when speaking or listening */}
      {(isSpeaking || isListening || isThinking) && (
        <>
          <motion.div
            className="absolute rounded-full border"
            animate={{ rotateZ: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            style={{ width: 240, height: 240, borderColor: `${moodColor}30`, transform: 'rotateX(70deg)' }}
          />
          <motion.div
            className="absolute rounded-full border"
            animate={{ rotateZ: -360 }}
            transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
            style={{ width: 260, height: 260, borderColor: `${moodColor}20`, transform: 'rotateX(60deg) rotateZ(45deg)' }}
          />
        </>
      )}

      {/* Particles — only when speaking */}
      {isSpeaking && PARTICLES.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, backgroundColor: moodColor }}
          animate={{
            x: [
              Math.cos((p.angle * Math.PI) / 180) * p.radius,
              Math.cos(((p.angle + 360) * Math.PI) / 180) * p.radius,
            ],
            y: [
              Math.sin((p.angle * Math.PI) / 180) * (p.radius * 0.4),
              Math.sin(((p.angle + 360) * Math.PI) / 180) * (p.radius * 0.4),
            ],
            opacity: [0.8, 0.4, 0.8],
          }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'linear' }}
        />
      ))}

      {/* The sphere itself */}
      <motion.div
        animate={{ scale, rotateY: (isSpeaking || isListening) ? [0, 2, 0, -2, 0] : 0 }}
        transition={{
          scale: { type: 'spring', stiffness: 200, damping: 20 },
          rotateY: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
        }}
        style={orb3DStyle}
      />

      {/* Thinking spinner */}
      {isThinking && (
        <motion.div
          className="absolute rounded-full border-t-2"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          style={{ width: 240, height: 240, borderColor: `${moodColor}60` }}
        />
      )}
    </div>
  );
}

export function OrbLayout({
  moodColor, personality, PERSONALITY_CONFIG,
  statusLabel, isSpeaking, isListening, isThinking, volume,
  messages, transcriptRef,
  inputText, setInputText, onSendText, onMicToggle,
  fileInputRef, showAttachMenu, setShowAttachMenu, onFileClick, onScreenShare,
  onOrbClick, currentTime, onOpenSettings, onOpenPersonalityPicker, onOpenMenu,
  showInstallBanner, onDismissInstallBanner, installPrompt, isInstalled, onInstallApp,
}: MainLayoutProps) {

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ backgroundColor: '#000000' }}>

      {/* Deep space background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse at 50% 50%, ${moodColor}08 0%, transparent 65%)`
      }} />

      {/* PWA Banner */}
      <AnimatePresence>
        {showInstallBanner && installPrompt && !isInstalled && (
          <motion.div initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
            className="fixed top-16 left-4 right-4 z-[60] p-3 rounded-xl flex items-center justify-between gap-3"
            style={{ backgroundColor: `${moodColor}15`, border: `1px solid ${moodColor}30` }}>
            <p className="text-xs text-white/60">Instalar OSONE</p>
            <div className="flex gap-2">
              <button onClick={onDismissInstallBanner} className="text-[10px] text-white/30 px-2 py-1">não</button>
              <button onClick={onInstallApp} className="text-[10px] px-3 py-1 rounded-lg" style={{ backgroundColor: `${moodColor}30`, color: moodColor }}>instalar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MINIMAL TOP BAR */}
      <div className="fixed top-0 left-0 right-0 h-14 px-5 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <button onClick={onOpenMenu} className="flex flex-col gap-[4px] items-center justify-center opacity-30 hover:opacity-70 transition-opacity">
            <span className="block h-[2px] w-4 rounded-full bg-white" />
            <span className="block h-[2px] w-4 rounded-full bg-white" />
            <span className="block h-[2px] w-4 rounded-full bg-white" />
          </button>
          <button onClick={onOpenPersonalityPicker}
            className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
            <span className="text-base">{PERSONALITY_CONFIG[personality]?.emoji}</span>
            <span className="text-[9px] uppercase tracking-[0.25em]" style={{ color: moodColor }}>{PERSONALITY_CONFIG[personality]?.label}</span>
          </button>
        </div>
        <span className="text-[10px] tracking-widest opacity-20">{currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        <button onClick={onOpenSettings} className="opacity-30 hover:opacity-70 transition-opacity">
          <Settings size={16} color="white" />
        </button>
      </div>

      {/* CHAT — floating above orb */}
      <div
        ref={transcriptRef}
        className="fixed left-0 right-0 overflow-hidden"
        style={{ top: '70px', height: '140px', padding: '0 24px' }}
      >
        <AnimatePresence initial={false}>
          {messages.slice(0, 2).reverse().map((msg, idx) => (
            <motion.div
              key={msg.id || idx}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: idx === 0 ? 0.9 : 0.35 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-center mb-3 group"
            >
              <p className="text-sm leading-relaxed"
                style={{ color: msg.role === 'model' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)', textShadow: idx === 0 && msg.role === 'model' ? `0 0 20px ${moodColor}60` : 'none' }}>
                {msg.text}
              </p>
              {msg.role === 'model' && idx === 0 && <OrbMsgActions text={msg.text} moodColor={moodColor} />}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ORB — center */}
      <div className="fixed inset-0 flex items-center justify-center" style={{ top: '56px', bottom: '110px' }}>
        <button onClick={onOrbClick} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <OrbSphere
            moodColor={moodColor}
            isSpeaking={isSpeaking}
            isListening={isListening}
            isThinking={isThinking}
            volume={volume}
          />
        </button>
      </div>

      {/* STATUS — below orb */}
      <div className="fixed left-0 right-0 flex justify-center" style={{ bottom: '130px' }}>
        <motion.p
          key={statusLabel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[9px] uppercase tracking-[0.35em]"
          style={{ color: (isSpeaking || isListening) ? moodColor : 'rgba(255,255,255,0.2)' }}
        >
          {statusLabel}
        </motion.p>
      </div>

      {/* INPUT LAYER */}
      <div className="fixed bottom-0 left-0 right-0 z-[20] px-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 16px))', background: 'linear-gradient(to top, #000 60%, transparent)' }}>
        <div className="max-w-xl mx-auto relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSendText(); }}
            placeholder="mensagem..."
            className="w-full bg-transparent py-4 pl-10 pr-24 text-sm text-white placeholder-white/20 focus:outline-none transition-colors"
            style={{ border: `1px solid ${moodColor}30`, borderRadius: 40, backdropFilter: 'blur(12px)', backgroundColor: `${moodColor}08` }}
          />
          {/* + button */}
          <div className="absolute left-3">
            <button
              onClick={() => setShowAttachMenu(v => !v)}
              className="w-6 h-6 flex items-center justify-center rounded-full transition-all"
              style={{ color: showAttachMenu ? moodColor : 'rgba(255,255,255,0.3)' }}>
              <span className="text-base leading-none">+</span>
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-10 left-0 z-20 rounded-2xl border overflow-hidden shadow-2xl"
                  style={{ backgroundColor: '#0a0a0a', borderColor: `${moodColor}30`, minWidth: '170px' }}>
                  <button onClick={() => { setShowAttachMenu(false); onFileClick(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all text-left">
                    <Paperclip size={14} style={{ color: moodColor }} />
                    <p className="text-xs text-white/70">Documento / Imagem</p>
                  </button>
                  <div className="h-px" style={{ backgroundColor: `${moodColor}15` }} />
                  <button onClick={onScreenShare} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all text-left">
                    <Monitor size={14} style={{ color: moodColor }} />
                    <p className="text-xs text-white/70">Compartilhar Tela</p>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right controls */}
          <div className="absolute right-3 flex items-center gap-1">
            {inputText.trim() ? (
              <button onClick={onSendText} className="p-1.5 transition-colors">
                <Send size={18} style={{ color: moodColor }} />
              </button>
            ) : (
              <button onClick={onMicToggle} className="p-1.5 transition-colors">
                <Mic size={18} style={{ color: isListening ? moodColor : 'rgba(255,255,255,0.3)' }} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
