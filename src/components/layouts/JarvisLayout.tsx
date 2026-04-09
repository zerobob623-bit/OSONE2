// JarvisLayout.tsx — Interface estilo Jarvis / Iron Man HUD
// Visão de tela em tempo real, conversa por voz, funciona no celular e PC.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, PhoneOff, Send, Settings, Monitor, MonitorOff, Copy, Check, Volume2, ChevronRight, Zap, Shield, Eye, EyeOff } from 'lucide-react';
import type { MainLayoutProps } from '../../types/layout';

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
}

// ─── Funções utilitárias ──────────────────────────────────────────────────────
function copyText(text: string, onCopied: () => void) {
  navigator.clipboard.writeText(text).then(onCopied).catch(() => {});
}

// ─── Waveform Canvas ──────────────────────────────────────────────────────────
function WaveformCanvas({
  isConnected, isSpeaking, isListening, isThinking, volume, color,
}: {
  isConnected: boolean; isSpeaking: boolean; isListening: boolean;
  isThinking: boolean; volume: number; color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ isConnected, isSpeaking, isListening, isThinking, volume, color });

  useEffect(() => {
    stateRef.current = { isConnected, isSpeaking, isListening, isThinking, volume, color };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    let raf: number;
    let t = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W * dpr, H * dpr);
      ctx.save();
      ctx.scale(dpr, dpr);

      const { isConnected: conn, isSpeaking: speak, isListening: listen, isThinking: think, volume: vol, color: c } = stateRef.current;

      t += 0.04;
      const bars = 48;
      const barW = W / bars;
      const maxH = H * 0.42;

      for (let i = 0; i < bars; i++) {
        const progress = i / bars;
        const phase = progress * Math.PI * 4 + t;
        let h = 2;
        if (conn) {
          if (speak) h = maxH * (0.3 + 0.7 * Math.abs(Math.sin(phase + Math.sin(t * 2 + i * 0.3))) * (0.5 + vol * 0.5));
          else if (listen) h = maxH * (0.15 + 0.25 * Math.abs(Math.sin(phase)));
          else if (think) h = maxH * (0.08 + 0.12 * Math.abs(Math.sin(phase * 1.5 + t)));
          else h = maxH * (0.04 + 0.06 * Math.abs(Math.sin(phase * 0.5)));
        } else {
          h = 2 + Math.abs(Math.sin(progress * Math.PI * 2 + t * 0.3)) * 4;
        }

        const x = i * barW + barW * 0.15;
        const y = (H - h) / 2;
        const alpha = conn ? (speak ? 0.85 : listen ? 0.6 : think ? 0.45 : 0.25) : 0.12;
        ctx.fillStyle = c + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fillRect(x, y, barW * 0.7, h);
      }

      ctx.restore();
    };

    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

// ─── Arco HUD circular ───────────────────────────────────────────────────────
function HudArc({
  radius, strokeWidth = 2, dashRatio = 0.7, rotate = 0, color, opacity = 1,
  animate: shouldAnimate = false, speed = 1,
}: {
  radius: number; strokeWidth?: number; dashRatio?: number; rotate?: number;
  color: string; opacity?: number; animate?: boolean; speed?: number;
}) {
  const circum = 2 * Math.PI * radius;
  const dash = circum * dashRatio;
  const gap = circum - dash;
  const size = (radius + strokeWidth) * 2;
  return (
    <motion.svg
      width={size} height={size}
      className="absolute"
      style={{ top: '50%', left: '50%', transform: `translate(-50%, -50%) rotate(${rotate}deg)` }}
      animate={shouldAnimate ? { rotate: [rotate, rotate + 360] } : {}}
      transition={shouldAnimate ? { duration: 8 / speed, repeat: Infinity, ease: 'linear' } : {}}
    >
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${gap}`}
        strokeLinecap="round"
        opacity={opacity}
      />
    </motion.svg>
  );
}

// ─── Canto de decoração HUD ───────────────────────────────────────────────────
function HudCorner({ pos, color }: { pos: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const isTop = pos === 'tl' || pos === 'tr';
  const isLeft = pos === 'tl' || pos === 'bl';
  const size = 18;
  const thick = 2;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        [isTop ? 'top' : 'bottom']: 0,
        [isLeft ? 'left' : 'right']: 0,
        width: size, height: size,
        borderTop: isTop ? `${thick}px solid ${color}` : 'none',
        borderBottom: !isTop ? `${thick}px solid ${color}` : 'none',
        borderLeft: isLeft ? `${thick}px solid ${color}` : 'none',
        borderRight: !isLeft ? `${thick}px solid ${color}` : 'none',
        opacity: 0.7,
      }}
    />
  );
}

// ─── Ticker de status ─────────────────────────────────────────────────────────
function StatusTicker({ items, color }: { items: string[]; color: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % items.length), 3000);
    return () => clearInterval(id);
  }, [items.length]);
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={idx}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3 }}
        className="text-[9px] font-mono uppercase tracking-widest"
        style={{ color: color + 'aa' }}
      >
        {items[idx]}
      </motion.span>
    </AnimatePresence>
  );
}

// ─── Mensagem individual ──────────────────────────────────────────────────────
function JarvisMessage({ msg, color, name }: { msg: { role: 'user' | 'model'; text: string; imageUrl?: string; id?: string; createdAt?: any }; color: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const isModel = msg.role === 'model';
  return (
    <motion.div
      initial={{ opacity: 0, x: isModel ? -8 : 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className={`group flex flex-col gap-1 ${isModel ? 'items-start' : 'items-end'}`}
    >
      <div
        className="relative max-w-[88%] px-3 py-2 text-sm leading-relaxed"
        style={{
          background: isModel
            ? `linear-gradient(135deg, ${color}0d 0%, ${color}06 100%)`
            : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isModel ? color + '28' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: isModel ? '2px 12px 12px 12px' : '12px 2px 12px 12px',
        }}
      >
        {/* Indicador de papel */}
        <div
          className="absolute top-0 text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5"
          style={{
            [isModel ? 'left' : 'right']: 6,
            top: -9,
            color: isModel ? color + 'aa' : 'rgba(255,255,255,0.3)',
          }}
        >
          {isModel ? name.toUpperCase() : 'VOCÊ'}
        </div>

        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="screen" className="max-w-full rounded mb-2 opacity-80" style={{ border: `1px solid ${color}30` }} />
        )}
        <p className="text-white/80 whitespace-pre-wrap break-words">{msg.text}</p>

        {/* Copy button */}
        <button
          onClick={() => copyText(msg.text, () => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
          className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
          style={{ color }}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function JarvisLayout({
  moodColor,
  isConnected, isSpeaking, isListening, isThinking, isMuted, volume,
  statusLabel,
  messages,
  transcriptRef,
  assistantName,
  inputText, setInputText, onSendText,
  onMicToggle, onDisconnect,
  fileInputRef, showAttachMenu, setShowAttachMenu, onFileClick, onScreenShare,
  onOrbClick,
  currentTime, systemMetrics,
  focusMode,
  onOpenSettings,
}: MainLayoutProps) {
  const [screenVisible, setScreenVisible] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Cor tema ──────────────────────────────────────────────────────────────
  const jarvisColor = isConnected ? (isSpeaking ? '#00d4ff' : isListening ? '#00ff88' : isThinking ? '#ff9f1c' : '#00bfff') : '#1e4d6b';

  // ── Status label ticker ───────────────────────────────────────────────────
  const tickerItems = isConnected
    ? isThinking
      ? ['PROCESSANDO', 'ANALISANDO', 'COMPUTANDO']
      : isSpeaking
        ? ['TRANSMITINDO', 'ÁUDIO ATIVO', 'RESPONDENDO']
        : isListening
          ? ['ESCUTANDO', 'CAPTANDO VOZ', 'AGUARDANDO INPUT']
          : ['STANDBY', 'SISTEMA ATIVO', 'PRONTO']
    : ['SISTEMA OFFLINE', 'TOQUE PARA ATIVAR', `${assistantName} v1.0`];

  // ── Screen sharing ────────────────────────────────────────────────────────
  const handleScreenToggle = useCallback(async () => {
    if (screenVisible && screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
      setScreenVisible(false);
      return;
    }
    try {
      await onScreenShare();
      // onScreenShare starts sharing with Gemini; we also grab local display
      const localStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 } });
      setScreenStream(localStream);
      setScreenVisible(true);
      if (videoRef.current) videoRef.current.srcObject = localStream;
      localStream.getVideoTracks()[0].addEventListener('ended', () => {
        setScreenStream(null);
        setScreenVisible(false);
      });
    } catch {
      // User cancelled or screen share already handled by onScreenShare
      setScreenVisible(false);
    }
  }, [screenVisible, screenStream, onScreenShare]);

  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // ── Enter key ─────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendText(); }
  };

  // ── Hora formatada ────────────────────────────────────────────────────────
  const timeStr = currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = currentTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();

  // ── Métricas de barra ─────────────────────────────────────────────────────
  const cpuPct = Math.min(100, systemMetrics.cpu);
  const memPct = Math.min(100, systemMetrics.mem);

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col"
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, #020e1a 0%, #010810 60%, #000508 100%)',
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      {/* ── Scanlines overlay ─────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,200,255,0.015) 2px, rgba(0,200,255,0.015) 4px)',
          backgroundSize: '100% 4px',
        }}
      />

      {/* ── Vinheta radial ────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)' }}
      />

      {/* ─────────────────────────── TOPBAR ─────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-safe-top pt-3 pb-2 shrink-0" style={{ borderBottom: `1px solid ${jarvisColor}18` }}>
        {/* Canto esquerdo - Logo */}
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${jarvisColor}60`, animation: 'pulse 2s infinite' }} />
            <Zap size={12} style={{ color: jarvisColor }} />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color: jarvisColor }}>
              {assistantName}
            </p>
            <p className="text-[8px] tracking-widest uppercase" style={{ color: jarvisColor + '60' }}>
              AI ASSISTANT
            </p>
          </div>
        </div>

        {/* Centro - hora */}
        <div className="flex flex-col items-center">
          <p className="text-sm font-mono font-bold tracking-widest" style={{ color: jarvisColor }}>{timeStr}</p>
          <p className="text-[8px] tracking-widest" style={{ color: jarvisColor + '70' }}>{dateStr}</p>
        </div>

        {/* Direita - controles */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            className="w-7 h-7 flex items-center justify-center rounded transition-all"
            style={{ border: `1px solid ${jarvisColor}30`, color: jarvisColor + '80' }}
          >
            <Settings size={13} />
          </button>
          {isConnected && (
            <button
              onClick={onDisconnect}
              className="w-7 h-7 flex items-center justify-center rounded transition-all"
              style={{ border: `1px solid #ff444430`, color: '#ff4444aa', backgroundColor: '#ff444410' }}
            >
              <PhoneOff size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ─────────────── MÉTRICAS ─────────────── */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-1.5 shrink-0" style={{ borderBottom: `1px solid ${jarvisColor}10` }}>
        {/* Status */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: isConnected ? (isSpeaking ? '#00ff88' : isListening ? '#00bfff' : '#00d4ff') : '#1e4d6b',
              boxShadow: isConnected ? `0 0 6px ${jarvisColor}` : 'none',
            }}
          />
          <StatusTicker items={tickerItems} color={jarvisColor} />
        </div>

        <div className="flex-1" />

        {/* CPU */}
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] uppercase tracking-widest" style={{ color: jarvisColor + '60' }}>CPU</span>
          <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: jarvisColor + '20' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${cpuPct}%`, background: jarvisColor }} />
          </div>
          <span className="text-[8px] font-mono" style={{ color: jarvisColor + '80' }}>{cpuPct}%</span>
        </div>

        {/* MEM */}
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] uppercase tracking-widest" style={{ color: jarvisColor + '60' }}>MEM</span>
          <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: jarvisColor + '20' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${memPct}%`, background: memPct > 80 ? '#ff6b6b' : jarvisColor }} />
          </div>
          <span className="text-[8px] font-mono" style={{ color: jarvisColor + '80' }}>{memPct}%</span>
        </div>
      </div>

      {/* ─────────────── ÁREA CENTRAL ─────────────── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">

        {/* ── Painel de voz (esquerda em desktop, cima em mobile) ── */}
        <div className="flex flex-col items-center justify-start shrink-0 p-3 gap-3"
          style={{
            width: 'clamp(100px, 18vw, 160px)',
            borderRight: `1px solid ${jarvisColor}12`,
          }}
        >
          {/* Orb central com arcos */}
          <button
            onClick={onOrbClick}
            className="relative flex items-center justify-center cursor-pointer select-none"
            style={{ width: 80, height: 80 }}
          >
            {/* Arcos animados */}
            <HudArc radius={36} strokeWidth={1.5} dashRatio={0.6} rotate={-30} color={jarvisColor} opacity={isConnected ? 0.7 : 0.2} animate={isConnected} speed={0.6} />
            <HudArc radius={30} strokeWidth={1} dashRatio={0.4} rotate={60} color={jarvisColor} opacity={isConnected ? 0.5 : 0.1} animate={isConnected} speed={-0.9} />
            <HudArc radius={24} strokeWidth={0.8} dashRatio={0.8} rotate={120} color={jarvisColor} opacity={isConnected ? 0.35 : 0.08} animate={isThinking} speed={1.4} />

            {/* Núcleo */}
            <div
              className="relative z-10 rounded-full flex items-center justify-center transition-all duration-500"
              style={{
                width: 40, height: 40,
                background: isConnected
                  ? `radial-gradient(circle, ${jarvisColor}40 0%, ${jarvisColor}15 60%, transparent 100%)`
                  : `radial-gradient(circle, ${jarvisColor}15 0%, transparent 100%)`,
                border: `1px solid ${jarvisColor}${isConnected ? '70' : '30'}`,
                boxShadow: isConnected ? `0 0 20px ${jarvisColor}40, inset 0 0 12px ${jarvisColor}20` : 'none',
              }}
            >
              {isConnected ? (
                isSpeaking ? (
                  <Volume2 size={14} style={{ color: jarvisColor }} />
                ) : isListening ? (
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Mic size={14} style={{ color: jarvisColor }} />
                  </motion.div>
                ) : (
                  <Shield size={14} style={{ color: jarvisColor + '90' }} />
                )
              ) : (
                <Zap size={14} style={{ color: jarvisColor + '50' }} />
              )}
            </div>
          </button>

          {/* Waveform */}
          <div className="w-full h-10" style={{ opacity: isConnected ? 1 : 0.3 }}>
            <WaveformCanvas
              isConnected={isConnected} isSpeaking={isSpeaking}
              isListening={isListening} isThinking={isThinking}
              volume={volume} color={jarvisColor}
            />
          </div>

          {/* Mic toggle */}
          {isConnected && (
            <button
              onClick={onMicToggle}
              className="flex items-center justify-center rounded transition-all"
              style={{
                width: 32, height: 32,
                border: `1px solid ${isMuted ? '#ff444450' : jarvisColor + '40'}`,
                background: isMuted ? '#ff44441a' : jarvisColor + '12',
                color: isMuted ? '#ff6666' : jarvisColor,
              }}
            >
              {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
          )}

          {/* Screen share button */}
          <button
            onClick={handleScreenToggle}
            className="flex items-center justify-center rounded transition-all"
            style={{
              width: 32, height: 32,
              border: `1px solid ${screenVisible ? '#00ff8850' : jarvisColor + '30'}`,
              background: screenVisible ? '#00ff8818' : jarvisColor + '0a',
              color: screenVisible ? '#00ff88' : jarvisColor + '80',
            }}
            title={screenVisible ? 'Parar compartilhamento' : 'Compartilhar tela com Jarvis'}
          >
            {screenVisible ? <MonitorOff size={13} /> : <Monitor size={13} />}
          </button>

          {/* Attach */}
          <button
            onClick={onFileClick}
            className="flex items-center justify-center rounded transition-all text-[9px] uppercase tracking-widest"
            style={{
              width: 32, height: 32,
              border: `1px solid ${jarvisColor}20`,
              color: jarvisColor + '60',
            }}
            title="Enviar imagem"
          >
            <Eye size={13} />
          </button>
        </div>

        {/* ── Painel central: mensagens + screen preview ── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Screen preview */}
          <AnimatePresence>
            {screenVisible && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'clamp(80px, 20vh, 180px)', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="relative shrink-0 overflow-hidden"
                style={{ borderBottom: `1px solid ${jarvisColor}20` }}
              >
                <HudCorner pos="tl" color={jarvisColor} />
                <HudCorner pos="tr" color={jarvisColor} />
                <HudCorner pos="bl" color={jarvisColor} />
                <HudCorner pos="br" color={jarvisColor} />

                <video
                  ref={videoRef}
                  autoPlay muted playsInline
                  className="w-full h-full object-contain"
                  style={{ background: '#000', opacity: 0.9 }}
                />
                <div
                  className="absolute top-2 left-4 text-[8px] font-mono uppercase tracking-widest flex items-center gap-1"
                  style={{ color: '#00ff88aa' }}
                >
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-green-400"
                    animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}
                  />
                  VISÃO ATIVA
                </div>
                <button
                  onClick={handleScreenToggle}
                  className="absolute top-2 right-2 rounded p-0.5 hover:bg-red-500/20 transition"
                  style={{ color: '#ff4444aa', border: '1px solid #ff444430' }}
                >
                  <EyeOff size={10} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mensagens */}
          <div
            ref={transcriptRef as React.RefObject<HTMLDivElement>}
            className="flex-1 overflow-y-auto px-3 py-3 flex flex-col-reverse gap-3"
            style={{ scrollbarWidth: 'thin', scrollbarColor: `${jarvisColor}30 transparent` }}
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 opacity-20">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <HudArc radius={22} strokeWidth={1} dashRatio={0.5} rotate={0} color={jarvisColor} opacity={0.5} animate speed={0.3} />
                  <Zap size={16} style={{ color: jarvisColor }} />
                </div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-center" style={{ color: jarvisColor }}>
                  {assistantName} ONLINE<br />AGUARDANDO COMANDO
                </p>
              </div>
            ) : (
              [...messages].reverse().map((msg, i) => (
                <JarvisMessage key={i} msg={msg} color={jarvisColor} name={assistantName} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ─────────────── INPUT ─────────────── */}
      <div
        className="relative z-10 shrink-0 px-3 py-2 pb-safe-bottom"
        style={{ borderTop: `1px solid ${jarvisColor}18` }}
      >
        {/* Decoração cantos */}
        <HudCorner pos="tl" color={jarvisColor} />
        <HudCorner pos="tr" color={jarvisColor} />

        <div className="flex items-center gap-2">
          {/* Indicador de modo */}
          <div
            className="shrink-0 w-1 h-6 rounded-full"
            style={{
              background: isConnected
                ? `linear-gradient(to bottom, ${jarvisColor}, ${jarvisColor}30)`
                : jarvisColor + '20',
              boxShadow: isConnected ? `0 0 8px ${jarvisColor}60` : 'none',
            }}
          />

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Digite um comando...' : `Conecte para falar com ${assistantName}...`}
            className="flex-1 bg-transparent text-sm text-white/70 placeholder-white/20 outline-none font-mono"
            style={{ letterSpacing: '0.02em' }}
          />

          {/* Botões de ação */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!isConnected ? (
              <motion.button
                onClick={onOrbClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono uppercase tracking-widest transition-all"
                style={{
                  border: `1px solid ${jarvisColor}50`,
                  background: `${jarvisColor}15`,
                  color: jarvisColor,
                }}
                whileTap={{ scale: 0.95 }}
                animate={{ boxShadow: [`0 0 0px ${jarvisColor}00`, `0 0 12px ${jarvisColor}40`, `0 0 0px ${jarvisColor}00`] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Zap size={11} />
                INICIAR
              </motion.button>
            ) : (
              <>
                {inputText && (
                  <motion.button
                    onClick={onSendText}
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="w-7 h-7 flex items-center justify-center rounded transition-all"
                    style={{ border: `1px solid ${jarvisColor}40`, background: `${jarvisColor}18`, color: jarvisColor }}
                  >
                    <Send size={12} />
                  </motion.button>
                )}
                <button
                  onClick={onMicToggle}
                  className="w-7 h-7 flex items-center justify-center rounded transition-all"
                  style={{
                    border: `1px solid ${isMuted ? '#ff444450' : jarvisColor + '40'}`,
                    background: isMuted ? '#ff44441a' : `${jarvisColor}18`,
                    color: isMuted ? '#ff6666' : jarvisColor,
                  }}
                >
                  {isMuted ? <MicOff size={12} /> : <Mic size={12} />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 mt-1 px-2">
          <span className="text-[8px] font-mono" style={{ color: jarvisColor + '40' }}>
            {isConnected ? `CONECTADO · ${statusLabel.toUpperCase()}` : 'DESCONECTADO · TOQUE EM INICIAR'}
          </span>
          {focusMode && (
            <span className="text-[8px] font-mono px-1.5 rounded" style={{ color: '#ff9f1c', border: '1px solid #ff9f1c40', background: '#ff9f1c10' }}>
              FOCO
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
