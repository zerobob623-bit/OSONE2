// NeuralLayout.tsx — IA Biológica Artificial
// Rede neural com neurônios bioluminescentes, sinapses e propagação de sinais elétricos.
// Canvas animado via requestAnimationFrame, totalmente responsivo ao estado de voz.

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, PhoneOff, Send, Settings, Paperclip, Monitor, Volume1, Copy, Check } from 'lucide-react';
import type { MainLayoutProps } from '../../types/layout';

// ─── Tipos internos do canvas ────────────────────────────────────────────────
interface Neuron {
  x: number;           // posição atual px
  y: number;
  baseX: number;       // posição base para flutuação orgânica
  baseY: number;
  r: number;           // raio 3-7
  charge: number;      // 0-1, ativação atual
  refractoryTimer: number; // frames até poder disparar novamente
  cluster: number;     // 0-4 região cerebral
}

interface Signal {
  from: number;
  to: number;
  t: number;           // progresso 0→1
  speed: number;
  color: string;
  intensity: number;
}

interface Connection {
  a: number;
  b: number;
  cpx: number;         // control point x da bézier
  cpy: number;
}

// ─── Thought Tree types ───────────────────────────────────────────────────────
interface TNode {
  id: number;
  x: number;
  y: number;
  parentId: number | null;
  label: string;
  depth: number;
  born: number;       // frame offset at which this node starts appearing
  progress: number;   // 0→1 draw animation
}

interface TSignal {
  edgeIdx: number;    // index into edges array
  t: number;          // 0→1 progress along edge (always positive)
  dir: number;        // +1 = parent→child, −1 = child→parent
  color: string;
  speed: number;
}

const TREE_DEPTH_COLORS = ['#00D4FF', '#6B5FFF', '#FF6B9D', '#00FFAA'] as const;
const TREE_PHASE_COLORS = ['#6B5FFF', '#FF6B9D', '#00FFAA'] as const;

// ─── Thought tree builder ─────────────────────────────────────────────────────
const TREE_DEF = {
  label: 'Raiz',
  children: [
    { label: 'Análise', children: [
      { label: 'Dados',    children: [{ label: '●' }, { label: '◦' }] },
      { label: 'Fatos',    children: [{ label: '●' }] },
    ]},
    { label: 'Contexto', children: [
      { label: 'Fontes',   children: [{ label: '◦' }, { label: '●' }] },
      { label: 'Padrões',  children: [{ label: '●' }] },
    ]},
    { label: 'Hipóteses', children: [
      { label: 'Causas',   children: [{ label: '●' }, { label: '◦' }] },
      { label: 'Opções',   children: [{ label: '●' }] },
    ]},
  ],
};

function countLeaves(def: any): number {
  if (!def.children || def.children.length === 0) return 1;
  return def.children.reduce((s: number, c: any) => s + countLeaves(c), 0);
}

function buildThoughtTree(W: number, H: number): { nodes: TNode[]; edges: [number, number][] } {
  const nodes: TNode[] = [];
  const edges: [number, number][] = [];
  let id = 0;
  let born = 0;

  // usable vertical strip: between transcript area and metacog indicator
  const yTop = H * 0.285;
  const yBot = H - 180;
  const levels = 4;
  const levelH = (yBot - yTop) / (levels - 1);

  function build(def: any, parentId: number | null, depth: number, xL: number, xR: number) {
    const x = (xL + xR) / 2;
    const y = yTop + depth * levelH;
    const nodeId = id++;
    born += 5;
    nodes.push({ id: nodeId, x, y, parentId, label: def.label, depth, born, progress: 0 });
    if (parentId !== null) edges.push([parentId, nodeId]);
    if (def.children && def.children.length > 0) {
      const total = def.children.reduce((s: number, c: any) => s + countLeaves(c), 0);
      let cur = xL;
      for (const child of def.children) {
        const w = (xR - xL) * countLeaves(child) / total;
        build(child, nodeId, depth + 1, cur, cur + w);
        cur += w;
      }
    }
  }

  build(TREE_DEF, null, 0, W * 0.06, W * 0.94);
  return { nodes, edges };
}

// ─── Thought Tree Canvas ──────────────────────────────────────────────────────
function ThoughtTreeCanvas({ isThinking }: { isThinking: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isThinkingRef = useRef(isThinking);
  useEffect(() => { isThinkingRef.current = isThinking; }, [isThinking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    let treeData = buildThoughtTree(W, H);
    let signals: TSignal[] = [];
    let raf: number;
    let treeTime = 0;
    let globalFade = 0;
    let wasThinking = false;

    const nodeById = (i: number) => treeData.nodes.find(n => n.id === i)!;

    const frame = () => {
      const thk = isThinkingRef.current;

      // Detect transition into thinking → rebuild tree from scratch
      if (thk && !wasThinking) {
        treeData = buildThoughtTree(W, H);
        signals = [];
        treeTime = 0;
      }
      wasThinking = thk;

      if (thk) {
        treeTime++;
        globalFade = Math.min(1, globalFade + 0.05);
      } else {
        globalFade = Math.max(0, globalFade - 0.03);
      }

      ctx.clearRect(0, 0, W, H);

      if (globalFade < 0.01) { raf = requestAnimationFrame(frame); return; }

      ctx.save();
      ctx.globalAlpha = globalFade;

      const metaPhase = Math.floor(treeTime / 70) % 3;
      const phaseCol  = TREE_PHASE_COLORS[metaPhase];
      const { nodes, edges } = treeData;

      // ── Advance node progress ──
      for (const n of nodes) {
        if (thk && treeTime >= n.born) n.progress = Math.min(1, n.progress + 0.05);
        else if (!thk)                 n.progress = Math.max(0, n.progress - 0.04);
      }

      // ── Emit signals ──
      if (thk && signals.length < 7 && edges.length > 0 && Math.random() < 0.14) {
        const ei = Math.floor(Math.random() * edges.length);
        const fn = nodeById(edges[ei][0]);
        const tn = nodeById(edges[ei][1]);
        if (fn.progress > 0.5 && tn.progress > 0.5) {
          // Phase drives direction: 0=planning→outward, 2=evaluating→inward, 1=monitoring→both
          const dir = metaPhase === 0 ? 1 : metaPhase === 2 ? -1 : (Math.random() < 0.5 ? 1 : -1);
          const t   = dir === 1 ? 0 : 1;
          signals.push({ edgeIdx: ei, t, dir, color: phaseCol, speed: 0.014 + Math.random() * 0.009 });
        }
      }

      // ── Draw edges ──
      for (let ei = 0; ei < edges.length; ei++) {
        const fn = nodeById(edges[ei][0]);
        const tn = nodeById(edges[ei][1]);
        const ea = Math.min(fn.progress, tn.progress);
        if (ea < 0.01) continue;
        const cpx = (fn.x + tn.x) / 2 + (tn.y - fn.y) * 0.09;
        const cpy = (fn.y + tn.y) / 2;
        ctx.beginPath();
        ctx.moveTo(fn.x, fn.y);
        ctx.quadraticCurveTo(cpx, cpy, tn.x, tn.y);
        ctx.strokeStyle = `rgba(0,170,220,${ea * 0.38})`;
        ctx.lineWidth = 0.85;
        ctx.stroke();
      }

      // ── Draw signals ──
      for (let si = signals.length - 1; si >= 0; si--) {
        const s = signals[si];
        const [fromId, toId] = edges[s.edgeIdx];
        const fn = nodeById(s.dir ===  1 ? fromId : toId);
        const tn = nodeById(s.dir ===  1 ? toId   : fromId);
        const t  = s.t;
        const cpx = (fn.x + tn.x) / 2 + (tn.y - fn.y) * 0.09;
        const cpy = (fn.y + tn.y) / 2;
        const pt  = bezierPoint(t, fn.x, fn.y, cpx, cpy, tn.x, tn.y);

        const gr = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 6);
        gr.addColorStop(0, s.color + 'CC');
        gr.addColorStop(1, s.color + '00');
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();

        s.t += s.speed;
        if (s.t >= 1 || s.t < 0) signals.splice(si, 1);
      }

      // ── Draw nodes ──
      for (const n of nodes) {
        if (n.progress < 0.01) continue;
        const col   = TREE_DEPTH_COLORS[Math.min(n.depth, 3)];
        const baseR = Math.max(2, 7 - n.depth * 1.6);
        const pulse = thk ? Math.sin(treeTime * 0.07 + n.id * 0.9) * 1.2 : 0;
        const r     = baseR * n.progress;

        // Phase-color outer ring (non-leaf nodes only)
        if (thk && n.depth <= 2 && n.progress > 0.8) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + pulse + 4, 0, Math.PI * 2);
          ctx.strokeStyle = phaseCol + '3A';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Glow halo
        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
        grd.addColorStop(0, col + Math.round(n.progress * 0.28 * 255).toString(16).padStart(2, '0'));
        grd.addColorStop(1, col + '00');
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col + Math.round(n.progress * 0.88 * 255).toString(16).padStart(2, '0');
        ctx.fill();

        // Label (depth 0-2 only, once mostly visible)
        if (n.depth <= 2 && n.progress > 0.65) {
          const fs = Math.max(6, 9 - n.depth * 1.2);
          ctx.font = `${fs.toFixed(1)}px monospace`;
          ctx.fillStyle = `rgba(195,235,255,${n.progress * 0.75})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(n.label, n.x, n.y + r + 3);
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}

// ─── Bezier quadrática ────────────────────────────────────────────────────────
function bezierPoint(t: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
}

// ─── Geração determinística dos neurônios ─────────────────────────────────────
// Clusters: [cx%, cy%, count, spreadPx]
const CLUSTER_DEFS: [number, number, number, number][] = [
  [0.30, 0.22, 14, 85],  // 0 — Córtex pré-frontal (topo-esq)
  [0.52, 0.18, 12, 75],  // 1 — Área motora (topo-centro)
  [0.72, 0.42, 10, 70],  // 2 — Lobo temporal (direita)
  [0.28, 0.46, 10, 70],  // 3 — Lobo parietal (esquerda)
  [0.50, 0.56,  14, 90], // 4 — Estruturas profundas (centro)
];

function buildNeurons(W: number, H: number): Neuron[] {
  const neurons: Neuron[] = [];
  let seed = 42;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };
  const randN = () => {
    // Box-Muller para distribuição normal
    const u = rand() || 1e-10;
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  for (let c = 0; c < CLUSTER_DEFS.length; c++) {
    const [cx, cy, count, spread] = CLUSTER_DEFS[c];
    for (let i = 0; i < count; i++) {
      const bx = cx * W + randN() * spread;
      const by = cy * H + randN() * spread;
      neurons.push({
        x: bx, y: by, baseX: bx, baseY: by,
        r: 3 + rand() * 4,
        charge: 0,
        refractoryTimer: 0,
        cluster: c,
      });
    }
  }
  return neurons;
}

function buildConnections(neurons: Neuron[]): Connection[] {
  const RADIUS = 155;
  const MAX_PER_NEURON = 4;
  const counts = new Array(neurons.length).fill(0);
  const seen = new Set<string>();
  const conns: Connection[] = [];

  // Para cada neurônio, encontra os vizinhos mais próximos
  for (let i = 0; i < neurons.length; i++) {
    if (counts[i] >= MAX_PER_NEURON) continue;
    const dists: [number, number][] = [];
    for (let j = i + 1; j < neurons.length; j++) {
      const dx = neurons[i].baseX - neurons[j].baseX;
      const dy = neurons[i].baseY - neurons[j].baseY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < RADIUS) dists.push([d, j]);
    }
    dists.sort((a, b) => a[0] - b[0]);
    for (const [, j] of dists) {
      if (counts[i] >= MAX_PER_NEURON || counts[j] >= MAX_PER_NEURON) continue;
      const key = `${i}-${j}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[i]++;
      counts[j]++;
      // Control point perpendicular ao segmento para curva orgânica
      const mx = (neurons[i].baseX + neurons[j].baseX) / 2;
      const my = (neurons[i].baseY + neurons[j].baseY) / 2;
      const dx = neurons[j].baseX - neurons[i].baseX;
      const dy = neurons[j].baseY - neurons[i].baseY;
      const perp = Math.sqrt(dx * dx + dy * dy) * 0.18;
      conns.push({
        a: i, b: j,
        cpx: mx + (-dy / Math.sqrt(dx * dx + dy * dy + 1e-9)) * perp,
        cpy: my + (dx  / Math.sqrt(dx * dx + dy * dy + 1e-9)) * perp,
      });
    }
  }
  return conns;
}

// ─── Cores por estado de voz ──────────────────────────────────────────────────
function stateColor(isSpeaking: boolean, isListening: boolean, isThinking: boolean): string {
  if (isSpeaking)  return '#00D4FF';
  if (isThinking)  return '#8B3FFF';
  if (isListening) return '#00C8FF';
  return '#0088BB';
}

function firingRate(isSpeaking: boolean, isListening: boolean, isThinking: boolean, volume: number): number {
  if (isSpeaking)  return 0.075 + volume * 0.06;
  if (isThinking)  return 0.050;
  if (isListening) return 0.032;
  return 0.012;
}

function signalSpeed(isSpeaking: boolean, isListening: boolean, isThinking: boolean): number {
  if (isSpeaking)  return 0.018;
  if (isThinking)  return 0.013;
  if (isListening) return 0.011;
  return 0.007;
}

// ─── Canvas Component ─────────────────────────────────────────────────────────
function NeuralCanvas({
  isConnected, isSpeaking, isListening, isThinking, volume,
}: {
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  volume: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs para props sem recriar o loop
  const stateRef = useRef({ isConnected, isSpeaking, isListening, isThinking, volume });
  useEffect(() => {
    stateRef.current = { isConnected, isSpeaking, isListening, isThinking, volume };
  }, [isConnected, isSpeaking, isListening, isThinking, volume]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;

    const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    ctx.scale(dpr, dpr);

    // Build static structures
    const neurons   = buildNeurons(W, H);
    const conns     = buildConnections(neurons);
    const signals: Signal[] = [];

    // Mapa de conexões por neurônio (para cascata)
    const connsByNeuron: number[][] = neurons.map(() => []);
    for (let ci = 0; ci < conns.length; ci++) {
      connsByNeuron[conns[ci].a].push(ci);
      connsByNeuron[conns[ci].b].push(ci);
    }

    let time = 0;
    let raf: number;

    const emitSignal = (from: number, to: number, col: string, spd: number, intens: number) => {
      if (signals.length >= 25) return;
      // Evita duplicatas no mesmo trecho
      if (signals.some(s => s.from === from && s.to === to)) return;
      signals.push({ from, to, t: 0, speed: spd, color: col, intensity: intens });
    };

    const frame = () => {
      const { isConnected: conn, isSpeaking: spk, isListening: lst, isThinking: thk, volume: vol } = stateRef.current;
      time++;

      // ── Background ──
      ctx.fillStyle = '#030912';
      ctx.fillRect(0, 0, W, H);

      // Radial ambient glow
      if (conn) {
        const grad = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.6);
        const intensity = spk ? 0.06 + vol * 0.04 : thk ? 0.04 : lst ? 0.035 : 0.018;
        grad.addColorStop(0, `rgba(0, 80, 160, ${intensity})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Micro-flutuação orgânica dos neurônios
      for (const n of neurons) {
        n.x = n.baseX + Math.sin(time * 0.0008 + n.cluster * 1.1) * 1.5;
        n.y = n.baseY + Math.cos(time * 0.0006 + n.cluster * 1.3) * 1.5;
      }

      const baseCol = stateColor(spk, lst, thk);
      const spd = signalSpeed(spk, lst, thk);

      // ── Sinápses ──
      ctx.save();
      for (const c of conns) {
        const na = neurons[c.a];
        const nb = neurons[c.b];
        const combinedCharge = (na.charge + nb.charge) * 0.5;
        const alpha = 0.06 + combinedCharge * 0.22;
        ctx.strokeStyle = `rgba(0, 160, 220, ${alpha})`;
        ctx.lineWidth = 0.4 + combinedCharge * 0.9;
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.quadraticCurveTo(c.cpx, c.cpy, nb.x, nb.y);
        ctx.stroke();
      }
      ctx.restore();

      // ── Atualizar + Desenhar Sinais ──
      ctx.save();
      for (let si = signals.length - 1; si >= 0; si--) {
        const s = signals[si];
        // Encontra a conexão correspondente
        const conn_idx = conns.findIndex(
          c => (c.a === s.from && c.b === s.to) || (c.b === s.from && c.a === s.to)
        );
        if (conn_idx < 0) { signals.splice(si, 1); continue; }
        const c = conns[conn_idx];
        const na = neurons[s.from];
        const nb = neurons[s.to];

        // Rastro (4 passos atrás)
        for (let tr = 4; tr >= 1; tr--) {
          const tt = Math.max(0, s.t - tr * 0.025);
          const pt = bezierPoint(tt, na.x, na.y, c.cpx, c.cpy, nb.x, nb.y);
          const trailAlpha = (s.intensity * 0.4 * (1 - tr / 5));
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.5 - tr * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = s.color + Math.round(trailAlpha * 255).toString(16).padStart(2, '0');
          ctx.fill();
        }

        // Bolha principal com glow
        const pt = bezierPoint(s.t, na.x, na.y, c.cpx, c.cpy, nb.x, nb.y);
        const gr = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 7 * s.intensity);
        gr.addColorStop(0,   s.color + 'FF');
        gr.addColorStop(0.4, s.color + '99');
        gr.addColorStop(1,   s.color + '00');
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7 * s.intensity, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();

        s.t += s.speed;

        if (s.t >= 1) {
          // Chega ao destino — carrega neurônio alvo
          neurons[s.to].charge = Math.min(1, neurons[s.to].charge + 0.75);
          neurons[s.to].refractoryTimer = 18;
          signals.splice(si, 1);

          // Cascata: com probabilidade 0.35, propaga para vizinhos do destino
          if (Math.random() < 0.35) {
            const neighbours = connsByNeuron[s.to];
            if (neighbours.length > 0) {
              const nc = conns[neighbours[Math.floor(Math.random() * neighbours.length)]];
              const nextTo = nc.a === s.to ? nc.b : nc.a;
              if (neurons[nextTo].refractoryTimer <= 0) {
                emitSignal(s.to, nextTo, baseCol, spd, s.intensity * 0.75);
              }
            }
          }
        }
      }
      ctx.restore();

      // ── Neurônios ──
      ctx.save();
      for (const n of neurons) {
        if (n.charge <= 0.01 && !conn) {
          // Neurônio inativo desconectado: ponto muito sutil
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15, 50, 100, 0.4)';
          ctx.fill();
          continue;
        }

        const c = n.charge;
        const glowR = n.r * 5;
        // Glow externo
        if (c > 0.05) {
          const g1 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
          g1.addColorStop(0,   `rgba(0, 180, 255, ${c * 0.12})`);
          g1.addColorStop(1,   'transparent');
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = g1;
          ctx.fill();
        }

        // Glow médio
        const g2 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.5);
        g2.addColorStop(0,   `rgba(0, 210, 255, ${0.15 + c * 0.30})`);
        g2.addColorStop(1,   'transparent');
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = g2;
        ctx.fill();

        // Core
        const g3 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g3.addColorStop(0,   `rgba(200, 240, 255, ${0.7 + c * 0.3})`);
        g3.addColorStop(0.5, `rgba(0, 200, 255, ${0.55 + c * 0.35})`);
        g3.addColorStop(1,   `rgba(0, 80, 160, ${0.4 + c * 0.3})`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = g3;
        ctx.fill();

        // Decay
        n.charge = Math.max(0, n.charge - 0.018);
        if (n.refractoryTimer > 0) n.refractoryTimer--;
      }
      ctx.restore();

      // ── EEG Bars (visualizador de áudio) ──
      if (conn) {
        const barH = 8 + vol * 65;
        const barW = 3;
        const barGap = 7;
        const barCount = 6;
        ctx.save();
        ctx.fillStyle = `rgba(0, 200, 255, 0.22)`;
        for (let i = 0; i < barCount; i++) {
          const noise = Math.random() * 5;
          const h = barH + noise;
          // Lado esquerdo
          ctx.fillRect(18 + i * (barW + barGap), H - h - 16, barW, h);
          // Lado direito (espelhado)
          ctx.fillRect(W - 18 - (i + 1) * (barW + barGap) + barGap, H - h - 16, barW, h);
        }
        ctx.restore();
      }

      // ── Emissão de novos sinais ──
      const rate = firingRate(spk, lst, thk, vol);
      if (conn && Math.random() < rate) {
        // Escolhe neurônio de origem baseado no padrão do estado
        let from: number;
        if (spk) {
          // Fala: explosão do centro (cluster 4) para fora
          from = 46 + Math.floor(Math.random() * 14); // cluster 4
        } else if (lst) {
          // Ouve: periferia para centro
          from = Math.floor(Math.random() * 36); // clusters 0-3
        } else if (thk) {
          // Metacognição: 3 fases cíclicas a cada ~3.5s (210 frames)
          // Fase 0 (Planejamento): córtex pré-frontal (cluster 0) → estruturas profundas (4)
          // Fase 1 (Monitoramento): feedback loops entre todos clusters, velocidade alta
          // Fase 2 (Avaliação): convergência para centro (cluster 4), desaceleração
          const metaPhase = Math.floor(time / 70) % 3;
          if (metaPhase === 0) {
            // PLANEJAMENTO — top-down, prefrontal lidera
            from = Math.floor(Math.random() * 14); // cluster 0 (pré-frontal)
          } else if (metaPhase === 1) {
            // MONITORAMENTO — feedback distribuído, alta atividade
            from = Math.floor(Math.random() * neurons.length);
          } else {
            // AVALIAÇÃO — convergência para estruturas profundas
            from = 46 + Math.floor(Math.random() * 14); // cluster 4 (profundo)
          }
        } else {
          from = Math.floor(Math.random() * neurons.length);
        }

        if (neurons[from].refractoryTimer <= 0) {
          const nConns = connsByNeuron[from];
          if (nConns.length > 0) {
            const ci = nConns[Math.floor(Math.random() * nConns.length)];
            const nc = conns[ci];
            const to = nc.a === from ? nc.b : nc.a;
            if (neurons[to].refractoryTimer <= 0) {
              // Cor varia com o estado e fase metacognitiva
              let hue: string;
              if (spk) {
                hue = Math.random() < 0.3 ? '#9B5FFF' : baseCol;
              } else if (thk) {
                const mp = Math.floor(time / 70) % 3;
                hue = mp === 0 ? '#6B5FFF'   // Planejamento — azul-violeta
                    : mp === 1 ? '#FF6B9D'   // Monitoramento — rosa (feedback/alerta)
                    :            '#00FFAA';   // Avaliação — verde-ciano (convergência)
              } else {
                hue = baseCol;
              }
              emitSignal(from, to, hue, spd + Math.random() * 0.004, 0.7 + Math.random() * 0.3);
              neurons[from].charge = Math.min(1, neurons[from].charge + 0.45);
              neurons[from].refractoryTimer = 12;
            }
          }
        }
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    const handleResize = () => {
      const W2 = canvas.offsetWidth;
      const H2 = canvas.offsetHeight;
      canvas.width  = W2 * dpr;
      canvas.height = H2 * dpr;
      ctx.scale(dpr, dpr);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
    />
  );
}

// ─── Ações de mensagem ────────────────────────────────────────────────────────
function NeuralMsgActions({ text, color }: { text: string; color: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR'; window.speechSynthesis.speak(u); }}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        style={{ color }}>
        <Volume1 size={10} />
      </button>
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        style={{ color: copied ? '#4ade80' : color }}>
        {copied ? <Check size={10} /> : <Copy size={10} />}
      </button>
    </div>
  );
}

// ─── Indicador de fase metacognitiva (visível durante thinking) ───────────────
const META_PHASES = [
  { label: 'planejando',   color: '#6B5FFF', icon: '◇' },
  { label: 'monitorando',  color: '#FF6B9D', icon: '◈' },
  { label: 'avaliando',    color: '#00FFAA', icon: '◉' },
];

function MetaCogIndicator({ isThinking }: { isThinking: boolean }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!isThinking) return;
    const t = setInterval(() => setPhase(p => (p + 1) % 3), 2333);
    return () => clearInterval(t);
  }, [isThinking]);
  if (!isThinking) return null;
  const p = META_PHASES[phase];
  return (
    <motion.div
      key={phase}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed left-0 right-0 flex justify-center z-10"
      style={{ bottom: 160 }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1 rounded-full"
        style={{ backgroundColor: `${p.color}15`, border: `1px solid ${p.color}30` }}
      >
        <motion.span
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          style={{ color: p.color, fontSize: 10 }}
        >
          {p.icon}
        </motion.span>
        <span
          className="text-[8px] uppercase tracking-[0.35em]"
          style={{ color: p.color }}
        >
          {p.label}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Layout principal ─────────────────────────────────────────────────────────
export function NeuralLayout({
  moodColor, personality, PERSONALITY_CONFIG,
  statusLabel, isConnected, isSpeaking, isListening, isThinking, isMuted, volume,
  messages, transcriptRef,
  inputText, setInputText, onSendText, onMicToggle, onDisconnect,
  fileInputRef, showAttachMenu, setShowAttachMenu, onFileClick, onScreenShare,
  onOrbClick, currentTime, onOpenSettings, onOpenPersonalityPicker, onOpenMenu,
  showInstallBanner, onDismissInstallBanner, installPrompt, isInstalled, onInstallApp,
}: MainLayoutProps) {
  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ backgroundColor: '#030912' }}>

      {/* Canvas neural — camada base */}
      <NeuralCanvas
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        isListening={isListening}
        isThinking={isThinking}
        volume={volume}
      />

      {/* Rede de pensamento em ramificações — overlay sobre rede neural, visível durante thinking */}
      <ThoughtTreeCanvas isThinking={isThinking} />

      {/* Overlay gradiente no rodapé (para legibilidade do input) */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ height: 220, background: 'linear-gradient(to top, #030912 45%, transparent)' }}
      />

      {/* Overlay gradiente no topo (para top bar) */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{ height: 80, background: 'linear-gradient(to bottom, rgba(3,9,18,0.85) 0%, transparent 100%)' }}
      />

      {/* PWA Banner */}
      <AnimatePresence>
        {showInstallBanner && installPrompt && !isInstalled && (
          <motion.div
            initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
            className="fixed top-16 left-4 right-4 z-[60] p-3 rounded-xl flex items-center justify-between gap-3"
            style={{ backgroundColor: 'rgba(0,180,255,0.1)', border: '1px solid rgba(0,180,255,0.25)' }}>
            <p className="text-xs" style={{ color: '#00C8FF' }}>Instalar OSONE</p>
            <div className="flex gap-2">
              <button onClick={onDismissInstallBanner} className="text-[10px] text-white/30 px-2 py-1">não</button>
              <button onClick={onInstallApp} className="text-[10px] px-3 py-1 rounded-lg"
                style={{ backgroundColor: 'rgba(0,180,255,0.2)', color: '#00C8FF' }}>instalar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOP BAR ────────────────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 h-14 px-5 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <button onClick={onOpenMenu}
            className="flex flex-col gap-[4px] opacity-30 hover:opacity-70 transition-opacity">
            <span className="block h-[2px] w-4 rounded-full bg-white" />
            <span className="block h-[2px] w-4 rounded-full bg-white" />
            <span className="block h-[2px] w-4 rounded-full bg-white" />
          </button>
          <button onClick={onOpenPersonalityPicker}
            className="flex items-center gap-2 opacity-50 hover:opacity-90 transition-opacity">
            <span className="text-sm">{PERSONALITY_CONFIG[personality]?.emoji}</span>
            <span className="text-[9px] uppercase tracking-[0.25em]"
              style={{ color: '#00A8CC' }}>{PERSONALITY_CONFIG[personality]?.label}</span>
          </button>
        </div>
        <span className="text-[10px] tracking-widest opacity-20 tabular-nums"
          style={{ color: '#00A8CC' }}>
          {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button onClick={onOpenSettings} className="opacity-30 hover:opacity-70 transition-opacity">
          <Settings size={16} color="#00A8CC" />
        </button>
      </div>

      {/* ── CHAT TRANSCRIPT ────────────────────────────────────────────────── */}
      <div
        ref={transcriptRef}
        className="fixed left-0 right-0 overflow-hidden z-10"
        style={{ top: 70, height: 130, padding: '0 20px' }}
      >
        <AnimatePresence initial={false}>
          {messages.slice(0, 2).reverse().map((msg, idx) => (
            <motion.div
              key={msg.id || idx}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: idx === 0 ? 0.92 : 0.38 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-center mb-3 group"
            >
              <p className="text-sm leading-relaxed"
                style={{
                  color: msg.role === 'model' ? 'rgba(200,240,255,0.92)' : 'rgba(160,210,240,0.55)',
                  textShadow: idx === 0 && msg.role === 'model' ? '0 0 24px rgba(0,180,255,0.5)' : 'none',
                }}>
                {msg.text}
              </p>
              {msg.role === 'model' && idx === 0 && (
                <NeuralMsgActions text={msg.text} color="#00A8CC" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── INDICADOR METACOGNITIVO (fases: planejando / monitorando / avaliando) */}
      <AnimatePresence>
        <MetaCogIndicator isThinking={isThinking} />
      </AnimatePresence>

      {/* ── STATUS LABEL ───────────────────────────────────────────────────── */}
      <div className="fixed left-0 right-0 flex justify-center z-10"
        style={{ bottom: 140 }}>
        <motion.p
          key={statusLabel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[8px] uppercase tracking-[0.5em]"
          style={{ color: isConnected ? '#00A8CC' : 'rgba(0,130,180,0.25)' }}
        >
          {statusLabel}
        </motion.p>
      </div>

      {/* ── INPUT / CONTROLES ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 16px))' }}>
        <div className="max-w-xl mx-auto relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSendText(); }}
            placeholder="mensagem..."
            className="w-full bg-transparent py-4 pl-10 pr-24 text-sm placeholder-white/20 focus:outline-none"
            style={{
              color: 'rgba(180,230,255,0.9)',
              border: '1px solid rgba(0,150,200,0.22)',
              borderRadius: 40,
              backdropFilter: 'blur(12px)',
              backgroundColor: 'rgba(0,20,50,0.5)',
              caretColor: '#00C8FF',
            }}
          />

          {/* + button */}
          <div className="absolute left-3">
            <button
              onClick={() => setShowAttachMenu(v => !v)}
              className="w-6 h-6 flex items-center justify-center rounded-full transition-all"
              style={{ color: showAttachMenu ? '#00C8FF' : 'rgba(255,255,255,0.3)' }}>
              <span className="text-base leading-none">+</span>
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-10 left-0 z-20 rounded-2xl border overflow-hidden shadow-2xl"
                  style={{ backgroundColor: '#050e20', borderColor: 'rgba(0,150,200,0.28)', minWidth: '170px' }}>
                  <button onClick={() => { setShowAttachMenu(false); onFileClick(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all text-left">
                    <Paperclip size={14} color="#00A8CC" />
                    <p className="text-xs text-white/70">Documento / Imagem</p>
                  </button>
                  <div className="h-px" style={{ backgroundColor: 'rgba(0,150,200,0.15)' }} />
                  <button onClick={onScreenShare}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all text-left">
                    <Monitor size={14} color="#00A8CC" />
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
                <Send size={18} color="#00A8CC" />
              </button>
            ) : (
              <button onClick={onMicToggle} className="p-1.5 transition-colors">
                {isMuted
                  ? <MicOff size={18} color="rgba(255,255,255,0.25)" />
                  : <Mic size={18} color={isConnected ? '#00C8FF' : 'rgba(0,180,220,0.45)'} />
                }
              </button>
            )}
            {isConnected && (
              <button onClick={onDisconnect} className="p-1.5 opacity-35 hover:opacity-80 transition-opacity">
                <PhoneOff size={16} color="rgba(255,255,255,0.45)" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
