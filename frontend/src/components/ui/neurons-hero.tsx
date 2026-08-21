"use client";

import React, { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Scale, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- canvas */
type Projected = { x: number; y: number; scale: number };

class Neuron {
  x: number; y: number; z: number;
  baseX: number; baseY: number; baseZ: number;
  radius = Math.random() * 2 + 1;
  activation = 0;
  neighbors: Neuron[] = [];
  constructor(x: number, y: number, z: number) {
    this.x = x; this.y = y; this.z = z; this.baseX = x; this.baseY = y; this.baseZ = z;
  }
}
class Pulse {
  progress = 0;
  speed = 0.05;
  start: Neuron; end: Neuron;
  constructor(start: Neuron, end: Neuron) { this.start = start; this.end = end; }
}

const CosmicSynapseCanvas: React.FC<{ className?: string; density?: number }> = ({ className, density = 1000 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let neurons: Neuron[] = [];
    let pulses: Pulse[] = [];
    let running = true;
    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, radius: 150 };
    const perspective = 400;

    const project = (n: Neuron): Projected => {
      const rotX = (mouse.y - canvas.height / 2) * 0.0001;
      const rotY = (mouse.x - canvas.width / 2) * 0.0001;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY), cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const x1 = n.x * cosY - n.z * sinY;
      const z1 = n.z * cosY + n.x * sinY;
      const y1 = n.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + n.y * sinX;
      const scale = perspective / (perspective + z2);
      return { x: x1 * scale + canvas.width / 2, y: y1 * scale + canvas.height / 2, scale };
    };

    const fire = (n: Neuron) => {
      if (n.activation > 0.5) return;
      n.activation = 1;
      n.neighbors.forEach(nb => pulses.push(new Pulse(n, nb)));
    };

    const init = () => {
      neurons = []; pulses = [];
      const radius = Math.min(250, Math.min(canvas.width, canvas.height) * 0.32);
      for (let i = 0; i < density; i++) {
        const phi = Math.acos(-1 + (2 * i) / density);
        const theta = Math.sqrt(density * Math.PI) * phi;
        neurons.push(new Neuron(radius * Math.cos(theta) * Math.sin(phi), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi)));
      }
      for (const n of neurons) {
        for (const o of neurons) {
          if (n !== o && Math.hypot(n.x - o.x, n.y - o.y, n.z - o.z) < 40) n.neighbors.push(o);
        }
      }
    };

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; init(); };

    const animate = () => {
      if (!running) return;
      ctx.fillStyle = "rgba(7, 11, 20, 0.15)";          // --bg, trailing fade
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (Math.random() > 0.99) fire(neurons[Math.floor(Math.random() * neurons.length)]);
      for (const n of neurons) {
        const p = project(n);
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const force = Math.max(0, (mouse.radius - dist) / mouse.radius);
        n.x += (dx / dist) * force * 0.5; n.y += (dy / dist) * force * 0.5;
        n.x += (n.baseX - n.x) * 0.01; n.y += (n.baseY - n.y) * 0.01;
        if (n.activation > 0) n.activation -= 0.01;
        ctx.beginPath();
        ctx.arc(p.x, p.y, n.radius * p.scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${0.18 + n.activation * 0.8})`;   // --primary
        ctx.fill();
      }
      pulses = pulses.filter(pl => {
        pl.progress += pl.speed;
        if (pl.progress >= 1) { pl.end.activation = Math.min(1, pl.end.activation + 0.5); return false; }
        const a = project(pl.start), b = project(pl.end);
        const x = a.x + (b.x - a.x) * pl.progress, y = a.y + (b.y - a.y) * pl.progress, s = a.scale + (b.scale - a.scale) * pl.progress;
        ctx.beginPath(); ctx.arc(x, y, 2.5 * s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(223, 231, 245, ${1 - pl.progress})`;
        ctx.shadowColor = "#7c4dff"; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
        return true;
      });
      animationFrameId = requestAnimationFrame(animate);
    };

    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) animate(); else cancelAnimationFrame(animationFrameId);
    };
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("visibilitychange", onVisibility);
    resize(); animate();
    return () => {
      running = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density]);

  return <canvas ref={canvasRef} aria-hidden className={cn("absolute inset-0 z-0 h-full w-full bg-bg", className)} />;
};

/* ------------------------------------------------------------------ hero */
export interface NeuralSynapseHeroProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
  stats?: { label: string; value: string }[];
  className?: string;
}

const EASE = [0.2, 0.8, 0.2, 1] as const;
const rise = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.12 + 0.3, duration: 0.5, ease: EASE },
});

export default function NeuralSynapseHero({
  eyebrow = "Grounded legal research · Indian law",
  title = "LawLine AI",
  subtitle = "Ask in plain language. Every answer is built from retrieved statutes and judgments, cited passage by passage, across 42,000+ provisions and a legal knowledge graph.",
  ctaLabel = "Start a consultation",
  onCta,
  stats = [
    { label: "provisions indexed", value: "36,272" },
    { label: "benchmark queries", value: "1,810" },
    { label: "judged faithfulness", value: "2.0 / 2" },
  ],
  className,
}: NeuralSynapseHeroProps) {
  const reduce = useReducedMotion();
  return (
    <section className={cn("relative flex h-screen w-full flex-col items-center justify-center overflow-hidden", className)} aria-labelledby="hero-title">
      {reduce ? <div className="absolute inset-0 z-0 bg-bg" /> : <CosmicSynapseCanvas />}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-bg via-bg/50 to-transparent" />

      <div className="relative z-20 max-w-3xl px-6 text-center">
        <motion.div {...rise(0)}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 backdrop-blur-sm">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-mono text-xs tracking-[0.12em] text-fg uppercase">{eyebrow}</span>
        </motion.div>

        <motion.h1 id="hero-title" {...rise(1)}
          className="mb-6 font-display text-5xl font-bold tracking-[0.04em] md:text-7xl bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          {title}
        </motion.h1>

        <motion.p {...rise(2)} className="mx-auto mb-10 max-w-[60ch] text-lg text-muted">
          {subtitle}
        </motion.p>

        <motion.div {...rise(3)} className="flex flex-col items-center gap-8">
          <button type="button" onClick={onCta}
            className="inline-flex h-12 items-center gap-2 rounded-[10px] border border-primary/40 bg-gradient-to-br from-primary/15 to-secondary/15 px-8 font-semibold text-fg transition-[box-shadow,border-color] duration-200 hover:border-primary hover:shadow-[0_0_24px_rgba(0,229,255,.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <Scale className="h-5 w-5 text-primary" aria-hidden />
            {ctaLabel}
            <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
          <dl className="grid grid-cols-3 gap-6">
            {stats.map(s => (
              <div key={s.label} className="text-center">
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{s.label}</dt>
                <dd className="font-display text-2xl text-primary tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </motion.div>
        <p className="mt-8 font-mono text-xs text-muted">Legal information, not legal advice.</p>
      </div>
    </section>
  );
}
