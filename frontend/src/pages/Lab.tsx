import { useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Badge, Button, Card, Eyebrow, H2, Input, Select, Skeleton, ErrorBox } from "@/components/shell/ui";
import { Chart, C } from "@/lib/plotly";

type Item = { chunk_id: string; citation: string; doc_type: string };
type Trace = { route: string; mentions: Record<string, string[]>; per_retriever: Record<string, Item[]>; fused: Item[]; final: { rank: number; chunk_id: string; citation: string; score: number; sources: string[]; text: string }[]; timings_ms: Record<string, number> };
const COL: Record<string, string> = { faiss: C.primary, bm25: C.warning, kg: C.secondary };

export default function Lab() {
  const [q, setQ] = useState("Which IPC sections apply when a husband harasses his wife for dowry?"); const [scope, setScope] = useState("all"); const [route, setRoute] = useState(true);
  const [t, setT] = useState<Trace | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function run() { setBusy(true); setErr(null); try { setT(await api.post<Trace>("/retrieve/trace", { question: q, doc_types: scope === "all" ? [] : [scope], auto_route: route, final_k: 6 })); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  const gauge = (k: string, label: string, color: string, max: number) => ({ type: "indicator" as const, mode: "gauge+number" as const, value: t?.timings_ms[k] ?? 0, number: { suffix: " ms", font: { family: "Orbitron", color, size: 20 } }, title: { text: label, font: { size: 11, color: C.muted } }, gauge: { axis: { range: [0, Math.max(max, (t?.timings_ms[k] ?? 0) * 1.3)], tickcolor: C.muted }, bar: { color, thickness: .3 }, bgcolor: "rgba(255,255,255,.03)", borderwidth: 0 } });
  const rankOf = (name: string, id: string) => { const i = t?.per_retriever[name]?.findIndex(x => x.chunk_id === id) ?? -1; return i >= 0 ? i + 1 : null; };
  return (
    <div className="space-y-6">
      <Card><Eyebrow>Diagnostics mode</Eyebrow><H2 className="mt-1">Retrieval Lab</H2><p className="mt-1 text-sm text-muted">Each retriever's ranking, how reciprocal-rank fusion merges them, what the cross-encoder promotes, and where the milliseconds go.</p>
        <form className="mt-4 grid gap-2 md:grid-cols-[1fr_180px_160px_120px]" onSubmit={e => { e.preventDefault(); void run(); }}>
          <Input aria-label="Query" value={q} onChange={e => setQ(e.target.value)} />
          <Select aria-label="Scope" value={scope} onChange={e => setScope(e.target.value)}><option value="all">All sources</option><option value="statute">Statutes</option><option value="case">Cases</option></Select>
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--border)] px-3 text-sm"><input type="checkbox" checked={route} onChange={e => setRoute(e.target.checked)} className="accent-[var(--primary)]" />Auto-route</label>
          <Button variant="primary" type="submit" disabled={busy}>{busy ? "Tracing…" : "Trace"}</Button>
        </form></Card>
      {err && <ErrorBox error={err} retry={run} />}
      {busy && !t && <Skeleton className="h-64" />}
      {t && (<>
        <Card className="font-mono text-xs text-muted">route: <b className="text-fg">{t.route === "narrative" ? "NARRATIVE → dense only" : "QUESTION → full hybrid + rerank"}</b> · KG mentions: acts {t.mentions.acts?.length ?? 0} · sections {JSON.stringify(t.mentions.sections)} · articles {JSON.stringify(t.mentions.articles)} · concepts {JSON.stringify(t.mentions.concepts)}</Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[["embed", "query embed", C.primary, 60], ["faiss", "FAISS", C.primary, 20], ["bm25", "BM25", C.warning, 400], ["kg", "KG", C.secondary, 120], ["rerank", "rerank", C.success, 600]].map(([k, l, c, m]) => <Card key={k as string} className="p-2"><Chart height={150} data={[gauge(k as string, l as string, c as string, m as number) as never]} layout={{ margin: { l: 10, r: 10, t: 30, b: 0 } }} /></Card>)}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {["faiss", "bm25", "kg"].map(name => (<Card key={name}><div className="mb-2 flex items-center justify-between"><H2 className="text-base" >{name.toUpperCase()}</H2><span className="font-mono text-[11px] text-muted">{t.per_retriever[name]?.length ?? 0} candidates</span></div>
            <ol className="space-y-1">{(t.per_retriever[name] ?? []).slice(0, 8).map((x, i) => <motion.li key={x.chunk_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .03 }} className="rounded-[8px] border-l-[3px] bg-white/[.02] px-2 py-1.5 text-[12px]" style={{ borderLeftColor: COL[name] }}><span className="font-mono text-muted">{i + 1}.</span> {x.citation.slice(0, 70)}</motion.li>)}</ol></Card>))}
        </div>
        <Card><H2 className="text-base">Fusion → reranking</H2>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="font-mono text-[11px] uppercase text-muted"><tr><th className="p-2">fused</th><th className="p-2">passage</th><th className="p-2">faiss</th><th className="p-2">bm25</th><th className="p-2">kg</th><th className="p-2">final</th></tr></thead>
            <tbody>{t.fused.slice(0, 15).map((x, i) => { const f = t.final.find(y => y.chunk_id === x.chunk_id); return <tr key={x.chunk_id} className={`border-t border-[var(--border)] ${f ? "bg-success/5" : ""}`}><td className="p-2 font-mono">{i + 1}</td><td className="p-2">{x.citation.slice(0, 60)}</td><td className="p-2 font-mono">{rankOf("faiss", x.chunk_id) ?? "—"}</td><td className="p-2 font-mono">{rankOf("bm25", x.chunk_id) ?? "—"}</td><td className="p-2 font-mono">{rankOf("kg", x.chunk_id) ?? "—"}</td><td className="p-2 font-mono text-success">{f ? f.rank : "—"}</td></tr>; })}</tbody></table></div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><H2 className="text-base">Final passages · reranker score</H2>
            <Chart height={60 + 40 * t.final.length} data={[{ type: "bar", orientation: "h", x: t.final.map(p => p.score), y: t.final.map(p => `[${p.rank}] ${p.citation.slice(0, 40)}`), marker: { color: t.final.map(p => p.score), colorscale: [[0, C.secondary], [1, C.primary]] } }]} layout={{ yaxis: { autorange: "reversed" }, margin: { l: 220, r: 10, t: 10, b: 30 } }} /></Card>
          <Card><H2 className="text-base">Which retriever surfaced each passage</H2>
            <Chart height={60 + 40 * t.final.length} data={[{ type: "sankey", node: { pad: 12, thickness: 14, line: { width: 0 }, color: [C.primary, C.warning, C.secondary, ...t.final.map(() => C.success)], label: ["FAISS", "BM25", "KG", ...t.final.map(p => `[${p.rank}] ${p.citation.slice(0, 28)}`)] },
              link: { source: t.final.flatMap(p => p.sources.filter(s => s in COL).map(s => ["faiss", "bm25", "kg"].indexOf(s))), target: t.final.flatMap((p, j) => p.sources.filter(s => s in COL).map(() => 3 + j)), value: t.final.flatMap(p => p.sources.filter(s => s in COL).map(() => 1)), color: "rgba(0,229,255,.18)" } } as never]} /></Card>
        </div>
        <Card><H2 className="text-base">Passages</H2><div className="mt-2 grid gap-2">{t.final.map(p => <div key={p.chunk_id} className="rounded-[10px] border border-[var(--border)] p-3 text-[13px]"><Badge>[{p.rank}]</Badge><b>{p.citation}</b> {p.sources.map(s => <Badge key={s} kind={s}>{s}</Badge>)}<p className="mt-1 text-muted">{p.text}</p></div>)}</div></Card>
      </>)}
    </div>
  );
}
