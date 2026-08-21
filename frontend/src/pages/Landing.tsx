import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Database, GitBranch, ShieldCheck, Sparkles, Cpu, Gauge } from "lucide-react";
import { BlackHoleHeroSection } from "@/components/ui/blackhole-hero-section";
import NeuralSynapseHero from "@/components/ui/neurons-hero";
import { useNarrow } from "@/lib/hooks";
import Tilt from "@/components/fx/Tilt";
import Counter from "@/components/fx/Counter";
import { NAV } from "@/components/shell/nav";
import Aurora from "@/components/fx/Aurora";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const rise = (i: number) => ({ initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { delay: i * 0.08, duration: 0.55, ease: EASE } });
const ACTS = ["Indian Penal Code, 1860", "Bharatiya Nyaya Sanhita, 2023", "Constitution of India", "Code of Criminal Procedure, 1973", "Bharatiya Nagarik Suraksha Sanhita, 2023", "Indian Evidence Act, 1872", "Bharatiya Sakshya Adhiniyam, 2023", "Indian Contract Act, 1872", "Negotiable Instruments Act, 1881", "Hindu Marriage Act, 1955", "Consumer Protection Act, 2019", "Information Technology Act, 2000", "Motor Vehicles Act, 1988", "Right to Information Act, 2005", "Specific Relief Act, 1963", "Limitation Act, 1963", "Domestic Violence Act, 2005", "Transfer of Property Act, 1882"];
const STEPS = [{ icon: Database, t: "Retrieve three ways", d: "A fine-tuned dense encoder, BM25 with a legal tokenizer and a 46,000-node knowledge graph each nominate candidates." }, { icon: GitBranch, t: "Fuse and rerank", d: "Reciprocal rank fusion merges the lists; a cross-encoder re-scores the top passages against your exact question." }, { icon: Cpu, t: "Reason only from evidence", d: "Gemini drafts the answer from the retrieved passages and must cite each claim [n]. No passage, no claim." }, { icon: Gauge, t: "Measure everything", d: "1,810 held-out queries, ablations, LLM-judged faithfulness and AIBE accuracy — published in Analytics." }];

export default function Landing() {
  const narrow = useNarrow(); const nav = useNavigate(); const reduce = useReducedMotion();
  const modules = NAV.flatMap(g => g.items).filter(i => !i.end && !["/app/settings", "/app/files", "/app/methodology"].includes(i.to));
  return (
    <div className="relative bg-bg text-fg">
      <Aurora />
      <section className="relative min-h-[92svh] w-full md:min-h-[760px]">
        <BlackHoleHeroSection focus={narrow ? [0.5, 0.76] : [0.72, 0.46]} scrim={narrow ? "top" : "left"} scrimStrength={0.9} distance={24} elevation={narrow ? -7 : -5.5} fov={narrow ? 58 : 42}
          glow={narrow ? 0.85 : 1} steps={narrow ? 200 : 300} resolution={narrow ? 0.6 : 0.7} hotColor="#EAF9FF" midColor="#00E5FF" coolColor="#3B2A8C" paused={!!reduce}>
          <div className="flex h-full min-h-[92svh] items-start px-6 pt-14 sm:px-10 md:min-h-[760px] md:items-center md:pt-0 lg:px-20">
            <div className="max-w-[36rem]">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: EASE }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 backdrop-blur-sm">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /><span className="font-mono text-[11px] uppercase tracking-[0.12em]">Grounded legal intelligence · Indian law · 20 tools</span>
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1, duration: .6, ease: EASE }} className="font-display text-[2.5rem] leading-[1.05] tracking-[0.02em] text-fg sm:text-6xl lg:text-[4.25rem]">
                The law does<br />not leave here<br /><span className="holo">unanswered</span>
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2, duration: .6, ease: EASE }} className="mt-6 max-w-md text-[0.95rem] leading-relaxed text-muted md:mt-7">
                Ask in plain language. LawLine retrieves the governing provisions and judgments, reasons only from them, and shows every passage it relied on — then helps you summarise, compare, argue, draft and verify.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3, duration: .6, ease: EASE }} className="mt-8 flex flex-wrap items-center gap-3 md:mt-10">
                <Link to="/app/counsel" className="shine inline-flex h-12 cursor-pointer items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-bg transition hover:shadow-[0_0_28px_rgb(var(--accent-rgb)/.6)]">Start a consultation <ArrowRight className="h-4 w-4" aria-hidden /></Link>
                <Link to="/app" className="inline-flex h-12 cursor-pointer items-center rounded-full border border-white/20 px-6 text-sm text-fg/80 backdrop-blur transition hover:border-primary hover:text-fg">Open the command center</Link>
              </motion.div>
              <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .6, duration: .6 }} className="mt-10 grid max-w-md grid-cols-3 gap-4">
                {[[36272, "provisions", 0], [1810, "benchmark queries", 0], [0.725, "macro Recall@5", 3]].map(([v, l, d]) => (<div key={String(l)}><dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{l}</dt><dd className="font-display text-xl tabular-nums text-primary"><Counter value={Number(v)} decimals={Number(d)} /></dd></div>))}
              </motion.dl>
            </div>
          </div>
        </BlackHoleHeroSection>
      </section>

      <div className="relative overflow-hidden border-y border-white/5 bg-black/30 py-3" aria-hidden><div className="marquee font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{[...ACTS, ...ACTS].map((a, i) => <span key={i} className="flex items-center gap-6"><span>{a}</span><span className="h-1 w-1 rounded-full bg-primary" /></span>)}</div></div>

      <section className="relative mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <motion.div {...rise(0)} className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary/80">How it works</motion.div>
        <motion.h2 {...rise(1)} className="mt-2 max-w-3xl font-display text-3xl tracking-[0.04em] text-white">Research, not guesswork</motion.h2>
        <div className="relative mt-12 grid gap-4 md:grid-cols-4">
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-9 hidden h-px bg-[linear-gradient(90deg,transparent,rgb(var(--accent-rgb)/.6),rgba(124,77,255,.6),transparent)] md:block" />
          {STEPS.map((s, i) => (
            <motion.div key={s.t} {...rise(i + 2)} className="relative">
              <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-primary/40 bg-bg shadow-[0_0_30px_rgb(var(--accent-rgb)/.25)]"><s.icon className="h-6 w-6 text-primary" /></div>
              <div className="mt-4 text-center"><div className="font-mono text-[10px] uppercase tracking-wider text-muted">step {i + 1}</div><h3 className="mt-1 font-display text-[15px] tracking-wide text-white">{s.t}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p></div>
            </motion.div>))}
        </div>
      </section>

      <section className="relative mx-auto max-w-[1280px] px-6 pb-24 md:px-10">
        <motion.div {...rise(0)} className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary/80">Twenty tools, one evidence base</motion.div>
        <motion.h2 {...rise(1)} className="mt-2 max-w-3xl font-display text-3xl tracking-[0.04em] text-white">More than a chatbot</motion.h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m, i) => (
            <motion.div key={m.to} {...rise((i % 4) + 2)} className={m.hot ? "lg:col-span-2" : ""}>
              <Tilt className="group h-full" max={7}>
                <Link to={m.to} className="glass glow-border spot-card relative flex h-full min-h-[150px] cursor-pointer flex-col rounded-[18px] p-5 transition-shadow hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[12px] border" style={{ borderColor: m.hue + "66", background: m.hue + "14", boxShadow: `0 0 18px ${m.hue}33` }}><m.icon className="h-5 w-5" style={{ color: m.hue }} /></div>
                  <h3 className="mt-4 font-display text-[15px] tracking-wide text-white">{m.label}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{m.desc}</p>
                  <span className="mt-auto pt-4 font-mono text-[10px] uppercase tracking-wider opacity-0 transition-opacity group-hover:opacity-100" style={{ color: m.hue }}>open →</span>
                </Link>
              </Tilt>
            </motion.div>))}
        </div>
      </section>

      <section className="relative">
        <NeuralSynapseHero title="A network of law" eyebrow="Knowledge graph · 46,000 nodes" subtitle="Acts, sections, judgments and concepts connected by cross-references and citations. Ask a question and watch the retrievers converge on the governing provision." ctaLabel="Open the graph" onCta={() => nav("/app/graph")}
          stats={[{ label: "provisions", value: "36,272" }, { label: "judgments", value: "6,596" }, { label: "concepts", value: "214" }]} />
      </section>

      <section className="relative mx-auto max-w-[1280px] px-6 py-24 text-center md:px-10">
        <motion.div {...rise(0)} className="glass scan relative mx-auto max-w-3xl overflow-hidden rounded-[24px] p-10">
          <Sparkles className="mx-auto h-6 w-6 text-primary" />
          <h2 className="holo mt-3 font-display text-3xl tracking-[0.04em]">Ready when you are</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Free to use. Voice in, read-aloud out, ten Indian languages, and a case file that travels with you. Legal information, not legal advice.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><Link to="/app/counsel" className="shine inline-flex h-12 cursor-pointer items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-bg">Ask Counsel <ArrowRight className="h-4 w-4" /></Link><Link to="/app/analytics" className="inline-flex h-12 cursor-pointer items-center rounded-full border border-white/20 px-6 text-sm text-fg/80 hover:border-primary">See the evidence</Link></div>
        </motion.div>
        <div className="mt-10 font-mono text-[10px] uppercase tracking-[0.14em] text-muted/60">LawLine AI · PES University capstone · Phase III</div>
      </section>
    </div>
  );
}
