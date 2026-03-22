import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

interface VoiceOrbProps {
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  isConnected: boolean;
  isMuted?: boolean;
  volume: number;
  moodColor?: string;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({ isSpeaking, isListening, isThinking, isConnected, isMuted, volume, moodColor }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lerpPulse = useRef(0);
  const lerpRadius = useRef(100);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      const targetRadius = isConnected ? 110 : 80;
      lerpRadius.current += (targetRadius - lerpRadius.current) * 0.1;
      
      const effectiveVolume = isMuted ? 0 : volume;
      const targetPulse = (isSpeaking || (isListening && !isMuted) ? effectiveVolume * 120 : 0) + (isThinking ? Math.sin(time * 0.01) * 15 : 0);
      lerpPulse.current += (targetPulse - lerpPulse.current) * 0.15;
      
      const pulse = lerpPulse.current;
      const baseRadius = lerpRadius.current;
      
      // Draw multiple layers for a "Her" style glow
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const layerTime = time * 0.0008 * (i + 1) * 0.4;
        const radius = baseRadius + pulse * (i + 1) * 0.35;
        const opacity = (isConnected ? 0.3 : 0.1) / (i + 1);
        
        if (!isConnected) {
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.1})`;
        } else if (isMuted && !isSpeaking && !isThinking) {
          ctx.fillStyle = `rgba(239, 68, 68, ${opacity * 0.6})`;
        } else {
          ctx.fillStyle = isSpeaking 
            ? `rgba(255, 107, 107, ${opacity})` 
            : isListening 
              ? (moodColor ? `${moodColor}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}` : `rgba(254, 202, 87, ${opacity})`)
              : isThinking
                ? `rgba(167, 139, 250, ${opacity})`
                : `rgba(255, 255, 255, ${opacity * 0.3})`;
        }
            
        for (let angle = 0; angle < Math.PI * 2; angle += 0.03) {
          const xOffset = Math.cos(angle + layerTime) * (pulse * 0.4);
          const yOffset = Math.sin(angle * 2 + layerTime) * (pulse * 0.4);
          
          const harmonic1 = Math.sin(angle * 3 + layerTime * 2.5) * (pulse * 0.2);
          const harmonic2 = Math.sin(angle * 8 - layerTime) * (pulse * 0.15);
          
          const r = radius + harmonic1 + harmonic2;
          const x = centerX + Math.cos(angle) * r + xOffset;
          const y = centerY + Math.sin(angle) * r + yOffset;
          
          if (angle === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        ctx.fill();
      }

      // Core orb with inner glow
      ctx.beginPath();
      const coreRadius = baseRadius * 0.85;
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius);
      
      if (!isConnected) {
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
      } else if (isMuted && !isSpeaking && !isThinking) {
        gradient.addColorStop(0, '#fca5a5');
        gradient.addColorStop(0.5, '#ef4444');
        gradient.addColorStop(1, '#b91c1c');
      } else if (isSpeaking) {
        gradient.addColorStop(0, '#ff9f9f');
        gradient.addColorStop(0.5, '#ff6b6b');
        gradient.addColorStop(1, '#ee5253');
      } else if (isListening) {
        if (moodColor) {
          gradient.addColorStop(0, '#ffffff');
          gradient.addColorStop(0.5, moodColor);
          gradient.addColorStop(1, moodColor);
        } else {
          gradient.addColorStop(0, '#ffeaa7');
          gradient.addColorStop(0.5, '#feca57');
          gradient.addColorStop(1, '#ff9f43');
        }
      } else if (isThinking) {
        gradient.addColorStop(0, '#c4b5fd');
        gradient.addColorStop(0.5, '#a78bfa');
        gradient.addColorStop(1, '#8b5cf6');
      } else {
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.5, '#f5f5f5');
        gradient.addColorStop(1, '#dcdde1');
      }
      
      ctx.fillStyle = gradient;
      ctx.shadowBlur = isConnected ? 50 : 20;
      ctx.shadowColor = !isConnected ? 'rgba(255, 255, 255, 0.05)' : isMuted && !isSpeaking && !isThinking 
        ? 'rgba(239, 68, 68, 0.5)' 
        : isSpeaking ? 'rgba(255, 107, 107, 0.5)' 
        : isListening ? (moodColor || 'rgba(254, 202, 87, 0.5)') 
        : isThinking ? 'rgba(167, 139, 250, 0.5)' 
        : 'rgba(255, 255, 255, 0.2)';
      ctx.fill();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSpeaking, isListening, isThinking, isConnected, isMuted, volume, moodColor]);

  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      <canvas 
        ref={canvasRef} 
        width={400} 
        height={400} 
        className="w-full h-full"
      />
      <motion.div
        animate={{
          scale: isSpeaking || isListening || isThinking ? [1, 1.05, 1] : 1,
          rotate: isThinking ? 360 : 0
        }}
        transition={{
          duration: isThinking ? 4 : 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute inset-0 rounded-full bg-transparent border border-white/10"
      />
    </div>
  );
};
