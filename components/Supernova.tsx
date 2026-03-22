import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SupernovaProps {
  onComplete: () => void;
}

export const Supernova: React.FC<SupernovaProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'spinning' | 'imploding' | 'pulsing' | 'exploding'>('spinning');

  useEffect(() => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playSuspense = () => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(100, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 3);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 3);
    };

    const playExplosion = () => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 1);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 1);
    };

    const sequence = async () => {
      // Spinning phase
      playSuspense();
      await new Promise(resolve => setTimeout(resolve, 3000));
      setPhase('imploding');
      
      // Imploding phase
      await new Promise(resolve => setTimeout(resolve, 1500));
      setPhase('pulsing');
      
      // Pulsing phase
      await new Promise(resolve => setTimeout(resolve, 2000));
      setPhase('exploding');
      playExplosion();
      
      // Exploding phase
      await new Promise(resolve => setTimeout(resolve, 3000));
      onComplete();
    };
    
    sequence();

    return () => {
      audioCtx.close();
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden">
      {/* Background Atmosphere */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'spinning' ? 0.3 : 0.6 }}
        className="absolute inset-0 atmosphere"
        style={{
          background: `radial-gradient(circle at 50% 50%, #3a1510 0%, transparent 70%)`,
          filter: 'blur(100px)'
        }}
      />

      <AnimatePresence mode="wait">
        {phase === 'spinning' && (
          <motion.div
            key="spinning"
            initial={{ scale: 0, rotate: 0, opacity: 0 }}
            animate={{ scale: 1, rotate: 1080, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0, filter: 'blur(20px)' }}
            transition={{ duration: 3, ease: "easeInOut" }}
            className="relative w-72 h-72 flex items-center justify-center"
          >
            <div className="absolute inset-0 border-[1px] border-dashed border-emerald-500/30 rounded-full animate-spin-slow" />
            <div className="absolute inset-8 border-[1px] border-dashed border-blue-500/30 rounded-full animate-spin" style={{ animationDirection: 'reverse' }} />
            <div className="absolute inset-16 border-[1px] border-dashed border-[#ff6b6b]/30 rounded-full animate-spin-slow" />
            
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-12 h-12 bg-white rounded-full shadow-[0_0_50px_#fff] relative z-10"
            />
            
            {/* Orbiting particles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ rotate: 360 }}
                transition={{ duration: 2 + i * 0.5, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0"
              >
                <div 
                  className="w-2 h-2 bg-white rounded-full blur-[1px]" 
                  style={{ 
                    marginTop: `${20 + i * 10}%`,
                    opacity: 0.2 + (i * 0.1)
                  }} 
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {phase === 'imploding' && (
          <motion.div
            key="imploding"
            initial={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            animate={{ scale: 0.05, opacity: 1, filter: 'blur(10px)' }}
            transition={{ duration: 1.5, ease: [0.7, 0, 0.3, 1] }}
            className="w-80 h-80 bg-white rounded-full shadow-[0_0_100px_#fff]"
          />
        )}

        {phase === 'pulsing' && (
          <motion.div
            key="pulsing"
            initial={{ scale: 0.05 }}
            animate={{ 
              scale: [0.05, 0.4, 0.1, 0.6, 0.2, 0.8, 0.1],
              opacity: [1, 0.8, 1, 0.6, 1, 0.4, 1]
            }}
            transition={{ duration: 2, ease: "easeInOut" }}
            className="w-96 h-96 bg-white rounded-full blur-3xl shadow-[0_0_150px_#fff]"
          />
        )}

        {phase === 'exploding' && (
          <motion.div
            key="exploding"
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 100, opacity: 0 }}
            transition={{ duration: 2.5, ease: "circOut" }}
            className="fixed inset-0 bg-white rounded-full blur-3xl"
          />
        )}
      </AnimatePresence>
      
      {/* Status Text */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-20 flex flex-col items-center gap-2"
      >
        <div className="text-white/40 text-[10px] uppercase tracking-[0.8em] font-light">
          {phase === 'spinning' ? 'Sincronizando Núcleo' : phase === 'imploding' ? 'Colapso Gravitacional' : phase === 'pulsing' ? 'Ignição Estelar' : 'Nascimento'}
        </div>
        <div className="w-48 h-[1px] bg-white/10 relative overflow-hidden">
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        </div>
      </motion.div>
    </div>
  );
};
