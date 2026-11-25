import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { api, type Analytics, type MapRow, type Stats } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { activity, files } from "@/lib/store";
import { Button, Card, ErrorBox, Input, Page, Section, Skeleton, Stat, StatStrip } from "@/components/ui";
import { Chart, C } from "@/lib/plotly";
import { NAV } from "@/components/shell/nav";
import Pipeline from "@/components/Pipeline";

const ROUTED = "routed: dense (narrative) | faiss+bm25+kg+rerank (question)";
const TASKS = [["bns_qa", "BNS questions"], ["ipc_facts", "IPC fact patterns"], ["const_qa", "Constitution"], ["sc_case", "SC case retrieval"]] as const;
const EXAMPLES = ["What is anticipatory bail under BNSS?", "What does Article 21 guarantee?", "Which section governs cheque bounce?", "What is the punishment for stalking?"];
const codeOf = (act: string) => act.startsWith("Indian Penal") ? "IPC" : act.startsWith("Code") ? "CRPC" : "IEA";

export default function Overview() {
  const s = useFetch(() => api.get<Stats>("/stats")); const a = useFetch(() => api.get<Analytics>("/analytics")); const map = useFetch(() => api.get<MapRow[]>("/transition/map"));
  const nav = useNavigate(); const [q, setQ] = useState(""); const recent = activity.use(x => x.list).slice(0, 6); const pinned = files.use(x => x.items.length);
  const st = s.data; const ft = a.data?.ablation_ft ?? [];
  const row = (cfg: string, task: string, m: string) => Number(ft.find(r => r.config === cfg && r.task === task)?.[m] ?? 0);
  const series = (cfg: string, name: string, color: string) => ({ type: "bar" as const, name, x: TASKS.map(t => t[1]), y: TASKS.map(t => row(cfg, t[0], "R@5")), marker: { color }, hovertemplate: "%{x}<br>" + name + ": %{y:.3f}<extra></extra>" });
  const ae = st?.answer_eval ?? null;
  const pick = map.data?.length ? map.data[new Date().getDate() % map.data.length] : null;
  return (
    <Page title="Overview" desc="Ask a question, or open a module. Every answer is built from retrieved statutes and judgments and cites them passage by passage.">
      <Card>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (q.trim()) nav(`/app/counsel?q=${encodeURIComponent(q)}`); }}>
          <Input aria-label="Ask a legal question" placeholder="Ask a legal question, e.g. “Is Section 498A bailable?”" value={q} onChange={e => setQ(e.target.value)} className="h-11 text-[15px]" />
          <Button variant="primary" type="submit" className="h-11">Ask Counsel <ArrowRight className="h-4 w-4" aria-hidden /></Button>
        </form>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">{EXAMPLES.map(x => <li key={x}><Link to={`/app/counsel?q=${encodeURIComponent(x)}`} className="link">{x}</Link></li>)}</ul>
      </Card>

      {s.error ? <ErrorBox error={s.error} retry={() => location.reload()} /> : st ? (
        <StatStrip>
          <Stat label="Documents" value={st.corpus.total.toLocaleString()} sub={`${st.corpus.statutes.toLocaleString()} provisions · ${st.corpus.cases.toLocaleString()} judgments`} />
          <Stat label="Benchmark queries" value={Object.values(st.gold).reduce((n, g) => n + g.queries, 0).toLocaleString()} sub="held out · 4 tasks" />
          <Stat label="Recall@5" value={ft.length ? row(ROUTED, "macro", "R@5").toFixed(3) : "…"} sub={ft.length ? `BM25 alone ${row("bm25", "macro", "R@5").toFixed(3)}` : " "} />
          <Stat label="nDCG@10" value={ft.length ? row(ROUTED, "macro", "nDCG@10").toFixed(3) : "…"} sub={ft.length ? `BM25 alone ${row("bm25", "macro", "nDCG@10").toFixed(3)}` : " "} />
          <Stat label="Bar exam accuracy" value={`${((ae?.aibe?.rag_acc ?? 0) * 100).toFixed(1)}%`} sub={`closed-book ${((ae?.aibe?.closed_book_acc ?? 0) * 100).toFixed(1)}%`} />
        </StatStrip>
      ) : <Skeleton className="h-[104px]" />}

      <section aria-labelledby="modules">
        <h2 id="modules" className="mb-3 text-[15px] font-semibold text-ink">Modules</h2>
        <Card flush className="grid sm:grid-cols-2 lg:grid-cols-4 [&>*]:border-line [&>*]:border-b sm:[&>*]:border-r lg:[&>*]:border-b-0 lg:[&>*:last-child]:border-r-0">
          {NAV.map(g => (
            <div key={g.id} className="p-5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><g.icon className="h-4 w-4 text-ink-3" aria-hidden />{g.group}</div>
              <p className="mt-0.5 text-[12.5px] text-ink-3">{g.blurb}</p>
              <ul className="mt-3 space-y-0.5">{g.items.map(m => <li key={m.to}><Link to={m.to} title={m.desc} className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 text-[14px] text-ink hover:bg-sunken hover:text-accent">{m.label}</Link></li>)}</ul>
            </div>
          ))}
        </Card>
      </section>

      <Section title="How an answer is built" desc="The same pipeline serves every module."><Pipeline /></Section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title="Retrieval quality by task" desc="Recall@5 with the fine-tuned encoder. Higher is better." actions={<Link to="/app/analytics" className="link text-[13px]">All results</Link>}>
          {ft.length ? <Chart height={300} data={[series("bm25", "BM25", C.warning), series("faiss", "Dense, fine-tuned", C.primary), series(ROUTED, "LawLine", C.fg)]} layout={{ barmode: "group", yaxis: { range: [0, 1], tickformat: ".1f" }, margin: { l: 36, r: 8, t: 8, b: 30 } }} /> : <Skeleton className="h-[300px]" />}
        </Section>
        <div className="space-y-6">
          <Section title="Recent activity" actions={<Link to="/app/files" className="link text-[13px]">{pinned} saved</Link>}>
            {recent.length ? <ul className="-my-1 divide-y divide-line">{recent.map((r, i) => <li key={i} className="flex items-baseline gap-3 py-2 text-[13.5px]"><Link to={r.to ?? "/app"} className="min-w-0 flex-1 truncate text-ink hover:text-accent">{r.text}</Link><span className="num shrink-0 text-[12px] text-ink-3">{new Date(r.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul> : <p className="text-[13.5px] text-ink-3">Questions you ask and documents you work on will be listed here.</p>}
          </Section>
          <Section title="Bridge of the day" desc="One mapping from the old criminal codes to the 2023 codes.">
            {pick ? <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-serif text-[20px] font-medium text-ink">{codeOf(pick.old_act)} s.{pick.old_section} <span className="text-ink-3">→</span> s.{pick.new_sections.join(", ")}</div><div className="mt-0.5 text-[13px] text-ink-3">{pick.concepts.slice(0, 3).join(" · ")}</div></div><Link to={`/app/transition?act=${codeOf(pick.old_act)}&section=${pick.old_section}`}><Button size="sm">Open</Button></Link></div> : <Skeleton className="h-12" />}
          </Section>
        </div>
      </div>
    </Page>
  );
}
