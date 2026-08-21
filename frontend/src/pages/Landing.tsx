import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Network, ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import { BlackHoleHeroSection } from "@/components/ui/blackhole-hero-section";
import NeuralSynapseHero from "@/components/ui/neurons-hero";
import { useNarrow } from "@/lib/hooks";
import { useNavigate } from "react-router-dom";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const rise = (i: number) => ({ initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { delay: i * 0.1, duration: 0.5, ease: EASE } });

export default function Landing() {
  const narrow = useNarrow(); const nav = useNavigate(); const reduce = useReducedMotion();
  const features = [
    { icon: ShieldCheck, t: "Grounded, cited answers", d: "Every claim is tied to a retrieved provision or judgment. Citations are parsed and verified, not decorative." },
    { icon: Network, t: "Legal knowledge graph", d: "1,024 Acts, 36,000 provisions, 6,600 judgments and 214 curated concepts — explore it in 3D." },
    { icon: ScrollText, t: "Statutes to judgments", d: "IPC, BNS/BNSS/BSA 2023, the Constitution, CrPC, Evidence, Contract, NI Act and 1,000+ more, with the IPC→BNS map." },
    { icon: Sparkles, t: "Measured, not marketed", d: "1,810-query benchmark, ablations, fine-tuned retriever, LLM-judged faithfulness — all published in Analytics." },
  ];
  return (
    <div className="bg-bg text-fg">
      <section className="relative min-h-[92svh] w-full md:min-h-[720px]">
        <BlackHoleHeroSection focus={narrow ? [0.5, 0.76] : [0.72, 0.46]} scrim={narrow ? "top" : "left"} scrimStrength={0.9} distance={24} elevation={narrow ? -7 : -5.5} fov={narrow ? 58 : 42}
          glow={narrow ? 0.85 : 1} steps={narrow ? 200 : 300} resolution={narrow ? 0.6 : 0.7} hotColor="#EAF9FF" midColor="#00E5FF" coolColor="#3B2A8C" paused={!!reduce}>
          <div className="flex h-full min-h-[92svh] items-start px-6 pt-14 sm:px-10 md:min-h-[720px] md:items-center md:pt-0 lg:px-20">
            <div className="max-w-[34rem]">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: EASE }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 backdrop-blur-sm">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /><span className="font-mono text-[11px] uppercase tracking-[0.12em]">Grounded legal research · Indian law</span>
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1, duration: .6, ease: EASE }} className="font-display text-[2.5rem] leading-[1.05] tracking-[0.02em] text-fg sm:text-6xl lg:text-[4.25rem]">
                The law does<br />not leave here<br /><span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">unanswered</span>
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2, duration: .6, ease: EASE }} className="mt-6 max-w-md text-[0.95rem] leading-relaxed text-muted md:mt-7">
                Ask in plain language. LawLine pulls the governing provisions and judgments, reasons only from them, and shows you every passage it relied on.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3, duration: .6, ease: EASE }} className="mt-8 flex flex-wrap items-center gap-3 md:mt-10">
                <Link to="/app/counsel" className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-bg transition hover:shadow-[0_0_24px_rgba(0,229,255,.5)]">Start a consultation <ArrowRight className="h-4 w-4" aria-hidden /></Link>
                <Link to="/app/analytics" className="inline-flex h-12 cursor-pointer items-center rounded-full border border-white/20 px-6 text-sm text-fg/80 transition hover:border-primary hover:text-fg">See the evidence</Link>
              </motion.div>
              <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .6, duration: .6 }} className="mt-10 grid max-w-md grid-cols-3 gap-4">
                {[["36,272", "provisions"], ["1,810", "benchmark queries"], ["0.725", "macro Recall@5"]].map(([v, l]) => (<div key={l}><dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{l}</dt><dd className="font-display text-xl tabular-nums text-primary">{v}</dd></div>))}
              </motion.dl>
            </div>
          </div>
        </BlackHoleHeroSection>
      </section>

      <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <motion.div {...rise(0)} className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">What it does</motion.div>
        <motion.h2 {...rise(1)} className="mt-2 max-w-3xl font-display text-3xl tracking-[0.04em]">Research, not guesswork</motion.h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div key={f.t} {...rise(i + 2)} whileHover={{ y: -3 }} className="cursor-default rounded-[14px] border border-[var(--border)] bg-[var(--glass)] p-6 backdrop-blur-[10px] transition-shadow hover:shadow-[0_12px_40px_rgba(0,229,255,.12)]">
              <f.icon className="h-5 w-5 text-primary" aria-hidden /><h3 className="mt-4 text-lg font-semibold">{f.t}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative">
        <NeuralSynapseHero title="A network of law" eyebrow="Knowledge graph · 46,000 nodes" subtitle="Acts, sections, judgments and concepts connected by cross-references and citations. Ask a question and watch the retrievers converge on the governing provision." ctaLabel="Open the graph" onCta={() => nav("/app/graph")}
          stats={[{ label: "provisions", value: "36,272" }, { label: "judgments", value: "6,596" }, { label: "concepts", value: "214" }]} />
      </section>
    </div>
  );
}
