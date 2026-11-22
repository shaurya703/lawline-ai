import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Field, Input, Page, Passages, Section, Select, Skeleton, Source, Stat, StatStrip, Tag } from "@/components/ui";
import { Chart, C, SEQ } from "@/lib/plotly";
import { Microscope } from "lucide-react";

type Item = { chunk_id: string; citation: string; doc_type: string };
type Trace = { route: string; mentions: Record<string, string[]>; per_retriever: Record<string, Item[]>; fused: Item[]; final: { rank: number; chunk_id: string; citation: string; score: number; sources: string[]; text: string }[]; timings_ms: Record<string, number> };
const RETRIEVERS = ["faiss", "bm25", "kg"] as const;
const COL: Record<string, string> = { faiss: C.primary, bm25: C.warning, kg: C.secondary };
const TIMINGS: [string, string][] = [["embed", "Query embedding"], ["faiss", "Dense search"], ["bm25", "BM25 search"], ["kg", "Graph lookup"], ["rerank", "Reranking"]];
const MENTIONS: [string, string][] = [["acts", "Acts"], ["sections", "Sections"], ["articles", "Articles"], ["concepts", "Concepts"], ["cases", "Cases"]];
const ms = (v?: number) => v === undefined ? "n/a" : v >= 100 ? `${Math.round(v)} ms` : `${v.toFixed(1)} ms`;
const pretty = (s: string) => s.replace(/^act:/, "").replace(/-/g, " ").replace(/\b[a-z]/g, c => c.toUpperCase());

export default function Lab() {
  const [q, setQ] = useState("Which IPC sections apply when a husband harasses his wife for dowry?"); const [scope, setScope] = useState("all"); const [route, setRoute] = useState(true);
  const [t, setT] = useState<Trace | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function run() { if (!q.trim()) return; setBusy(true); setErr(null); try { setT(await api.post<Trace>("/retrieve/trace", { question: q, doc_types: scope === "all" ? [] : [scope], auto_route: route, final_k: 6 })); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  const rankOf = (name: string, id: string) => { const i = t?.per_retriever[name]?.findIndex(x => x.chunk_id === id) ?? -1; return i >= 0 ? i + 1 : null; };
  const total = t ? TIMINGS.reduce((n, [k]) => n + (t.timings_ms[k] ?? 0), 0) : 0;
  const mentions = t ? MENTIONS.map(([k, l]) => [l, t.mentions[k] ?? []] as const).filter(([, v]) => v.length > 0) : [];
  const links = t ? t.final.flatMap((p, j) => p.sources.filter(s => s in COL).map(s => ({ s: RETRIEVERS.indexOf(s as (typeof RETRIEVERS)[number]), t: 3 + j }))) : [];
  return (
    <Page title="Retrieval Lab" desc="Trace one query through the pipeline: what each retriever ranked, how fusion merged the lists, what the reranker promoted, and where the time went.">
      <Card>
        <form className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_170px_auto_auto]" onSubmit={e => { e.preventDefault(); void run(); }}>
          <Field label="Query"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="A question or a fact pattern" /></Field>
          <Field label="Sources"><Select value={scope} onChange={e => setScope(e.target.value)}><option value="all">All</option><option value="statute">Statutes only</option><option value="case">Case law only</option></Select></Field>
          <label className="flex h-10 cursor-pointer items-center gap-2 text-[14px] text-ink" title="Long fact narratives go to dense retrieval only; questions use all three retrievers and the reranker."><input type="checkbox" checked={route} onChange={e => setRoute(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" />Route by query type</label>
          <Button variant="primary" type="submit" disabled={busy || !q.trim()}>{busy ? "Tracing…" : "Trace"}</Button>
        </form>
      </Card>
      {err && <ErrorBox error={err} retry={run} />}
      {busy && !t && <><Skeleton className="h-[104px]" /><Skeleton className="h-72" /></>}
      {!t && !busy && !err && <Empty icon={<Microscope className="h-7 w-7" />} title="No trace yet" desc="Run the query above to see the three ranked lists, the fused list, the reranked result and the time spent at each stage." />}
      {t && (<>
        <Card className="space-y-2.5 text-[14px]">
          <p><span className="text-ink-3">Route</span> <span className="font-medium text-ink">{t.route === "narrative" ? "Narrative: dense retrieval only" : "Question: dense, BM25 and graph, fused and reranked"}</span></p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5"><span className="text-ink-3">Recognised in the query</span>{mentions.length ? mentions.map(([l, v]) => <span key={l} className="flex flex-wrap items-center gap-1.5"><span className="text-[13px] text-ink-2">{l}</span>{v.map(x => <Tag key={x}>{l === "Acts" ? pretty(x) : x}</Tag>)}</span>) : <span className="text-ink-2">nothing the knowledge graph could anchor on</span>}</div>
        </Card>

        <StatStrip>
          {TIMINGS.filter(([k]) => t.timings_ms[k] !== undefined).map(([k, l]) => <Stat key={k} label={l} value={ms(t.timings_ms[k])} sub={total ? `${Math.round((t.timings_ms[k] / total) * 100)}% of retrieval` : undefined} />)}
          <Stat label="Total" value={ms(total)} sub="before generation" />
        </StatStrip>

        <div className="grid gap-6 md:grid-cols-3">
          {RETRIEVERS.map(name => { const list = t.per_retriever[name] ?? []; return (
            <Section key={name} title={<Source name={name} />} desc={`${list.length} candidates, top 8 shown`}>
              {list.length ? <ol className="-my-1 divide-y divide-line">{list.slice(0, 8).map((x, i) => <li key={x.chunk_id} className="flex gap-2.5 py-2 text-[13px]"><span className="num w-4 shrink-0 text-right font-mono text-[12px] text-ink-3">{i + 1}</span><span className="min-w-0 text-ink" title={x.citation}>{x.citation.slice(0, 78)}{x.citation.length > 78 ? "…" : ""}</span></li>)}</ol> : <p className="text-[13.5px] text-ink-3">{t.route === "narrative" && name !== "faiss" ? "Skipped on the narrative route." : "No candidates."}</p>}
            </Section>); })}
        </div>

        <Section title="Fusion, then reranking" desc="The fused list in order, with each passage's rank in every retriever and its final rank after the cross-encoder. Highlighted rows made the final set." flush>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th className="text-right">Fused</th><th>Passage</th><th className="text-right">Dense</th><th className="text-right">BM25</th><th className="text-right">Graph</th><th className="text-right">Final</th></tr></thead>
            <tbody>{t.fused.slice(0, 15).map((x, i) => { const f = t.final.find(y => y.chunk_id === x.chunk_id); return (
              <tr key={x.chunk_id} className={f ? "bg-ok-soft" : ""}><td className="mono text-right">{i + 1}</td><td title={x.citation}>{x.citation.slice(0, 84)}{x.citation.length > 84 ? "…" : ""}</td>{RETRIEVERS.map(r => <td key={r} className="mono text-right">{rankOf(r, x.chunk_id) ?? "–"}</td>)}<td className="mono text-right font-medium">{f ? f.rank : "–"}</td></tr>); })}</tbody>
          </table></div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Reranker score of the final passages" desc="Cross-encoder relevance to the exact query. Higher is more relevant.">
            <Chart height={70 + 38 * t.final.length} data={[{ type: "bar", orientation: "h", x: t.final.map(p => p.score), y: t.final.map(p => `[${p.rank}] ${p.citation.slice(0, 38)}${p.citation.length > 38 ? "…" : ""}`), marker: { color: t.final.map(p => p.score), colorscale: SEQ, cmin: Math.min(0, ...t.final.map(p => p.score)) - 1 }, hovertemplate: "%{y}<br>score %{x:.2f}<extra></extra>" } as never]}
              layout={{ xaxis: { showgrid: true }, yaxis: { autorange: "reversed", showgrid: false }, margin: { l: 8, r: 16, t: 8, b: 30 } }} />
          </Section>
          <Section title="Which retriever surfaced each passage" desc="A band joins a retriever to every final passage it nominated; a passage with several bands was found more than one way.">
            {links.length ? <Chart height={70 + 38 * t.final.length} data={[{ type: "sankey", arrangement: "snap", node: { pad: 12, thickness: 12, line: { width: 0 }, color: [C.primary, C.warning, C.secondary, ...t.final.map(() => C.muted)], label: ["Dense", "BM25", "Graph", ...t.final.map(p => `[${p.rank}] ${p.citation.slice(0, 30)}${p.citation.length > 30 ? "…" : ""}`)] }, link: { source: links.map(l => l.s), target: links.map(l => l.t), value: links.map(() => 1), color: C.grid } } as never]} layout={{ margin: { l: 8, r: 8, t: 8, b: 8 }, font: { size: 11 } }} /> : <p className="text-[13.5px] text-ink-3">No retriever attribution was recorded for these passages.</p>}
          </Section>
        </div>

        <section aria-labelledby="final-passages"><h2 id="final-passages" className="mb-3 text-[15px] font-semibold text-ink">Final passages</h2><Passages items={t.final} /></section>
      </>)}
    </Page>
  );
}
