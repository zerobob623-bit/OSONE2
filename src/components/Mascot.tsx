import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
// Store global que gerencia as intenções da IA (alvo do clique, ações, visibilidade)
import { useAppStore } from '../store/useAppStore';

interface MascotProps {
  onToggleVoice?: () => void;
}

export const Mascot: React.FC<MascotProps> = ({ onToggleVoice }) => {
  // Extração de estados globais controlados pela IA
  const { 
    isMascotVisible, 
    mascotTarget, 
    setMascotTarget, 
    mascotAction, 
    setMascotAction, 
    mascotAppearance 
  } = useAppStore();

  // Estados locais para controle de animação e UI
  const [position, setPosition] = useState({ x: window.innerWidth - 100, y: window.innerHeight - 100 });
  const [isPointing, setIsPointing] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState(""); 
  
  const mascotRef = useRef<HTMLDivElement>(null);

  // Efeito que escuta o estado da IA (mascotAction) e atualiza o balão de mensagem
  useEffect(() => {
    switch (mascotAction) {
      case 'thinking':
        setMessage("🤔 Pensando...");
        break;
      case 'searching':
        setMessage("🔎 Pesquisando...");
        break;
      case 'speaking':
        setMessage("💬 Respondendo...");
        break;
      case 'idle':
        // Limpa a mensagem com um pequeno atraso para transição suave
        const t = setTimeout(() => setMessage(""), 1500);
        return () => clearTimeout(t);
    }
  }, [mascotAction]);

  // Interação manual do usuário com o mascote
  const handleMascotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleVoice) {
      onToggleVoice();
      playClickSound();
    }
  };

  // Sintetizador de áudio nativo para feedback tátil sonoro (evita dependência de arquivos mp3)
  const playClickSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.error('Erro ao reproduzir som de clique:', e);
    }
  };

  // Núcleo do controle da IA sobre o "mouse" e interface
  useEffect(() => {
    if (mascotTarget) {
      let targetX = 0;
      let targetY = 0;

      // Resolução do alvo: A IA pode enviar coordenadas diretas ou o ID de um elemento DOM
      if (mascotTarget.startsWith('x:')) {
        const coords = mascotTarget.split(',');
        targetX = parseInt(coords[0].split(':')[1]);
        targetY = parseInt(coords[1].split(':')[1]);
      } else {
        const targetElement = document.getElementById(mascotTarget);
        if (targetElement) {
          const rect = targetElement.getBoundingClientRect();
          // Calcula o centro exato do elemento alvo
          targetX = rect.left + rect.width / 2;
          targetY = rect.top + rect.height / 2;
        }
      }

      if (targetX || targetY) {
        // Inicia o deslocamento visual do mascote até o alvo
        setIsRunning(true);
        setIsPointing(false);
        setIsClicking(false);
        setPosition({ x: targetX, y: targetY + 40 }); // Offset para não cobrir o elemento
        
        // Timeout para simular o tempo de viagem do mascote até o elemento
        const timer = setTimeout(() => {
          setIsRunning(false);
          
          if (mascotAction === 'clicking') {
            setIsClicking(true);
            playClickSound();
            
            // Disparo de evento real no DOM guiado pela IA
            setTimeout(() => {
              try {
                if (mascotTarget.startsWith('x:')) {
                  // Clique via coordenadas
                  const coords = mascotTarget.split(',');
                  const x = parseInt(coords[0].split(':')[1]);
                  const y = parseInt(coords[1].split(':')[1]);
                  const el = document.elementFromPoint(x, y);
                  if (el instanceof HTMLElement) {
                    el.click(); // Executa o clique real na página
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.focus();
                  }
                } else {
                  // Clique via ID do elemento
                  const el = document.getElementById(mascotTarget);
                  if (el) {
                    el.click(); // Executa o clique real na página
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.focus();
                  }
                }
              } catch (e) {
                console.error('Erro ao disparar clique real:', e);
              }
            }, 100);

            // Reseta a ação e faz o mascote voltar à posição de repouso (canto inferior direito)
            setTimeout(() => {
              setIsClicking(false);
              setMascotAction('idle');
              setMascotTarget(null);
              setTimeout(() => {
                setPosition({ x: window.innerWidth - 100, y: window.innerHeight - 100 });
              }, 1000);
            }, 500);

          } else {
            // Se a IA apenas quer apontar, e não clicar
            setIsPointing(true);
            setTimeout(() => {
              setIsPointing(false);
              setMascotTarget(null);
              setTimeout(() => {
                setPosition({ x: window.innerWidth - 100, y: window.innerHeight - 100 });
              }, 2000);
            }, 3000);
          }
        }, 1000); // Fim do timer de "viagem"
        
        return () => clearTimeout(timer);
      }
    }
  }, [mascotTarget, mascotAction, setMascotTarget, setMascotAction]);

  if (!isMascotVisible) return null;

  // Ajusta o tamanho (escala) do mascote dependendo da ação atual da IA
  const getScaleForAction = () => {
    if (isPointing) return 1.2;
    if (isClicking) return 0.8; // Contrai ao clicar
    if (mascotAction === 'thinking') return 1.05;
    if (mascotAction === 'searching') return 1.1;
    if (mascotAction === 'speaking') return 1.15;
    return 1;
  };

  // Renderização dinâmica dos "olhos" do mascote para expressar estados da IA
  const renderEyes = () => {
    const eyeColor = mascotAppearance.secondaryColor;

    if (mascotAction === 'thinking') {
      return (
        <div className="flex gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: eyeColor }} />
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: eyeColor, animationDelay: '0.3s' }} />
        </div>
      );
    }

    if (mascotAction === 'searching') {
      return (
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full border-2 animate-spin" style={{ borderColor: eyeColor, borderTopColor: 'transparent' }} />
          <div className="w-2 h-2 rounded-full border-2 animate-spin" style={{ borderColor: eyeColor, borderTopColor: 'transparent', animationDelay: '0.15s' }} />
        </div>
      );
    }

    if (mascotAction === 'speaking') {
      return (
        <div className="flex gap-1.5">
          <div className="w-1.5 h-1.5 border-t-2 rounded-t-full" style={{ borderColor: eyeColor }} />
          <div className="w-1.5 h-1.5 border-t-2 rounded-t-full" style={{ borderColor: eyeColor }} />
        </div>
      );
    }

    // Estilos base de olhos customizáveis
    switch (mascotAppearance.eyeStyle) {
      case 'happy':
        return (
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 border-t-2 rounded-t-full" style={{ borderColor: eyeColor }} />
            <div className="w-1.5 h-1.5 border-t-2 rounded-t-full" style={{ borderColor: eyeColor }} />
          </div>
        );
      case 'cool':
        return (
          <div className="flex gap-1.5">
            <div className="w-2 h-1 rounded-sm" style={{ backgroundColor: eyeColor }} />
            <div className="w-2 h-1 rounded-sm" style={{ backgroundColor: eyeColor }} />
          </div>
        );
      case 'wink':
        return (
          <div className="flex gap-1.5 items-center">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: eyeColor }} />
            <div className="w-1.5 h-0.5 rounded-full" style={{ backgroundColor: eyeColor }} />
          </div>
        );
      case 'heart':
        return (
          <div className="flex gap-0.5">
            <span className="text-[8px]" style={{ color: eyeColor }}>❤️</span>
            <span className="text-[8px]" style={{ color: eyeColor }}>❤️</span>
          </div>
        );
      default:
        return (
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: eyeColor }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: eyeColor, animationDelay: '0.1s' }} />
          </div>
        );
    }
  };

  return (
    <motion.div
      ref={mascotRef}
      // Fisica de movimentação natural (efeito mola / spring)
      initial={{ opacity: 0, scale: 0, y: 100 }}
      animate={{ 
        opacity: isMascotVisible ? 1 : 0,
        scale: isMascotVisible ? getScaleForAction() : 0,
        x: position.x - 20, 
        // Adiciona um pequeno efeito de flutuação (seno) apenas quando o mascote está parado
        y: position.y - 20 + (isRunning ? 0 : Math.sin(Date.now() / 500) * 5),
        // Efeito de "sacudir" enquanto corre ou clica
        rotate: isRunning ? [0, -10, 10, 0] : isClicking ? [0, 15, -15, 0] : 0
      }}
      transition={{ 
        type: "spring", 
        stiffness: 100, 
        damping: 20,
        y: { duration: 2, repeat: Infinity, ease: "easeInOut" },
        rotate: { repeat: Infinity, duration: 0.2 }
      }}
      className="fixed z-[9999] pointer-events-auto cursor-pointer"
      style={{ left: 0, top: 0 }}
      onClick={handleMascotClick}
    >
      <div className="relative group">
        {/* Corpo principal do Mascote */}
        <div 
          className="w-10 h-10 rounded-full shadow-lg flex items-center justify-center border-2 border-white/20"
          style={{ 
            backgroundColor: mascotAppearance.primaryColor,
            boxShadow: `0 4px 12px ${mascotAppearance.primaryColor}66`
          }}
        >
          {renderEyes()}
          
          {/* Braços / Indicadores (usados para apontar visualmente) */}
          <motion.div 
            animate={isPointing ? { rotate: -45, scale: 1.5 } : { rotate: 0 }}
            className="absolute -top-2 right-0 w-4 h-1 rounded-full origin-left"
            style={{ backgroundColor: mascotAppearance.secondaryColor }}
          />
          <motion.div 
            animate={isPointing ? { rotate: 45, scale: 1.5 } : { rotate: 0 }}
            className="absolute -top-2 left-0 w-4 h-1 rounded-full origin-right"
            style={{ backgroundColor: mascotAppearance.secondaryColor }}
          />
        </div>
        
        {/* Balão de mensagem (feedback textual da IA) */}
        <AnimatePresence>
          {message && !isPointing && !isClicking && (
            <motion.div
              key={message}
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-xl"
            >
              {message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Efeitos Visuais (Apontando e Clicando) */}
        <AnimatePresence>
          {isPointing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-xl"
            >
              AQUI! ✨
            </motion.div>
          )}
          
          {isClicking && (
            <>
              {/* Efeito de Ondulação (Ripple) ao clicar em um elemento */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 2 }}
                exit={{ opacity: 0, scale: 3 }}
                transition={{ duration: 0.4 }}
                className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 border-2 rounded-full"
                style={{ borderColor: mascotAppearance.primaryColor }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: 0.5, scale: 1.5 }}
                exit={{ opacity: 0, scale: 2.5 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full"
                style={{ backgroundColor: `${mascotAppearance.primaryColor}4D` }}
              />
              {/* Partículas de "fagulha" emitidas no momento do clique guiado pela IA */}
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
                  animate={{ 
                    opacity: 0, 
                    scale: 1, 
                    x: (Math.random() - 0.5) * 60, 
                    y: (Math.random() - 0.5) * 60 - 20
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="absolute top-0 left-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: mascotAppearance.primaryColor }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
