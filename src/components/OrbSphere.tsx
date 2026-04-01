// src/components/OrbSphere.tsx — Esfera 3D compartilhada entre layouts
import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

interface OrbSphereProps {
  moodColor: string;
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  volume: number;
  size?: number; // diâmetro da esfera em px (padrão 220)
  onClick?: () => void;
}

const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  angle: (i / 8) * 360,
  radius: 160,
  size: i % 3 === 0 ? 4 : 2.5,
  duration: 4 + i * 0.4,
  delay: i * 0.5,
}));

function DistortionWave({ moodColor, isConnected, isSpeaking, isListening, volume }: {
  moodColor: string; isConnected: boolean; isSpeaking: boolean; isListening: boolean; volume: number;
}) {
  const turbRef = useRef<SVGFETurbulenceElement | null>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const volumeRef  = useRef(volume);
  const speakRef   = useRef(isSpeaking);
  const listenRef  = useRef(isListening);
  const connRef    = useRef(isConnected);

  useEffect(() => { volumeRef.current  = volume;      }, [volume]);
  useEffect(() => { speakRef.current   = isSpeaking;  }, [isSpeaking]);
  useEffect(() => { listenRef.current  = isListening; }, [isListening]);
  useEffect(() => { connRef.current    = isConnected; }, [isConnected]);

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
        const conn = connRef.current;
        const speak = speakRef.current;
        const listen = listenRef.current;
        const scale = conn
          ? speak  ? (10 + v * 18).toFixed(1)
          : listen ? '6.0'
          :          '3.0'
          : '0.5';
        dispRef.current.setAttribute('scale', scale);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const id = `orb-distort-${moodColor.replace('#', '')}`;
  const ringCount = [0, 1, 2, 3];

  return (
    <>
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
        <defs>
          <filter id={id} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
            <feTurbulence ref={turbRef} type="turbulence" baseFrequency="0.010 0.013" numOctaves="3" seed="1" result="noise" />
            <feDisplacementMap ref={dispRef} in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <motion.div
        className="absolute pointer-events-none rounded-full"
        animate={{ opacity: isConnected ? 1 : 0 }}
        transition={{ duration: 0.8 }}
        style={{
          width: 320, height: 320,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle at 50% 50%, ${moodColor}05 0%, ${moodColor}02 50%, transparent 72%)`,
          filter: isConnected ? `url(#${id})` : 'none',
        }}
      />

      {ringCount.map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          animate={isConnected ? { scale: [1, 2.4], opacity: [isSpeaking ? 0.14 : 0.06, 0] } : { scale: 1, opacity: 0 }}
          transition={{
            duration: isSpeaking ? 2.4 : 3.6,
            repeat: Infinity,
            delay: i * (isSpeaking ? 0.6 : 0.9),
            ease: [0.2, 0, 0.6, 1],
          }}
          style={{ width: 240, height: 240, top: '50%', left: '50%', x: '-50%', y: '-50%', border: `1px solid ${moodColor}`, borderRadius: '50%' }}
        />
      ))}
    </>
  );
}

export function OrbSphere({ moodColor, isConnected, isSpeaking, isListening, isThinking, volume, size = 220, onClick }: OrbSphereProps) {
  const scale = isSpeaking ? 1 + volume * 0.08 : isListening ? 0.97 : isThinking ? 1.01 : 1;
  const glowIntensity = isConnected ? (isSpeaking ? 60 + volume * 40 : 40) : 20;

  const orb3DStyle = {
    width: size, height: size,
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
    <div
      className="relative flex items-center justify-center"
      style={{ width: size + 100, height: size + 100, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <DistortionWave moodColor={moodColor} isConnected={isConnected} isSpeaking={isSpeaking} isListening={isListening} volume={volume} />

      <motion.div
        className="absolute rounded-full"
        animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: size + 40, height: size + 40, border: `1px solid ${moodColor}40`, borderRadius: '50%' }}
      />

      {isConnected && (
        <>
          <motion.div
            className="absolute rounded-full border"
            animate={{ rotateZ: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            style={{ width: size + 20, height: size + 20, borderColor: `${moodColor}30`, transform: 'rotateX(70deg)' }}
          />
          <motion.div
            className="absolute rounded-full border"
            animate={{ rotateZ: -360 }}
            transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
            style={{ width: size + 40, height: size + 40, borderColor: `${moodColor}20`, transform: 'rotateX(60deg) rotateZ(45deg)' }}
          />
        </>
      )}

      {isSpeaking && PARTICLES.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, backgroundColor: moodColor }}
          animate={{
            x: [Math.cos((p.angle * Math.PI) / 180) * p.radius, Math.cos(((p.angle + 360) * Math.PI) / 180) * p.radius],
            y: [Math.sin((p.angle * Math.PI) / 180) * (p.radius * 0.4), Math.sin(((p.angle + 360) * Math.PI) / 180) * (p.radius * 0.4)],
            opacity: [0.8, 0.4, 0.8],
          }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'linear' }}
        />
      ))}

      <motion.div
        animate={{ scale, rotateY: isConnected ? [0, 2, 0, -2, 0] : 0 }}
        transition={{ scale: { type: 'spring', stiffness: 200, damping: 20 }, rotateY: { duration: 8, repeat: Infinity, ease: 'easeInOut' } }}
        style={orb3DStyle}
      />

      {isThinking && (
        <motion.div
          className="absolute rounded-full border-t-2"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          style={{ width: size + 20, height: size + 20, borderColor: `${moodColor}60` }}
        />
      )}
    </div>
  );
}
