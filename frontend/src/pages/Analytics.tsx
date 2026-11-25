import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Analytics as A, type Row } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Button, Empty, ErrorBox, Field, Page, Section, Select, Skeleton, Stat, StatStrip } from "@/components/ui";
import { Chart, C, PALETTE, SEQ } from "@/lib/plotly";
import { cn } from "@/lib/utils";

const ROUTED = "routed: dense (narrative) | faiss+bm25+kg+rerank (question)";
const ORDER = ["bm25", "faiss", "kg", "faiss+bm25", "faiss+kg", "bm25+kg", "faiss+bm25+kg", "faiss+rerank", "bm25+rerank", "faiss+bm25+rerank", "faiss+bm25+kg+rerank", ROUTED];
const TASKS: [string, string][] = [["bns_qa", "BNS questions"], ["ipc_facts", "IPC fact patterns"], ["const_qa", "Constitution"], ["sc_case", "SC case retrieval"], ["macro", "Macro average"]];
const METRICS = ["R@1", "R@5", "R@10", "MRR@10", "nDCG@10"];
const PART: Record<string, string> = { faiss: "Dense", bm25: "BM25", kg: "Graph", rerank: "Rerank" };
/** "faiss+bm25+kg+rerank" → "Dense + BM25 + Graph + Rerank"; fusion-sweep variants keep only their parameters. */
const short = (c: string) => c === ROUTED ? "LawLine (routed)" : c.includes("[") ? c.slice(c.indexOf("[") + 1, -1).replace(/,/g, ", ") : c.split("+").map(p => PART[p] ?? p).join(" + ");

const VIEWS = [
  { group: "Retrieval", items: [["ablation", "Ablation"], ["landscape", "Landscape (3D)"], ["fusion", "Fusion sweep"], ["chunking", "Chunking"]] },
  { group: "Models", items: [["finetune", "Fine-tuning"], ["rerank", "Reranking and routing"]] },
  { group: "System", items: [["latency", "Latency"]] },
  { group: "Answers", items: [["quality", "Answer quality"]] },
  { group: "Data", items: [["corpus", "Corpus v1 and v2"], ["raw", "Raw tables"]] },
] as const;
type View = (typeof VIEWS)[number]["items"][number][0];
const VIEW_IDS = VIEWS.flatMap(g => g.items.map(i => i[0])) as readonly string[];

const cell = (v: unknown, key: string) => typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(3)) : typeof v === "boolean" ? (v ? "yes" : "no") : v == null ? "" : key === "config" ? short(String(v)) : String(v);
function Table({ rows, cols, tall }: { rows: Row[]; cols?: string[]; tall?: boolean }) {
  const c = cols ?? Object.keys(rows[0] ?? {});
  if (!rows.length) return <p className="text-[13.5px] text-ink-3">No rows.</p>;
  return (
    <div className={cn("overflow-auto rounded-md border border-line", tall ? "max-h-[560px]" : "max-h-[420px]")}>
      <table className="tbl">
        <thead className="sticky"><tr>{c.map(k => <th key={k} className={typeof rows[0][k] === "number" ? "text-right" : ""}>{k}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{c.map(k => { const s = cell(r[k], k); const num = typeof r[k] === "number"; return <td key={k} className={num ? "mono text-right" : "max-w-[340px] truncate"} title={!num && s.length > 48 ? s : undefined}>{s}</td>; })}</tr>)}</tbody>
      </table>
    </div>
  );
}
/** One chart with its title (what is measured), its takeaway, and a switch to the underlying table. */
function Figure({ title, desc, rows, cols, children }: { title: string; desc?: ReactNode; rows?: Row[]; cols?: string[]; children: ReactNode }) {
  const [table, setTable] = useState(false);
  return <Section title={title} desc={desc} actions={rows && <Button size="sm" onClick={() => setTable(t => !t)} aria-pressed={table}>{table ? "View chart" : "View as table"}</Button>}>{table && rows ? <Table rows={rows} cols={cols} /> : children}</Section>;
}

export default function AnalyticsPage() {
  const a = useFetch(() => api.get<A>("/analytics")); const [params, setParams] = useSearchParams(); const [metric, setMetric] = useState("R@5");
  const view = (VIEW_IDS.includes(params.get("view") ?? "") ? params.get("view") : "ablation") as View;
  const setView = (v: string) => setParams(v === "ablation" ? {} : { view: v }, { replace: true });
  const d = a.data;
  const get = (rows: Row[] | undefined | null, cfg: string, task: string, m: string) => Number(rows?.find(r => r.config === cfg && r.task === task)?.[m] ?? 0);
  const cfgs = useMemo(() => ORDER.filter(c => d?.ablation_ft.some(r => r.config === c)), [d]);
  if (a.error) return <Page title="Analytics"><ErrorBox error={a.error} retry={() => location.reload()} /></Page>;
  const desc = "Every number from the evaluation harness: 1,810 held-out queries across four tasks, with ablations, fine-tuning, fusion, chunking, latency and answer quality. Each chart can be read as a table.";
  if (!d) return <Page title="Analytics" desc={desc}><Skeleton className="h-[104px]" /><Skeleton className="h-[480px]" /></Page>;
  const ae = d.answer_eval as Record<string, Record<string, number>> | null; const cv = d.corpus_versions;
  /** " Measured on the v1 corpus…" when a stored result is older than the corpus being served, else "". */
  const old = (k: string) => d.measured_on && d.measured_on[k] !== d.corpus_version ? ` Measured on the ${d.measured_on[k]} corpus and not re-run since.` : "";
  const oldTag = (k: string) => d.measured_on && d.measured_on[k] !== d.corpus_version ? ` · ${d.measured_on[k]} corpus` : "";
  // The legal reranker is compared with the runs made on the corpus it was measured on, when those are archived.
  const rrOld = !!old("reranker_legal") && !!cv?.v1.ablation_ft.length; const rr = rrOld ? cv!.v1.ablation_ft : d.ablation_ft;
  const tasks4 = TASKS.slice(0, 4); const f3 = (n: number) => n.toFixed(3); const pct = (n: number, p = 0) => `${(n * 100).toFixed(p)}%`;
  const macro = (rows: Row[], cfg: string) => get(rows, cfg, "macro", metric);
  const sweep = d.ablation_ft.filter(r => r.task === "macro" && String(r.config).includes("["));
  const ABL_COLS = ["config", "task", ...METRICS, "n"];
  const line = (h: { loss_history: { step: number; loss: number }[] } | null, color: string) => ({ type: "scatter" as const, mode: "lines" as const, x: h?.loss_history.map(p => p.step), y: h?.loss_history.map(p => p.loss), line: { color, width: 2 }, hovertemplate: "step %{x}<br>loss %{y:.3f}<extra></extra>" });

  return (
    <Page title="Analytics" desc={desc}>
      <StatStrip>
        <Stat label="Macro Recall@5" value={f3(get(d.ablation_ft, ROUTED, "macro", "R@5"))} sub={`BM25 alone ${f3(get(d.ablation_ft, "bm25", "macro", "R@5"))}`} />
        <Stat label="Macro nDCG@10" value={f3(get(d.ablation_ft, ROUTED, "macro", "nDCG@10"))} sub={`BM25 alone ${f3(get(d.ablation_ft, "bm25", "macro", "nDCG@10"))}`} />
        <Stat label="Bar exam accuracy" value={pct(ae?.aibe?.rag_acc ?? 0, 1)} sub={`closed-book ${pct(ae?.aibe?.closed_book_acc ?? 0, 1)}${oldTag("answer_eval")}`} />
        <Stat label="Faithfulness" value={`${(ae?.rag?.["faithfulness_mean(0-2)"] ?? 0).toFixed(2)} / 2`} sub={`gold provision cited ${pct(ae?.rag?.gold_cited_rate ?? 0)}${oldTag("answer_eval")}`} />
      </StatStrip>

      <div className="grid items-start gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[76px]">
          <Field label="View" className="lg:hidden"><Select value={view} onChange={e => setView(e.target.value)}>{VIEWS.map(g => <optgroup key={g.group} label={g.group}>{g.items.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</optgroup>)}</Select></Field>
          <nav aria-label="Analytics views" className="hidden space-y-4 lg:block">
            {VIEWS.map(g => <div key={g.group}>
              <div className="mb-1 px-2.5 text-[12.5px] text-ink-3">{g.group}</div>
              {g.items.map(([id, l]) => <button key={id} onClick={() => setView(id)} aria-current={view === id ? "page" : undefined} className={cn("flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13.5px] transition-colors", view === id ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-ink/[.05] hover:text-ink")}>{l}</button>)}
            </div>)}
          </nav>
        </div>

        <div className="min-w-0 space-y-6">
          {view === "ablation" && <>
            <Field label="Metric" className="max-w-[200px]"><Select value={metric} onChange={e => setMetric(e.target.value)}>{METRICS.map(m => <option key={m}>{m}</option>)}</Select></Field>
            <Figure title={`Macro ${metric} by retriever configuration`} rows={d.ablation_ft.filter(r => r.task === "macro")} cols={ABL_COLS}
              desc={`Base encoder against the legally fine-tuned encoder on the same indices. Fine-tuning moves dense retrieval from ${f3(macro(d.ablation_base, "faiss"))} to ${f3(macro(d.ablation_ft, "faiss"))}; the routed system reaches ${f3(macro(d.ablation_ft, ROUTED))}.`}>
              <Chart height={Math.max(360, 44 * cfgs.length + 80)} data={[
                { type: "bar", orientation: "h", name: "Base encoder", y: cfgs.map(short), x: cfgs.map(c => macro(d.ablation_base, c)), marker: { color: C.muted }, hovertemplate: "%{y}<br>base %{x:.3f}<extra></extra>" },
                { type: "bar", orientation: "h", name: "Legally fine-tuned", y: cfgs.map(short), x: cfgs.map(c => macro(d.ablation_ft, c)), marker: { color: cfgs.map(c => c === ROUTED ? C.fg : C.primary) }, hovertemplate: "%{y}<br>fine-tuned %{x:.3f}<extra></extra>" },
              ]} layout={{ barmode: "group", xaxis: { range: [0, 1], showgrid: true, title: { text: `macro ${metric}` } }, yaxis: { autorange: "reversed", showgrid: false }, margin: { l: 8, r: 16, t: 8, b: 44 } }} />
            </Figure>
            <Figure title={`${metric} for each configuration and task`} desc="Fine-tuned encoder. Each row is a configuration and each column a task; darker cells score higher." rows={d.ablation_ft.filter(r => r.task !== "macro")} cols={ABL_COLS}>
              <Chart height={Math.max(360, 34 * cfgs.length + 70)} data={[{ type: "heatmap", z: cfgs.map(c => tasks4.map(t => get(d.ablation_ft, c, t[0], metric))), x: tasks4.map(t => t[1]), y: cfgs.map(short), colorscale: SEQ, zmin: 0, zmax: 1, xgap: 2, ygap: 2, text: cfgs.map(c => tasks4.map(t => get(d.ablation_ft, c, t[0], metric).toFixed(2))) as never, texttemplate: "%{text}", textfont: { size: 11 }, hovertemplate: "%{y}<br>%{x}: %{z:.3f}<extra></extra>", colorbar: { thickness: 10, outlinewidth: 0, tickfont: { size: 11, color: C.sub } } } as never]}
                layout={{ xaxis: { side: "top", showgrid: false }, yaxis: { autorange: "reversed", showgrid: false }, margin: { l: 8, r: 8, t: 30, b: 8 } }} />
            </Figure>
          </>}

          {view === "landscape" && <>
            <Figure title="Recall@5 across configuration and task" desc="The ablation grid drawn as a surface. Ridges are where a configuration holds up across every task. Drag to rotate, scroll to zoom." rows={d.ablation_ft.filter(r => r.task !== "macro")} cols={ABL_COLS}>
              <Chart height={540} data={[{ type: "surface", z: cfgs.map(c => tasks4.map(t => get(d.ablation_ft, c, t[0], "R@5"))), x: tasks4.map(t => t[1]), y: cfgs.map(short), colorscale: SEQ, cmin: 0, cmax: 1, opacity: 0.96, contours: { z: { show: true, usecolormap: true, project: { z: true } } }, colorbar: { thickness: 10, outlinewidth: 0, len: 0.6 }, hovertemplate: "%{y}<br>%{x}<br>R@5 %{z:.3f}<extra></extra>" } as never]}
                layout={{ scene: { camera: { eye: { x: 1.7, y: -1.6, z: 0.9 } }, xaxis: { title: { text: "task" } }, yaxis: { title: { text: "" }, tickfont: { size: 9 } }, zaxis: { title: { text: "Recall@5" }, range: [0, 1] } } as never, margin: { l: 0, r: 0, t: 0, b: 0 } }} />
            </Figure>
            <Figure title="Base against fine-tuned Recall@5" desc="Each point is one configuration on one task. Height is the gain from fine-tuning, so points high above the floor are where the legal encoder helps most." rows={d.ablation_base.filter(r => r.task !== "macro")} cols={ABL_COLS}>
              <Chart height={520} data={tasks4.map((t, i) => ({ type: "scatter3d", mode: "markers", name: t[1], x: cfgs.map(c => get(d.ablation_base, c, t[0], "R@5")), y: cfgs.map(c => get(d.ablation_ft, c, t[0], "R@5")), z: cfgs.map(c => get(d.ablation_ft, c, t[0], "R@5") - get(d.ablation_base, c, t[0], "R@5")), text: cfgs.map(short), marker: { size: 6, color: PALETTE[i], opacity: 0.9, line: { color: C.surface, width: 1 } }, hovertemplate: "%{text}<br>base %{x:.3f}, fine-tuned %{y:.3f}<br>gain %{z:+.3f}<extra>" + t[1] + "</extra>" } as never))}
                layout={{ scene: { xaxis: { title: { text: "base R@5" }, range: [0, 1] }, yaxis: { title: { text: "fine-tuned R@5" }, range: [0, 1] }, zaxis: { title: { text: "gain" } }, camera: { eye: { x: 1.6, y: 1.4, z: 0.8 } } } as never, margin: { l: 0, r: 0, t: 0, b: 0 }, legend: { orientation: "h", y: 0 } }} />
            </Figure>
          </>}

          {view === "fusion" && <Figure title="Sensitivity to fusion weights and RRF k" desc="Macro scores of the full hybrid without the reranker. Boosting exact graph hits lowers R@1, because one concept maps to several sibling provisions." rows={sweep} cols={ABL_COLS}>
            <Chart height={Math.max(340, 58 * sweep.length + 90)} data={["R@1", "R@5", "nDCG@10"].map((m, i) => ({ type: "bar" as const, orientation: "h" as const, name: m, y: sweep.map(r => short(String(r.config))), x: sweep.map(r => Number(r[m])), marker: { color: [C.muted, SEQ[1][1], SEQ[2][1]][i] }, hovertemplate: "%{y}<br>" + m + " %{x:.3f}<extra></extra>" }))}
              layout={{ barmode: "group", xaxis: { range: [0, 1], showgrid: true }, yaxis: { autorange: "reversed", showgrid: false }, margin: { l: 8, r: 16, t: 8, b: 44 } }} />
          </Figure>}

          {view === "chunking" && <>
            <Figure title="Recall@5 by chunk size" desc={`Core sub-corpus, re-chunked, re-embedded and re-indexed for each setting.${old("chunk_sweep")}`} rows={d.chunk_sweep}>
              <Chart height={360} data={([["faiss", "Dense", C.primary], ["bm25", "BM25", C.warning], ["faiss+bm25", "Dense + BM25", C.fg]] as const).map(([r, name, color]) => { const rows = d.chunk_sweep.filter(x => x.retriever === r); return { type: "scatter" as const, mode: "lines+markers" as const, name, x: rows.map(x => x.chunk_words), y: rows.map(x => x["R@5"]), line: { color, width: 2 }, marker: { size: 8, color, line: { color: C.surface, width: 2 } }, hovertemplate: name + "<br>%{x} words: %{y:.3f}<extra></extra>" }; })}
                layout={{ xaxis: { title: { text: "chunk size (words)" }, showgrid: false }, yaxis: { title: { text: "Recall@5" }, rangemode: "tozero" }, margin: { l: 52, r: 16, t: 8, b: 44 } }} />
            </Figure>
            <Figure title="Chunk size by task, dense retriever" desc="Recall@5 of the dense retriever as a surface over chunk size and task. Drag to rotate." rows={d.chunk_sweep.filter(x => x.retriever === "faiss")}>
              {(() => { const rows = d.chunk_sweep.filter(x => x.retriever === "faiss"); const cols = ["bns_qa_R@5", "ipc_facts_R@5", "const_qa_R@5", "sc_case_R@5"]; return <Chart height={480} data={[{ type: "surface", x: tasks4.map(t => t[1]), y: rows.map(x => x.chunk_words), z: rows.map(x => cols.map(c => Number(x[c]))), colorscale: SEQ, cmin: 0, cmax: 1, colorbar: { thickness: 10, outlinewidth: 0, len: 0.6 }, hovertemplate: "%{x}<br>%{y} words<br>R@5 %{z:.3f}<extra></extra>" } as never]} layout={{ scene: { xaxis: { title: { text: "task" } }, yaxis: { title: { text: "chunk words" } }, zaxis: { title: { text: "Recall@5" }, range: [0, 1] }, camera: { eye: { x: -1.6, y: -1.6, z: 0.9 } } } as never, margin: { l: 0, r: 0, t: 0, b: 0 } }} />; })()}
            </Figure>
          </>}

          {view === "finetune" && <>
            <Figure title="Dense retriever before and after fine-tuning" desc={`Recall@5 by task. IPC fact patterns go from ${get(d.ablation_base, "faiss", "ipc_facts", "R@5").toFixed(2)} to ${f3(get(d.ablation_ft, "faiss", "ipc_facts", "R@5"))} and BNS questions from ${get(d.ablation_base, "faiss", "bns_qa", "R@5").toFixed(2)} to ${get(d.ablation_ft, "faiss", "bns_qa", "R@5").toFixed(2)}, on sections held out of training.`} rows={[...d.ablation_base.filter(r => r.config === "faiss").map(r => ({ ...r, encoder: "base" })), ...d.ablation_ft.filter(r => r.config === "faiss").map(r => ({ ...r, encoder: "fine-tuned" }))]} cols={["encoder", "task", ...METRICS, "n"]}>
              <Chart height={340} data={[{ type: "bar", name: "Base encoder", x: TASKS.map(t => t[1]), y: TASKS.map(t => get(d.ablation_base, "faiss", t[0], "R@5")), marker: { color: C.muted }, hovertemplate: "%{x}<br>base %{y:.3f}<extra></extra>" }, { type: "bar", name: "Legally fine-tuned", x: TASKS.map(t => t[1]), y: TASKS.map(t => get(d.ablation_ft, "faiss", t[0], "R@5")), marker: { color: C.primary }, hovertemplate: "%{x}<br>fine-tuned %{y:.3f}<extra></extra>" }]} layout={{ barmode: "group", yaxis: { range: [0, 1], title: { text: "Recall@5" } }, margin: { l: 52, r: 16, t: 8, b: 30 } }} />
            </Figure>
            <div className="grid gap-6 xl:grid-cols-2">
              <Figure title="Bi-encoder training loss" desc="MultipleNegativesRankingLoss, trained on CPU with the lower six layers frozen." rows={d.train_biencoder?.loss_history as Row[] | undefined}>
                {d.train_biencoder ? <Chart height={300} data={[line(d.train_biencoder, C.primary)]} layout={{ xaxis: { title: { text: "step" }, showgrid: false }, yaxis: { title: { text: "loss" }, rangemode: "tozero" }, margin: { l: 52, r: 16, t: 8, b: 44 } }} /> : <Empty title="No training log" desc="The bi-encoder loss history was not found in the results folder." />}
              </Figure>
              <Figure title="Cross-encoder training loss" desc="Binary cross-entropy. This legal reranker is reported for comparison and is not the one shipped." rows={d.train_reranker?.loss_history as Row[] | undefined}>
                {d.train_reranker ? <Chart height={300} data={[line(d.train_reranker, C.secondary)]} layout={{ xaxis: { title: { text: "step" }, showgrid: false }, yaxis: { title: { text: "loss" }, rangemode: "tozero" }, margin: { l: 52, r: 16, t: 8, b: 44 } }} /> : <Empty title="No training log" desc="The cross-encoder loss history was not found in the results folder." />}
              </Figure>
            </div>
          </>}

          {view === "rerank" && <Figure title="Recall@5 by reranking strategy" desc={`A generic web reranker collapses on narrative fact patterns, and a legal reranker trained for one epoch forgets general relevance. Routing by query type keeps the best of both.${rrOld ? ` Measured on the ${d.measured_on.reranker_legal} corpus: the legal reranker was not re-run after the expansion.` : old("reranker_legal") ? " The legal reranker was measured on an older corpus than the other bars." : ""}`} rows={[...rr.filter(r => ["faiss+bm25+kg", "faiss+bm25+kg+rerank", "faiss", ROUTED].includes(String(r.config))).map(r => ({ ...r, reranker: r.config === "faiss+bm25+kg+rerank" ? "generic" : "none" })), ...d.ablation_ft_legalce.filter(r => r.config === "faiss+bm25+kg+rerank").map(r => ({ ...r, reranker: "legal (1 epoch)" }))]} cols={["config", "reranker", "task", ...METRICS]}>
            <Chart height={400} data={([["Hybrid, no reranker", rr, "faiss+bm25+kg", C.muted], ["Generic cross-encoder", rr, "faiss+bm25+kg+rerank", C.success], ["Legal cross-encoder, 1 epoch", d.ablation_ft_legalce, "faiss+bm25+kg+rerank", PALETTE[3]], ["Dense only", rr, "faiss", C.primary], ["LawLine (routed)", rr, ROUTED, C.fg]] as [string, Row[], string, string][]).map(([n, rows, cfg, col]) => ({ type: "bar" as const, name: n, x: TASKS.map(t => t[1]), y: TASKS.map(t => get(rows, cfg, t[0], "R@5")), marker: { color: col }, hovertemplate: "%{x}<br>" + n + " %{y:.3f}<extra></extra>" }))}
              layout={{ barmode: "group", yaxis: { range: [0, 1], title: { text: "Recall@5" } }, margin: { l: 52, r: 16, t: 8, b: 30 } }} />
          </Figure>}

          {view === "latency" && (d.latency ? (() => { const L = d.latency!; const ks = Object.keys(L).filter(k => k !== "embed_batch_total_ms"); const NAME: Record<string, string> = { embed_single: "Query embedding", faiss: "Dense search", bm25: "BM25 search", kg: "Graph lookup", rerank_per_pair: "Rerank, per pair" }; const ms = (v?: number) => v === undefined ? "n/a" : v >= 100 ? `${Math.round(v)} ms` : `${v.toFixed(1)} ms`;
            return <>
              <StatStrip>{["embed_single", "faiss", "bm25", "kg", "rerank_per_pair"].filter(k => L[k]).map(k => <Stat key={k} label={NAME[k]} value={ms(L[k].p50_ms)} sub={`p95 ${ms(L[k].p95_ms)}`} />)}</StatStrip>
              <Figure title="Latency by stage, median and 95th percentile" desc="Log scale, measured on an Apple M-series laptop. BM25 scores from an inverted index, so even 300-word fact narratives stay in the low milliseconds; the graph lookup and the reranker are the slow stages." rows={ks.map(k => ({ stage: NAME[k] ?? k, ...L[k] }))}>
                <Chart height={340} data={[{ type: "bar", name: "p50", x: ks.map(k => NAME[k] ?? k), y: ks.map(k => L[k].p50_ms), marker: { color: C.fg }, hovertemplate: "%{x}<br>p50 %{y:.1f} ms<extra></extra>" }, { type: "bar", name: "p95", x: ks.map(k => NAME[k] ?? k), y: ks.map(k => L[k].p95_ms), marker: { color: C.muted }, hovertemplate: "%{x}<br>p95 %{y:.1f} ms<extra></extra>" }]} layout={{ barmode: "group", yaxis: { type: "log", title: { text: "milliseconds (log)" } }, margin: { l: 56, r: 16, t: 8, b: 30 } }} />
              </Figure>
            </>; })() : <Empty title="No latency measurements" desc="Run the latency benchmark to populate this view." />)}

          {view === "quality" && (ae ? <>
            <div className="grid gap-6 xl:grid-cols-2">
              <Figure title="Bar exam accuracy with and without retrieval" desc={`AIBE multiple-choice questions, n = ${ae.aibe.n}. The same generator answers closed-book and with LawLine retrieval.${old("answer_eval")}`} rows={[{ setting: "closed-book", accuracy: ae.aibe.closed_book_acc, n: ae.aibe.n }, { setting: "LawLine retrieval", accuracy: ae.aibe.rag_acc, n: ae.aibe.n }]}>
                <Chart height={320} data={[{ type: "bar", x: ["Closed-book", "LawLine retrieval"], y: [ae.aibe.closed_book_acc, ae.aibe.rag_acc], marker: { color: [C.muted, C.fg] }, width: 0.45, text: [ae.aibe.closed_book_acc, ae.aibe.rag_acc].map(v => pct(v, 1)), textposition: "outside", cliponaxis: false, hovertemplate: "%{x}: %{y:.1%}<extra></extra>" } as never]} layout={{ yaxis: { range: [0, 1], tickformat: ".0%" }, showlegend: false, margin: { l: 44, r: 16, t: 20, b: 30 } }} />
              </Figure>
              <Figure title="Judged answer quality" desc={`n = ${ae.rag.n}, scored by an independent judge model. Correctness and faithfulness are means on a 0 to 2 scale, shown as a share of the maximum.${old("answer_eval")}`} rows={d.grounded} cols={["qid", "task", "question", "retrieval_hit", "gold_cited", "closed_correct", "closed_faithful", "rag_correct", "rag_faithful", "rag_reason"]}>
                {(() => { const xs = ["Correctness", "Faithfulness", "Fully correct", "Fabricated citations"]; const ys = (k: "closed" | "rag") => [ae[k]["correctness_mean(0-2)"] / 2, ae[k]["faithfulness_mean(0-2)"] / 2, ae[k].fully_correct_rate, ae[k].fabricated_citation_rate]; return <Chart height={320} data={[{ type: "bar", name: "Closed-book", x: xs, y: ys("closed"), marker: { color: C.muted }, hovertemplate: "%{x}<br>closed-book %{y:.0%}<extra></extra>" }, { type: "bar", name: "LawLine retrieval", x: xs, y: ys("rag"), marker: { color: C.fg }, hovertemplate: "%{x}<br>LawLine %{y:.0%}<extra></extra>" }]} layout={{ barmode: "group", yaxis: { range: [0, 1], tickformat: ".0%" }, margin: { l: 44, r: 16, t: 8, b: 30 } }} />; })()}
              </Figure>
            </div>
            <Figure title="From retrieval to a fully correct answer" desc={`Share of the ${ae.rag.n} judged answers that reach each stage: the gold provision is in the top five, the answer cites it, and the judge marks the answer fully correct.${old("answer_eval")}`} rows={[{ stage: "answered", share: 1 }, { stage: "gold provision retrieved (top 5)", share: ae.rag.retrieval_hit_rate }, { stage: "gold provision cited", share: ae.rag.gold_cited_rate }, { stage: "fully correct", share: ae.rag.fully_correct_rate }]}>
              <Chart height={280} data={[{ type: "funnel", y: ["Answered", "Gold provision retrieved (top 5)", "Gold provision cited", "Fully correct"], x: [1, ae.rag.retrieval_hit_rate, ae.rag.gold_cited_rate, ae.rag.fully_correct_rate], marker: { color: C.primary }, connector: { fillcolor: C.grid, line: { width: 0 } }, texttemplate: "%{x:.0%}", textposition: "inside", textfont: { color: C.surface }, hovertemplate: "%{y}: %{x:.0%}<extra></extra>" } as never]} layout={{ yaxis: { showgrid: false }, xaxis: { showgrid: false }, margin: { l: 8, r: 16, t: 8, b: 8 } }} />
            </Figure>
          </> : <Empty title="No answer evaluation" desc="Run the answer evaluation to populate this view." />)}

          {view === "corpus" && (cv && cv.v1.ablation_ft.length && cv.v2.ablation_ft.length ? (() => {
            const routed = (v: "v1" | "v2", task: string, m: string) => get(cv[v].ablation_ft, ROUTED, task, m);
            const typed = (task: string, m: string) => get(cv.v2_right_type, ROUTED, task, m);
            const hasTyped = cv.v2_right_type.length > 0; const hasLm = !!cv.v1.landmark && !!cv.v2.landmark; const hasDocs = !!cv.v1.corpus && !!cv.v2.corpus;
            const lm = (v: "v1" | "v2", k: string) => Number(cv[v].landmark?.[k] ?? 0);
            const docs = (v: "v1" | "v2", k: string) => Number(cv[v].corpus?.[k] ?? 0);
            const times = (a: number, b: number, dp: number) => a > 0 && b > 0 ? (b / a).toFixed(dp) : null;
            const delta = (a: number, b: number) => `${b - a >= 0 ? "+" : "−"}${Math.abs(b - a).toFixed(3)}`;
            const taskRows: Row[] = TASKS.flatMap(([t, l]) => ["R@1", "R@5", "nDCG@10"].map(m => ({ task: l, metric: m, v1: routed("v1", t, m), v2: routed("v2", t, m), change: delta(routed("v1", t, m), routed("v2", t, m)), ...(hasTyped ? { "v2, right type": typed(t, m) } : {}) })));
            const lmRows: Row[] = [["all", "All documents"], ["cases_only", "Judgments only"]].flatMap(([k, l]) => [1, 5, 10].map(c => ({ search: l, cutoff: `top ${c}`, v1: lm("v1", `${k}_hit@${c}`), v2: lm("v2", `${k}_hit@${c}`) })));
            const size = [times(docs("v1", "total"), docs("v2", "total"), 2), times(lm("v1", "chunks"), lm("v2", "chunks"), 1)];
            const bars = (name: string, y: number[], marker: object, x = TASKS.map(t => t[1]), fmt = ".3f") => ({ type: "bar" as const, name, x, y, marker, hovertemplate: `%{x}<br>${name} %{y:${fmt}}<extra></extra>` });
            return <>
              {hasDocs && <StatStrip>
                <Stat label="Documents" value={docs("v2", "total").toLocaleString()} sub={`was ${docs("v1", "total").toLocaleString()}`} />
                <Stat label="Judgments" value={docs("v2", "cases").toLocaleString()} sub={`was ${docs("v1", "cases").toLocaleString()}`} />
                <Stat label="Provisions" value={docs("v2", "statutes").toLocaleString()} sub={`was ${docs("v1", "statutes").toLocaleString()}`} />
                {hasLm && <Stat label="Landmark judgments, top 5" value={pct(lm("v2", "all_hit@5"))} sub={`was ${pct(lm("v1", "all_hit@5"))}`} />}
              </StatStrip>}
              <Figure title="Benchmark Recall@5 before and after the corpus expansion" desc={`The same ${get(cv.v2.ablation_ft, ROUTED, "macro", "n").toLocaleString()} held-out queries and the same gold targets${size[0] ? `, run against ${size[0]} times the documents${size[1] ? ` and ${size[1]} times the passages` : ""}` : ""}. The expansion added no benchmark answer, so the change measures distraction: judgments on the same topic now compete with the section a question is about.${hasTyped ? " The outlined bar restricts each query to the document type of its answer, which is what a perfect statute-or-judgment router would score; it is a ceiling, not the system as shipped." : ""} LawLine routed configuration.`} rows={taskRows} cols={["task", "metric", "v1", "v2", "change", ...(hasTyped ? ["v2, right type"] : [])]}>
                <Chart height={340} data={[bars("v1 corpus", TASKS.map(t => routed("v1", t[0], "R@5")), { color: C.muted }), bars("v2 corpus", TASKS.map(t => routed("v2", t[0], "R@5")), { color: C.fg }),
                  ...(hasTyped ? [bars("v2, right document type (ceiling)", TASKS.map(t => typed(t[0], "R@5")), { color: "rgba(22,24,29,0.08)", line: { color: C.fg, width: 1.5 } })] : [])]}
                  layout={{ barmode: "group", yaxis: { range: [0, 1], title: { text: "Recall@5" } }, margin: { l: 52, r: 16, t: 8, b: 30 } }} />
              </Figure>
              {hasLm && <Figure title="Landmark judgments found from a plain question" desc={`${lm("v2", "questions")} hand-written doctrinal questions, each answered by a well-known Supreme Court judgment that the question does not name. Every target was added to v2 by name, so v2 holds ${lm("v2", "judgment_in_corpus")} of them and v1 held ${lm("v1", "judgment_in_corpus")}. The score shows whether an added judgment can be found; it does not measure how much case law the corpus covers.`} rows={lmRows} cols={["search", "cutoff", "v1", "v2"]}>
                <Chart height={300} data={[bars("v1 corpus", [1, 5, 10].map(c => lm("v1", `all_hit@${c}`)), { color: C.muted }, ["Top 1", "Top 5", "Top 10"], ".0%"), bars("v2 corpus", [1, 5, 10].map(c => lm("v2", `all_hit@${c}`)), { color: C.fg }, ["Top 1", "Top 5", "Top 10"], ".0%")]}
                  layout={{ barmode: "group", yaxis: { range: [0, 1], tickformat: ".0%", title: { text: "share of questions" } }, margin: { l: 56, r: 16, t: 8, b: 30 } }} />
              </Figure>}
              {hasDocs && <Section title="What was added" desc="Sources, licences and selection rules are in docs/DATA_SOURCES.md.">
                <Table rows={[["Supreme Court Reports, 1950 to 2025", "sc_reports"], ["High Court judgments, 24 High Courts other than Patna", "hc_judgments"], ["Sections of central Acts", "key_acts"]].map(([l, k]) => ({ source: l, documents: docs("v2", k) }))} />
              </Section>}
            </>;
          })() : <Empty title="No earlier corpus to compare" desc="Results from before the corpus expansion were not found in the results folder." />)}

          {view === "raw" && <>
            <Section title="Ablation, fine-tuned encoder" desc={`${d.ablation_ft.length} rows`}><Table rows={d.ablation_ft} cols={ABL_COLS} tall /></Section>
            <Section title="Ablation, base encoder" desc={`${d.ablation_base.length} rows`}><Table rows={d.ablation_base} cols={ABL_COLS} tall /></Section>
            <Section title="Ablation, legal cross-encoder" desc={`${d.ablation_ft_legalce.length} rows.${old("reranker_legal")}`}><Table rows={d.ablation_ft_legalce} cols={ABL_COLS} tall /></Section>
            <Section title="Chunk-size sweep" desc={`${d.chunk_sweep.length} rows`}><Table rows={d.chunk_sweep} tall /></Section>
          </>}
        </div>
      </div>
    </Page>
  );
}
