import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock, FolderKanban, Sparkles } from "lucide-react";
import { api, type Analytics, type MapRow, type Stats } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { activity, files } from "@/lib/store";
import { Card, Kpi, H2, Skeleton, ErrorBox, Input, Button, Stagger, item } from "@/components/shell/ui";
import { Chart, C } from "@/lib/plotly";
import Constellation from "@/components/fx/Constellation";
import Tilt from "@/components/fx/Tilt";
import { NAV } from "@/components/shell/nav";

const ROUTED = "routed: dense (narrative) | faiss+bm25+kg+rerank (question)";
const TASKS = [["bns_qa", "BNS-QA"], ["ipc_facts", "IPC facts→section"], ["const_qa", "Constitution-QA"], ["sc_case", "SC case"]] as const;
type Act = { act: string; sections: number; year: number | null };

export default function CommandCenter() {
  const s = useFetch(() => api.get<Stats>("/stats")); const a = useFetch(() => api.get<Analytics>("/analytics")); const acts = useFetch(() => api.get<Act[]>("/acts")); const map = useFetch(() => api.get<MapRow[]>("/transition/map"));
  const nav = useNavigate(); const [q, setQ] = useState(""); const recent = activity.use(x => x.list).slice(0, 6); const pinned = files.use(x => x.items.length);
  if (s.error) return <ErrorBox error={s.error} retry={() => location.reload()} />;
  const st = s.data; const ft = a.data?.ablation_ft ?? [];
  const row = (cfg: string, task: string, m: string) => Number(ft.find(r => r.config === cfg && r.task === task)?.[m] ?? 0);
  const radar = (cfg: string, name: string, color: string) => ({ type: "scatterpolar" as const, r: [...TASKS.map(t => row(cfg, t[0], "R@5")), row(cfg, TASKS[0][0], "R@5")], theta: [...TASKS.map(t => t[1]), TASKS[0][1]], fill: "toself" as const, name, line: { color }, opacity: .85 });
  const ae = st?.answer_eval as Record<string, Record<string, number>> | null;
  const pick = map.data?.length ? map.data[new Date().getDate() % map.data.length] : null;
  const modules = NAV.flatMap(g => g.items).filter(i => !i.end && !["/app/settings", "/app/files"].includes(i.to));
  return (
    <div className="space-y-6">
      <Card className="scan relative overflow-hidden rounded-[22px] p-0" glow={false}>
        <div className="grid lg:grid-cols-[1fr_520px]">
          <div className="relative p-8">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgb(var(--accent-rgb)/.25),transparent_65%)] blur-2xl" />
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary/80"><span className="orb ring-pulse" />Retrieval cores online · Gemini link active</div>
            <h2 className="holo mt-3 font-display text-3xl leading-tight tracking-[0.04em] md:text-[38px]">LawLine Command Center</h2>
            <p className="mt-3 max-w-xl text-muted">Knowledge-graph-augmented hybrid retrieval for Indian law. Every answer grounded in retrieved statutes and judgments, cited passage by passage, and scored against a 1,810-query benchmark.</p>
            <form className="mt-6 flex max-w-2xl gap-2" onSubmit={e => { e.preventDefault(); if (q.trim()) nav(`/app/counsel?q=${encodeURIComponent(q)}`); }}>
              <Input aria-label="Quick consult" placeholder="Ask anything — “Is 498A bailable?”, “IPC 302 → BNS?”, “my cheque bounced”" value={q} onChange={e => setQ(e.target.value)} className="h-12" />
              <Button variant="primary" type="submit" size="lg">Ask <ArrowRight className="h-4 w-4" /></Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {["What is anticipatory bail under BNSS?", "What does Article 21 guarantee?", "Which section governs cheque bounce?", "Punishment for stalking?"].map(x => <Link key={x} to={`/app/counsel?q=${encodeURIComponent(x)}`} className="cursor-pointer rounded-full border border-white/10 px-3 py-1 text-xs text-muted transition-all hover:border-primary hover:text-white hover:shadow-[0_0_12px_rgb(var(--accent-rgb)/.3)]">{x}</Link>)}
            </div>
          </div>
          <div className="relative min-h-[320px] border-t border-white/5 lg:border-l lg:border-t-0">
            <div className="absolute left-4 top-4 z-10 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Corpus constellation · {acts.data?.length ?? "…"} Acts · drag to orbit · click to open</div>
            {acts.data ? <Constellation acts={acts.data} height={360} onPick={act => nav(`/app/provisions?act=${encodeURIComponent(act)}`)} /> : <Skeleton className="m-4 h-[330px]" />}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {st ? (<>
          <Kpi label="Documents" value={st.corpus.total} sub={`${st.corpus.statutes.toLocaleString()} provisions · ${st.corpus.cases.toLocaleString()} judgments`} />
          <Kpi label="Benchmark" value={Object.values(st.gold).reduce((n, g) => n + g.queries, 0)} sub="held-out queries · 4 tasks" delay={.04} />
          <Kpi label="Recall@5" value={row(ROUTED, "macro", "R@5")} decimals={3} sub="macro · routed system" delay={.08} color="#2ee6a6" />
          <Kpi label="nDCG@10" value={row(ROUTED, "macro", "nDCG@10")} decimals={3} sub="BM25 baseline 0.525" delay={.12} color="#2ee6a6" />
          <Kpi label="AIBE" value={(ae?.aibe?.rag_acc ?? 0) * 100} decimals={1} suffix="%" sub={`closed-book ${((ae?.aibe?.closed_book_acc ?? 0) * 100).toFixed(1)}%`} delay={.16} color="#ffd166" />
          <Kpi label="Graph nodes" value={st.kg.nodes.section + st.kg.nodes.case + st.kg.nodes.act + st.kg.nodes.concept} sub={`${Object.values(st.kg.edges).reduce((x, y) => x + y, 0).toLocaleString()} edges`} delay={.2} color="#b39dff" />
        </>) : Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between"><H2>Modules</H2><span className="font-mono text-[10px] uppercase tracking-wider text-muted">{modules.length} tools · ⌘K to jump</span></div>
        <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modules.map(m => (
            <motion.div key={m.to} variants={item} className={m.hot ? "sm:col-span-2 lg:col-span-1" : ""}>
              <Tilt className="group h-full" max={6}>
                <Link to={m.to} className="glass glow-border spot-card relative flex h-full min-h-[120px] cursor-pointer flex-col rounded-[16px] p-4 transition-shadow hover:shadow-[0_24px_50px_-24px_rgba(0,0,0,.9)]">
                  <div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-[12px] border" style={{ borderColor: m.hue + "66", background: m.hue + "14", boxShadow: `0 0 16px ${m.hue}33` }}><m.icon className="h-5 w-5" style={{ color: m.hue }} /></div>{m.hot && <span className="rounded-full border border-warning/40 px-1.5 font-mono text-[9px] uppercase text-warning">new</span>}</div>
                  <div className="mt-3 font-display text-[13px] tracking-wide text-white">{m.label}</div><div className="mt-1 text-xs text-muted">{m.desc}</div>
                  <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-muted opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" style={{ color: m.hue }} />
                </Link>
              </Tilt>
            </motion.div>))}
        </Stagger>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1"><H2 className="text-base">Performance radar</H2><p className="mt-1 text-xs text-muted">Recall@5 per task · fine-tuned encoder</p>
          {ft.length ? <Chart height={300} data={[radar("bm25", "BM25", C.muted), radar("faiss", "Dense (fine-tuned)", C.secondary), radar(ROUTED, "LawLine (routed)", C.primary)]} layout={{ polar: { bgcolor: "rgba(255,255,255,.02)", radialaxis: { range: [0, 1], gridcolor: "rgba(139,155,180,.2)" }, angularaxis: { gridcolor: "rgba(139,155,180,.2)", tickfont: { size: 9 } } }, margin: { l: 30, r: 30, t: 20, b: 20 } }} /> : <Skeleton className="h-[300px]" />}
        </Card>
        <Card className="lg:col-span-1"><H2 className="text-base">Pipeline</H2><p className="mt-1 text-xs text-muted">Where a query goes</p>
          <Chart height={300} data={[{ type: "sankey", arrangement: "snap", node: { pad: 14, thickness: 14, line: { width: 0 }, color: [C.primary, C.primary, C.warning, C.secondary, "#c8d6e5", "#c8d6e5", C.success, C.success], label: ["Query", "Dense", "Lexical", "Graph", "RRF", "Rerank", "Gemini", "You"] },
            link: { source: [0, 0, 0, 1, 2, 3, 4, 5, 6], target: [1, 2, 3, 4, 4, 4, 5, 6, 7], value: [3, 3, 2, 3, 3, 2, 6, 5, 5], color: ["rgba(0,229,255,.25)", "rgba(255,209,102,.25)", "rgba(124,77,255,.25)", "rgba(0,229,255,.18)", "rgba(255,209,102,.18)", "rgba(124,77,255,.18)", "rgba(200,214,229,.18)", "rgba(46,230,166,.25)", "rgba(46,230,166,.25)"] } } as never]} layout={{ margin: { l: 8, r: 8, t: 10, b: 10 }, font: { size: 10 } }} />
        </Card>
        <div className="space-y-4">
          <Card className="p-5"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-warning"><Sparkles className="h-3.5 w-3.5" />Bridge of the day</div>
            {pick ? <><div className="mt-2 font-display text-lg text-white">{pick.old_act.split(",")[0].replace("Act ", "")} s.{pick.old_section} <span className="text-success">→</span> s.{pick.new_sections.join("/")}</div><div className="text-xs text-muted">{pick.concepts.slice(0, 3).join(" · ")}</div><Link to={`/app/transition?act=${pick.old_act.startsWith("Indian Penal") ? "IPC" : pick.old_act.startsWith("Code") ? "CRPC" : "IEA"}&section=${pick.old_section}`} className="mt-2 inline-block font-mono text-[11px] text-primary hover:underline">Open the bridge →</Link></> : <Skeleton className="mt-2 h-16" />}
          </Card>
          <Card className="p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80"><Clock className="h-3.5 w-3.5" />Recent activity</div><Link to="/app/files" className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-fg"><FolderKanban className="h-3 w-3" />{pinned} pinned</Link></div>
            {recent.length ? <ul className="mt-2 space-y-1.5">{recent.map((r, i) => <li key={i} className="flex items-center gap-2 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-primary" /><Link to={r.to ?? "/app"} className="truncate text-muted hover:text-fg">{r.text}</Link><span className="ml-auto shrink-0 font-mono text-[10px] text-muted/60">{new Date(r.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul> : <p className="mt-2 text-xs text-muted">Your consultations, briefs and timelines will show up here.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
