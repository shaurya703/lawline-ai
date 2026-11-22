import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

const RETRIEVERS: [string, string, string][] = [["Dense", "Fine-tuned bge-small in FAISS", "var(--src-faiss)"], ["Lexical", "BM25 with a legal tokenizer", "var(--src-bm25)"], ["Graph", "Acts, sections, cases, concepts", "var(--src-kg)"]];
const STEPS = [
  { t: "Question", d: "A follow-up is first rewritten into a standalone query. Long fact narratives are routed to dense retrieval only." },
  { t: "Retrieve", d: "" },
  { t: "Fuse", d: "Reciprocal rank fusion merges the three ranked lists into one." },
  { t: "Rerank", d: "A cross-encoder re-scores the top passages against the exact question. Exact graph matches keep a slot." },
  { t: "Answer", d: "The model writes only from the numbered passages and cites each claim. Citations are parsed and checked." },
];

/** The online pipeline, drawn once and reused on the landing page, the overview and the methodology page. */
export default function Pipeline() {
  return (
    <ol className="grid gap-2 lg:grid-cols-[1fr_auto_1.25fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
      {STEPS.map((s, i) => (
        <Fragment key={s.t}>
          {i > 0 && <li aria-hidden className="hidden items-center text-line-strong lg:flex"><ChevronRight className="h-4 w-4" /></li>}
          <li className="rounded-lg border border-line bg-surface p-3.5">
            <div className="flex items-baseline gap-2"><span className="num font-mono text-[11px] text-ink-3">{i + 1}</span><span className="text-[14px] font-semibold text-ink">{s.t}</span></div>
            {s.d ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{s.d}</p> : (
              <ul className="mt-2 space-y-1.5">{RETRIEVERS.map(([n, d, c]) => <li key={n} className="flex items-start gap-2 text-[12.5px] leading-snug"><span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} aria-hidden /><span><span className="font-medium text-ink">{n}</span> <span className="text-ink-3">{d}</span></span></li>)}</ul>
            )}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
