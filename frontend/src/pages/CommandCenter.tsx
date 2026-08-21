import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { api, type Analytics, type Stats } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Card, Kpi, Eyebrow, H2, Skeleton, ErrorBox, Input, Button } from "@/components/shell/ui";
import { Chart, C } from "@/lib/plotly";
import { useState } from "react";

const ROUTED = "routed: dense (narrative) | faiss+bm25+kg+rerank (question)";
const TASKS = [["bns_qa", "BNS-QA"], ["ipc_facts", "IPC facts→section"], ["const_qa", "Constitution-QA"], ["sc_case", "SC case"]] as const;

export default function CommandCenter() {
  const s = useFetch(() => api.get<Stats>("/stats")); const a = useFetch(() => api.get<Analytics>("/analytics")); const nav = useNavigate(); const [q, setQ] = useState("");
  if (s.error) return <ErrorBox error={s.error} />;
  const st = s.data; const ft = a.data?.ablation_ft ?? [];
  const row = (cfg: string, task: string, m: string) => Number(ft.find(r => r.config === cfg && r.task === task)?.[m] ?? 0);
  const radar = (cfg: string, name: string, color: string) => ({ type: "scatterpolar" as const, r: [...TASKS.map(t => row(cfg, t[0], "R@5")), row(cfg, TASKS[0][0], "R@5")], theta: [...TASKS.map(t => t[1]), TASKS[0][1]], fill: "toself" as const, name, line: { color }, opacity: .85 });
  const ae = st?.answer_eval as Record<string, Record<string, number>> | null;
  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden rounded-[18px]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-[conic-gradient(from_0deg,transparent_0_70%,rgba(0,229,255,.25)_85%,transparent_100%)] motion-safe:animate-[spin_12s_linear_infinite]" />
        <Eyebrow>Retrieval cores online · Gemini link active</Eyebrow>
        <h2 className="mt-2 bg-gradient-to-r from-primary to-secondary bg-clip-text font-display text-3xl tracking-[0.04em] text-transparent">LawLine AI · Command Center</h2>
        <p className="mt-2 max-w-3xl text-muted">Knowledge-graph-augmented hybrid retrieval for Indian law. Every answer is grounded in retrieved statutes and judgments, cited passage by passage, and scored against a 1,810-query benchmark.</p>
        <form className="mt-6 flex max-w-2xl gap-2" onSubmit={e => { e.preventDefault(); if (q.trim()) nav(`/app/counsel?q=${encodeURIComponent(q)}`); }}>
          <Input aria-label="Quick consult" placeholder="e.g. What is the punishment for cheating under Section 420 IPC?" value={q} onChange={e => setQ(e.target.value)} />
          <Button variant="primary" type="submit">Ask <ArrowRight className="h-4 w-4" /></Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {["What is anticipatory bail under BNSS?", "What does Article 21 guarantee?", "Which section governs cheque bounce?", "IPC 302 → BNS?"].map(x => <Link key={x} to={`/app/counsel?q=${encodeURIComponent(x)}`} className="cursor-pointer rounded-full border border-[var(--border)] px-3 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-fg">{x}</Link>)}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {st ? (<>
          <Kpi label="Documents" value={st.corpus.total.toLocaleString()} sub={`${st.corpus.statutes.toLocaleString()} provisions · ${st.corpus.cases.toLocaleString()} judgments`} />
          <Kpi label="Benchmark" value={Object.values(st.gold).reduce((n, g) => n + g.queries, 0).toLocaleString()} sub="held-out queries · 4 tasks" delay={.04} />
          <Kpi label="Recall@5" value={row(ROUTED, "macro", "R@5").toFixed(3)} sub="macro · routed system" delay={.08} />
          <Kpi label="nDCG@10" value={row(ROUTED, "macro", "nDCG@10").toFixed(3)} sub="BM25 baseline 0.525" delay={.12} />
          <Kpi label="AIBE" value={`${((ae?.aibe?.rag_acc ?? 0) * 100).toFixed(1)}%`} sub={`closed-book ${((ae?.aibe?.closed_book_acc ?? 0) * 100).toFixed(1)}%`} delay={.16} />
          <Kpi label="KG" value={`${(st.kg.nodes.section + st.kg.nodes.case + st.kg.nodes.act + st.kg.nodes.concept).toLocaleString()}`} sub={`${Object.values(st.kg.edges).reduce((a, b) => a + b, 0).toLocaleString()} edges`} delay={.2} />
        </>) : Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><H2>Performance radar</H2><p className="mt-1 text-xs text-muted">Recall@5 per task · fine-tuned encoder</p>
          {ft.length ? <Chart height={360} data={[radar("bm25", "BM25", C.muted), radar("faiss", "Dense (fine-tuned)", C.secondary), radar(ROUTED, "LawLine (routed)", C.primary)]} layout={{ polar: { bgcolor: "rgba(255,255,255,.02)", radialaxis: { range: [0, 1], gridcolor: "rgba(139,155,180,.2)" }, angularaxis: { gridcolor: "rgba(139,155,180,.2)" } } }} /> : <Skeleton className="h-[360px]" />}
        </Card>
        <Card><H2>Pipeline</H2><p className="mt-1 text-xs text-muted">Where a query goes</p>
          <Chart height={360} data={[{ type: "sankey", arrangement: "snap", node: { pad: 18, thickness: 16, line: { width: 0 }, color: [C.primary, C.primary, C.warning, C.secondary, "#c8d6e5", "#c8d6e5", C.success, C.success], label: ["Query", "Dense (FAISS · fine-tuned)", "Lexical (BM25)", "Knowledge graph", "Reciprocal rank fusion", "Cross-encoder rerank", "Gemini · cited answer", "You"] },
            link: { source: [0, 0, 0, 1, 2, 3, 4, 5, 6], target: [1, 2, 3, 4, 4, 4, 5, 6, 7], value: [3, 3, 2, 3, 3, 2, 6, 5, 5], color: ["rgba(0,229,255,.25)", "rgba(255,209,102,.25)", "rgba(124,77,255,.25)", "rgba(0,229,255,.18)", "rgba(255,209,102,.18)", "rgba(124,77,255,.18)", "rgba(200,214,229,.18)", "rgba(46,230,166,.25)", "rgba(46,230,166,.25)"] } } as never]} />
        </Card>
      </div>
    </div>
  );
}
