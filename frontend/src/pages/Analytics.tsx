import { useMemo, useState } from "react";
import { api, type Analytics as A, type Row } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Button, Card, Eyebrow, H2, Kpi, Select, Skeleton, ErrorBox } from "@/components/shell/ui";
import { Chart, C, PALETTE } from "@/lib/plotly";
import { cn } from "@/lib/utils";

const ROUTED = "routed: dense (narrative) | faiss+bm25+kg+rerank (question)";
const ORDER = ["bm25", "faiss", "kg", "faiss+bm25", "faiss+kg", "bm25+kg", "faiss+bm25+kg", "faiss+rerank", "bm25+rerank", "faiss+bm25+rerank", "faiss+bm25+kg+rerank", ROUTED];
const TASKS: [string, string][] = [["bns_qa", "BNS-QA"], ["ipc_facts", "IPC facts→section"], ["const_qa", "Constitution-QA"], ["sc_case", "SC case"], ["macro", "Macro"]];
const short = (c: string) => c === ROUTED ? "LawLine (routed)" : c;
const TABS = ["Retrieval ablation", "3D landscape", "Fine-tuning", "Reranking & routing", "Fusion sweep", "Chunking", "Latency", "Answer quality", "Raw"];

function Table({ rows, cols }: { rows: Row[]; cols?: string[] }) {
  const c = cols ?? Object.keys(rows[0] ?? {});
  return <div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-bg-elev font-mono text-[11px] uppercase text-muted"><tr>{c.map(k => <th key={k} className="p-2">{k}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[var(--border)]">{c.map(k => <td key={k} className="p-2 font-mono">{typeof r[k] === "number" ? (r[k] as number).toFixed(3) : String(r[k] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}
function Section({ title, sub, rows, children }: { title: string; sub?: string; rows?: Row[]; children: React.ReactNode }) {
  const [table, setTable] = useState(false);
  return <Card><div className="flex flex-wrap items-start justify-between gap-2"><div><H2 className="text-base">{title}</H2>{sub && <p className="text-xs text-muted">{sub}</p>}</div>{rows && <Button className="h-9" onClick={() => setTable(t => !t)}>{table ? "View chart" : "View as table"}</Button>}</div><div className="mt-3">{table && rows ? <Table rows={rows} /> : children}</div></Card>;
}

export default function AnalyticsPage() {
  const a = useFetch(() => api.get<A>("/analytics")); const [tab, setTab] = useState(0); const [metric, setMetric] = useState("R@5");
  const d = a.data;
  const get = (rows: Row[] | undefined, cfg: string, task: string, m: string) => Number(rows?.find(r => r.config === cfg && r.task === task)?.[m] ?? 0);
  const cfgs = useMemo(() => ORDER.filter(c => d?.ablation_ft.some(r => r.config === c)), [d]);
  if (a.error) return <ErrorBox error={a.error} />;
  if (!d) return <div className="grid gap-4"><Skeleton className="h-32" /><Skeleton className="h-96" /></div>;
  const ae = d.answer_eval as Record<string, Record<string, number>> | null;
  const tasks4 = TASKS.slice(0, 4);
  return (
    <div className="space-y-6">
      <Card><Eyebrow>Benchmark telemetry</Eyebrow><H2 className="mt-1">Analytics</H2><p className="mt-1 text-sm text-muted">Every number from the evaluation harness, interactive. 1,810 held-out queries · four tasks · ablations, fine-tuning, fusion, chunking, latency and answer quality. Drag 3D charts to rotate; every chart has a table view.</p></Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Macro R@5 · routed" value={get(d.ablation_ft, ROUTED, "macro", "R@5").toFixed(3)} sub={`BM25 ${get(d.ablation_ft, "bm25", "macro", "R@5").toFixed(3)}`} />
        <Kpi label="Macro nDCG@10" value={get(d.ablation_ft, ROUTED, "macro", "nDCG@10").toFixed(3)} delay={.04} />
        <Kpi label="AIBE accuracy" value={`${((ae?.aibe?.rag_acc ?? 0) * 100).toFixed(1)}%`} sub={`closed-book ${((ae?.aibe?.closed_book_acc ?? 0) * 100).toFixed(1)}%`} delay={.08} />
        <Kpi label="Faithfulness" value={`${(ae?.rag?.["faithfulness_mean(0-2)"] ?? 0).toFixed(2)}/2`} sub={`gold cited ${((ae?.rag?.gold_cited_rate ?? 0) * 100).toFixed(0)}%`} delay={.12} />
      </div>
      <div className="flex flex-wrap gap-1 rounded-[14px] border border-[var(--border)] bg-[var(--glass)] p-1">{TABS.map((t, i) => <button key={t} onClick={() => setTab(i)} className={cn("cursor-pointer rounded-[10px] px-3 py-2 font-display text-[11px] tracking-[0.06em] transition-colors", tab === i ? "bg-primary/15 text-primary" : "text-muted hover:text-fg")}>{t}</button>)}</div>

      {tab === 0 && <div className="space-y-4">
        <Select className="max-w-xs" value={metric} onChange={e => setMetric(e.target.value)} aria-label="Metric">{["R@1", "R@5", "R@10", "MRR@10", "nDCG@10"].map(m => <option key={m}>{m}</option>)}</Select>
        <Section title={`Macro ${metric} by retriever configuration`} sub="base encoder vs legal fine-tuned · same indices" rows={d.ablation_ft.filter(r => r.task === "macro")}>
          <Chart height={420} data={[{ type: "bar", name: "base encoder", x: cfgs.map(short), y: cfgs.map(c => get(d.ablation_base, c, "macro", metric)), marker: { color: C.muted } }, { type: "bar", name: "legal fine-tuned", x: cfgs.map(short), y: cfgs.map(c => get(d.ablation_ft, c, "macro", metric)), marker: { color: C.primary } }]} layout={{ barmode: "group", yaxis: { range: [0, 1] }, xaxis: { tickangle: -30 }, margin: { b: 120 } }} /></Section>
        <Section title={`${metric} per task · heat map`} sub="fine-tuned encoder" rows={d.ablation_ft}>
          <Chart height={420} data={[{ type: "heatmap", z: cfgs.map(c => tasks4.map(t => get(d.ablation_ft, c, t[0], metric))), x: tasks4.map(t => t[1]), y: cfgs.map(short), colorscale: [[0, "#0e1628"], [.5, C.secondary], [1, C.primary]], zmin: 0, zmax: 1, text: cfgs.map(c => tasks4.map(t => get(d.ablation_ft, c, t[0], metric).toFixed(2))) as never, texttemplate: "%{text}", hovertemplate: "%{y}<br>%{x}: %{z:.3f}<extra></extra>" }]} layout={{ margin: { l: 160 } }} /></Section>
      </div>}

      {tab === 1 && <div className="space-y-4">
        <Section title="Retrieval landscape · configuration × task × Recall@5" sub="3D surface — rotate, zoom, hover. Ridges are where a configuration wins across tasks." rows={d.ablation_ft}>
          <Chart height={560} data={[{ type: "surface", z: cfgs.map(c => tasks4.map(t => get(d.ablation_ft, c, t[0], "R@5"))), x: tasks4.map(t => t[1]), y: cfgs.map(short), colorscale: [[0, "#0e1628"], [.5, C.secondary], [1, C.primary]], cmin: 0, cmax: 1, opacity: .95, contours: { z: { show: true, usecolormap: true, project: { z: true } } }, hovertemplate: "%{y}<br>%{x}<br>R@5 %{z:.3f}<extra></extra>" } as never]} layout={{ scene: { camera: { eye: { x: 1.7, y: -1.6, z: .9 } }, xaxis: { title: { text: "task" } }, yaxis: { title: { text: "configuration" }, tickfont: { size: 9 } }, zaxis: { title: { text: "Recall@5" }, range: [0, 1] } }, margin: { l: 0, r: 0, t: 10, b: 0 } }} /></Section>
        <Section title="Base vs fine-tuned · 3D scatter" sub="each point is a (configuration, task); distance above the diagonal plane is the fine-tuning gain" rows={d.ablation_base}>
          <Chart height={520} data={[...tasks4.map((t, i) => ({ type: "scatter3d", mode: "markers+text", name: t[1], x: cfgs.map(c => get(d.ablation_base, c, t[0], "R@5")), y: cfgs.map(c => get(d.ablation_ft, c, t[0], "R@5")), z: cfgs.map(c => get(d.ablation_ft, c, t[0], "R@5") - get(d.ablation_base, c, t[0], "R@5")), text: cfgs.map(short), textposition: "top center", textfont: { size: 8, color: C.muted }, marker: { size: 6, color: PALETTE[i], opacity: .9 }, hovertemplate: "%{text}<br>base %{x:.3f} → ft %{y:.3f}<br>Δ %{z:+.3f}<extra>" + t[1] + "</extra>" } as never))]} layout={{ scene: { xaxis: { title: { text: "base R@5" }, range: [0, 1] }, yaxis: { title: { text: "fine-tuned R@5" }, range: [0, 1] }, zaxis: { title: { text: "gain" } }, camera: { eye: { x: 1.6, y: 1.4, z: .8 } } }, margin: { l: 0, r: 0, t: 10, b: 0 } }} /></Section>
      </div>}

      {tab === 2 && <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Bi-encoder fine-tuning" sub="MultipleNegativesRankingLoss · CPU · frozen lower 6 layers" rows={(d.train_biencoder?.loss_history ?? []) as never}>
          <Chart height={320} data={[{ type: "scatter", mode: "lines", x: d.train_biencoder?.loss_history.map(h => h.step), y: d.train_biencoder?.loss_history.map(h => h.loss), line: { color: C.primary, width: 2, shape: "spline" }, fill: "tozeroy", fillcolor: "rgba(0,229,255,.08)" }]} layout={{ xaxis: { title: { text: "step" } }, yaxis: { title: { text: "loss" } } }} /></Section>
        <Section title="Cross-encoder fine-tuning" sub="BCE · reported, not shipped" rows={(d.train_reranker?.loss_history ?? []) as never}>
          <Chart height={320} data={[{ type: "scatter", mode: "lines", x: d.train_reranker?.loss_history.map(h => h.step), y: d.train_reranker?.loss_history.map(h => h.loss), line: { color: C.secondary, width: 2, shape: "spline" }, fill: "tozeroy", fillcolor: "rgba(124,77,255,.08)" }]} layout={{ xaxis: { title: { text: "step" } }, yaxis: { title: { text: "loss" } } }} /></Section>
        <Card className="lg:col-span-2"><H2 className="text-base">Dense retriever before / after fine-tuning</H2>
          <Chart height={340} data={[{ type: "bar", name: "base", x: TASKS.map(t => t[1]), y: TASKS.map(t => get(d.ablation_base, "faiss", t[0], "R@5")), marker: { color: C.muted } }, { type: "bar", name: "fine-tuned", x: TASKS.map(t => t[1]), y: TASKS.map(t => get(d.ablation_ft, "faiss", t[0], "R@5")), marker: { color: C.primary } }]} layout={{ barmode: "group", yaxis: { range: [0, 1], title: { text: "Recall@5" } } }} /></Card>
      </div>}

      {tab === 3 && <Section title="Recall@5 by reranking strategy" sub="a generic web reranker collapses narrative fact patterns; a one-epoch legal reranker forgets general relevance; routing keeps the best of both" rows={d.ablation_ft_legalce}>
        <Chart height={420} data={[["no reranker", d.ablation_ft, "faiss+bm25+kg", C.muted], ["generic cross-encoder", d.ablation_ft, "faiss+bm25+kg+rerank", C.warning], ["legal cross-encoder (1 ep)", d.ablation_ft_legalce, "faiss+bm25+kg+rerank", C.danger], ["dense only", d.ablation_ft, "faiss", C.secondary], ["LawLine routed", d.ablation_ft, ROUTED, C.primary]].map(([n, rows, cfg, col]) => ({ type: "bar", name: n as string, x: TASKS.map(t => t[1]), y: TASKS.map(t => get(rows as Row[], cfg as string, t[0], "R@5")), marker: { color: col as string } }))} layout={{ barmode: "group", yaxis: { range: [0, 1] } }} /></Section>}

      {tab === 4 && <Section title="RRF weight / k sensitivity" sub="full hybrid without reranker · boosting exact KG hits hurts R@1 because one concept maps to sibling provisions" rows={d.ablation_ft.filter(r => r.task === "macro" && String(r.config).includes("["))}>
        <Chart height={420} data={["R@1", "R@5", "nDCG@10"].map((m, i) => { const rows = d.ablation_ft.filter(r => r.task === "macro" && String(r.config).includes("[")); return { type: "bar", name: m, x: rows.map(r => String(r.config).replace("faiss+bm25+kg", "")), y: rows.map(r => Number(r[m])), marker: { color: PALETTE[i] } }; })} layout={{ barmode: "group", yaxis: { range: [0, 1] }, xaxis: { tickangle: -20 }, margin: { b: 100 } }} /></Section>}

      {tab === 5 && <div className="space-y-4">
        <Section title="Chunk-size sweep" sub="core sub-corpus · re-chunked, re-embedded and re-indexed per setting" rows={d.chunk_sweep}>
          <Chart height={380} data={["faiss", "bm25", "faiss+bm25"].map((r, i) => { const rows = d.chunk_sweep.filter(x => x.retriever === r); return { type: "scatter", mode: "lines+markers", name: r, x: rows.map(x => x.chunk_words), y: rows.map(x => x["R@5"]), line: { color: PALETTE[i], shape: "spline" }, marker: { size: 8 } }; })} layout={{ xaxis: { title: { text: "chunk size (words)" } }, yaxis: { title: { text: "Recall@5" } } }} /></Section>
        <Section title="Chunking in 3D · size × task × Recall@5 (dense)" rows={d.chunk_sweep}>
          {(() => { const rows = d.chunk_sweep.filter(x => x.retriever === "faiss"); const cols = ["bns_qa_R@5", "ipc_facts_R@5", "const_qa_R@5", "sc_case_R@5"]; return <Chart height={480} data={[{ type: "surface", x: ["BNS-QA", "IPC facts", "Const-QA", "SC case"], y: rows.map(x => x.chunk_words), z: rows.map(x => cols.map(c => Number(x[c]))), colorscale: [[0, "#0e1628"], [.5, C.secondary], [1, C.primary]], cmin: 0, cmax: 1 } as never]} layout={{ scene: { xaxis: { title: { text: "task" } }, yaxis: { title: { text: "chunk words" } }, zaxis: { title: { text: "R@5" }, range: [0, 1] }, camera: { eye: { x: -1.6, y: -1.6, z: .9 } } }, margin: { l: 0, r: 0, t: 10, b: 0 } }} />; })()}</Section>
      </div>}

      {tab === 6 && d.latency && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[["embed_single", "query embed", 60], ["faiss", "FAISS", 10], ["bm25", "BM25", 3000], ["kg", "KG", 200], ["rerank_per_pair", "rerank / pair", 20]].map(([k, l, mx]) => <Card key={k as string} className="p-2"><Chart height={170} data={[{ type: "indicator", mode: "gauge+number", value: d.latency![k as string]?.p50_ms ?? 0, number: { suffix: " ms", font: { family: "Orbitron", color: C.primary, size: 18 } }, title: { text: `${l} p50`, font: { size: 11, color: C.muted } }, gauge: { axis: { range: [0, mx as number] }, bar: { color: C.primary, thickness: .3 }, bgcolor: "rgba(255,255,255,.03)", borderwidth: 0 } } as never]} layout={{ margin: { l: 10, r: 10, t: 30, b: 0 } }} /></Card>)}</div>
        <Section title="Per-stage latency · p50 vs p95 (log)" sub="Apple M-series laptop · BM25 p95 is dominated by 300-word fact narratives, which the router bypasses">
          {(() => { const ks = Object.keys(d.latency!).filter(k => k !== "embed_batch_total_ms"); return <Chart height={360} data={[{ type: "bar", name: "p50", x: ks, y: ks.map(k => d.latency![k].p50_ms), marker: { color: C.primary } }, { type: "bar", name: "p95", x: ks, y: ks.map(k => d.latency![k].p95_ms), marker: { color: C.secondary } }]} layout={{ barmode: "group", yaxis: { type: "log", title: { text: "ms" } } }} />; })()}</Section>
      </div>}

      {tab === 7 && ae && <div className="grid gap-4 lg:grid-cols-2">
        <Section title="AIBE multiple-choice accuracy" sub={`n=${ae.aibe.n} · same generator with and without retrieval`}>
          <Chart height={340} data={[{ type: "bar", x: ["closed-book", "LawLine RAG"], y: [ae.aibe.closed_book_acc, ae.aibe.rag_acc], marker: { color: [C.muted, C.primary] }, text: [ae.aibe.closed_book_acc, ae.aibe.rag_acc].map(v => `${(v * 100).toFixed(1)}%`), textposition: "outside" }]} layout={{ yaxis: { range: [0, 1] } }} /></Section>
        <Section title="Judged answer quality" sub={`n=${ae.rag.n} · judge: independent model`} rows={d.grounded}>
          <Chart height={340} data={[{ type: "bar", name: "closed-book", x: ["correctness", "faithfulness", "fully correct", "fabricated cit."], y: [ae.closed["correctness_mean(0-2)"] / 2, ae.closed["faithfulness_mean(0-2)"] / 2, ae.closed.fully_correct_rate, ae.closed.fabricated_citation_rate], marker: { color: C.muted } }, { type: "bar", name: "LawLine RAG", x: ["correctness", "faithfulness", "fully correct", "fabricated cit."], y: [ae.rag["correctness_mean(0-2)"] / 2, ae.rag["faithfulness_mean(0-2)"] / 2, ae.rag.fully_correct_rate, ae.rag.fabricated_citation_rate], marker: { color: C.success } }]} layout={{ barmode: "group", yaxis: { range: [0, 1] } }} /></Section>
        <Card className="lg:col-span-2"><H2 className="text-base">Grounding funnel</H2><Chart height={300} data={[{ type: "funnel", y: ["answered", "gold provision retrieved (top-5)", "gold provision cited", "fully correct"], x: [1, ae.rag.retrieval_hit_rate, ae.rag.gold_cited_rate, ae.rag.fully_correct_rate], marker: { color: [C.muted, C.secondary, C.primary, C.success] }, texttemplate: "%{x:.0%}" } as never]} /></Card>
      </div>}

      {tab === 8 && <div className="space-y-4"><Card><H2 className="text-base">ablation_ft</H2><Table rows={d.ablation_ft} cols={["config", "task", "R@1", "R@5", "R@10", "MRR@10", "nDCG@10"]} /></Card><Card><H2 className="text-base">ablation_base</H2><Table rows={d.ablation_base} cols={["config", "task", "R@1", "R@5", "R@10", "MRR@10", "nDCG@10"]} /></Card><Card><H2 className="text-base">chunk_sweep</H2><Table rows={d.chunk_sweep} /></Card></div>}
    </div>
  );
}
