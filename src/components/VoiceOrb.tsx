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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    window.addEventListener('resize', resize);
    resize();

    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const effectiveVolume = isMuted ? 0 : volume;
      const targetPulse = (isSpeaking || (isListening && !isMuted) ? effectiveVolume * 80 : 0) + (isThinking ? Math.sin(time * 0.005) * 10 : 0);
      lerpPulse.current += (targetPulse - lerpPulse.current) * 0.15;
      
      const pulse = lerpPulse.current;
      
      const width = canvas.width;
      const height = canvas.height;
      
      // Draw multiple wave layers
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        const layerTime = time * 0.0008 * (i + 1) * 0.7;
        const amplitude = (20 + pulse * (i + 1) * 0.4) * (isConnected ? 1 : 0.2);
        const frequency = 0.006 + i * 0.003;
        
        // Purple -> Cyan -> Blue Gradient for the wave
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        if (isConnected) {
          gradient.addColorStop(0, '#6c34b6'); // Purple
          gradient.addColorStop(0.5, '#00d2ff'); // Cyan
          gradient.addColorStop(1, '#6c34b6'); // Purple
        } else {
          gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
          gradient.addColorStop(1, 'rgba(255,255,255,0.1)');
        }
        
        ctx.strokeStyle = gradient;
        
        if (isConnected && !isMuted) {
          // Add a shimmering glow effect
          ctx.shadowBlur = 20 + (pulse * 0.4);
          ctx.shadowColor = isSpeaking ? '#ffffff' : '#00d2ff';
        } else if (isMuted) {
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.2 / (i + 1)})`;
          ctx.shadowBlur = 0;
        }
        
        ctx.lineWidth = 1.2 + (i * 0.6);
        
        // Start from left
        ctx.moveTo(0, height / 2);
        
        for (let x = 0; x <= width; x += 2) {
          // Create a more complex organic wave with multiple sine/cosine components
          const edgeFactor = Math.sin((x / width) * Math.PI);
          
          const yOffset = Math.sin(x * frequency + layerTime) * amplitude * edgeFactor;
          const harmonic1 = Math.sin(x * frequency * 1.8 - layerTime * 1.5) * (amplitude * 0.5) * edgeFactor;
          const harmonic2 = Math.cos(x * frequency * 0.7 + layerTime * 1.1) * (amplitude * 0.3) * edgeFactor;
          const noise = Math.sin(x * 0.05 + time * 0.01) * 2 * edgeFactor;
          
          const y = height / 2 + yOffset + harmonic1 + harmonic2 + noise;
          ctx.lineTo(x, y);
        }
        
        ctx.stroke();
      }

      // Add a central shimmering glow
      ctx.shadowBlur = isConnected ? 50 + (pulse * 0.6) : 10;
      ctx.shadowColor = isConnected 
        ? (isSpeaking ? '#ffffff' : '#00d2ff')
        : 'rgba(255, 255, 255, 0.1)';

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [isSpeaking, isListening, isThinking, isConnected, isMuted, volume, moodColor]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
      />
      {/* Subtle overlay gradient to blend with the top edge */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />
    </div>
  );
};
