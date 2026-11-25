import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MODULES, NAV } from "@/components/shell/nav";
import { Wordmark } from "@/components/shell/Shell";
import Pipeline from "@/components/Pipeline";
import facts from "@/lib/facts.json";

const EXAMPLES = ["What is anticipatory bail?", "What does Article 21 guarantee?", "Is registration of an FIR mandatory when a cognizable offence is disclosed?"];
// Every figure below comes from facts.json, which `python -m lawline.eval.export_facts` writes from the result files.
const f3 = (x: number | null | undefined) => x == null ? "–" : x.toFixed(3);
const num = (x: number | null | undefined) => x == null ? "–" : x.toLocaleString("en-US");
const pct = (x: number | null | undefined, dp = 0) => x == null ? "–" : `${(x * 100).toFixed(dp)}%`;
const { corpus, benchmark, finetune, landmark, latency_ms: lat, answers } = facts;
const top = benchmark.systems[benchmark.systems.length - 1];
const FIGURES: [string, string][] = [[num(corpus.provisions), "statutory provisions"], [num(corpus.judgments), "judgments"], [num(benchmark.queries), "held-out benchmark queries"], [f3(top.r5), "macro Recall@5"]];
const RESULTS: [string, string, string, string, boolean][] = benchmark.systems.map((s, i, all) => [s.system, f3(s.r1), f3(s.r5), f3(s.ndcg), i === all.length - 1]);
const NOTES: [string, string][] = [
  ["Fine-tuning", `Recall@5 on IPC fact-pattern to section retrieval rises from ${(finetune.ipc_facts.base ?? 0).toFixed(2)} to ${f3(finetune.ipc_facts.ft)}, and on BNS questions from ${(finetune.bns_qa.base ?? 0).toFixed(2)} to ${(finetune.bns_qa.ft ?? 0).toFixed(2)}, on sections the model never saw.`],
  ...(answers ? [["Grounding", `Bar-exam (AIBE) accuracy rises from ${pct(answers.closed_book, 1)} closed-book to ${pct(answers.with_retrieval, 1)} with retrieval. Judged faithfulness is ${answers.faithfulness.toFixed(1)} out of 2, and ${pct(answers.gold_cited)} of answers cite the gold provision.${answers.corpus !== corpus.version ? ` Measured on the ${answers.corpus} corpus and not re-run since.` : ""}`] as [string, string]] : []),
  ...(landmark ? [["Case law", `On ${landmark.questions} doctrinal questions, the Supreme Court judgment that settles the point is among the first five documents retrieved for ${pct(landmark.hit5)}. Each of those judgments was added by name when the corpus was expanded; before that the figure was ${pct(landmark.v1_hit5)}.${top.v1 ? ` The larger corpus cost ${((top.v1.r5 - top.r5) * 100).toFixed(1)} points of macro Recall@5 on the benchmark.` : ""}`] as [string, string]] : []),
  ["Latency", `On a laptop, median per query: embedding ${lat.embed} ms, FAISS ${lat.faiss} ms, BM25 ${lat.bm25} ms, graph lookup ${lat.graph} ms, reranking about ${((lat.rerank ?? 0) / 1000).toFixed(2)} s.`],
];

export default function Landing() {
  const nav = useNavigate(); const [q, setQ] = useState("");
  const ask = (t: string) => { if (t.trim()) nav(`/app/counsel?q=${encodeURIComponent(t.trim())}`); };
  return (
    <div className="bg-canvas">
      <header className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-6">
        <Wordmark />
        <nav className="flex items-center gap-6 text-[14px] text-ink-2">
          <a href="#method" className="hidden hover:text-ink sm:inline">How it works</a>
          <a href="#modules" className="hidden hover:text-ink sm:inline">Modules</a>
          <a href="#results" className="hidden hover:text-ink sm:inline">Results</a>
          <Link to="/app" className="inline-flex h-9 items-center rounded-md bg-ink px-3.5 font-medium text-white transition-colors hover:bg-[#2b2f38]">Open LawLine</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.05fr_.95fr] lg:pt-20">
        <div>
          <p className="text-[13px] text-ink-3">Legal research assistant for Indian law</p>
          <h1 className="mt-4 font-serif text-[44px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[58px]">Indian law, answered from the text.</h1>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-ink-2">Ask in plain language. LawLine retrieves the governing provisions and judgments, answers only from them, and shows every passage it relied on.</p>
          <form className="mt-8 flex max-w-xl gap-2" onSubmit={e => { e.preventDefault(); ask(q); }}>
            <input value={q} onChange={e => setQ(e.target.value)} aria-label="Ask a legal question" placeholder="Ask a legal question…" className="h-12 w-full rounded-md border border-line-strong bg-surface px-4 text-[15px] placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15" />
            <button type="submit" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-ink px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#2b2f38]">Ask <ArrowRight className="h-4 w-4" aria-hidden /></button>
          </form>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">{EXAMPLES.map(x => <li key={x}><button onClick={() => ask(x)} className="link">{x}</button></li>)}</ul>
        </div>

        <figure className="rounded-lg border border-line bg-surface p-6 shadow-pop" aria-label="Example of a LawLine answer">
          <figcaption className="text-[12.5px] text-ink-3">Example answer</figcaption>
          <p className="mt-3 font-serif text-[21px] font-medium leading-snug text-ink">What is the punishment for murder?</p>
          <div className="prose-ll mt-3">
            <p>Murder is punished with death or imprisonment for life, and the offender is also liable to a fine <span className="cite">[1]</span>.</p>
            <p>This is Section 103 of the Bharatiya Nyaya Sanhita, 2023, which replaced Section 302 of the Indian Penal Code for offences committed from 1 July 2024 <span className="cite">[1]</span> <span className="cite">[2]</span>.</p>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-center gap-2"><span className="rounded bg-accent-soft px-1.5 font-mono text-[11px] font-medium leading-5 text-accent">[1]</span><span className="text-[13px] font-semibold">Bharatiya Nyaya Sanhita, 2023 · Section 103</span></div>
            <p className="statute-sm mt-1.5">Whoever commits murder shall be punished with death or imprisonment for life, and shall also be liable to fine.</p>
          </div>
        </figure>
      </section>

      <section className="border-y border-line bg-surface">
        <dl className="mx-auto grid max-w-[1120px] grid-cols-2 px-6 md:grid-cols-4">
          {FIGURES.map(([v, l]) => <div key={l} className="py-6 md:py-8"><dd className="num font-serif text-[32px] font-medium leading-none text-ink">{v}</dd><dt className="mt-2 text-[13px] text-ink-3">{l}</dt></div>)}
        </dl>
      </section>

      <section id="method" className="mx-auto max-w-[1120px] scroll-mt-8 px-6 py-20">
        <h2 className="font-serif text-[32px] font-medium tracking-[-0.01em] text-ink">How an answer is built</h2>
        <p className="mt-2 max-w-[64ch] text-[16px] text-ink-2">Three retrievers nominate passages, their rankings are fused and re-scored, and the model may only write what those passages support.</p>
        <div className="mt-8"><Pipeline /></div>
      </section>

      <section id="modules" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1120px] scroll-mt-8 px-6 py-20">
          <h2 className="font-serif text-[32px] font-medium tracking-[-0.01em] text-ink">{MODULES.length} modules on one evidence base</h2>
          <p className="mt-2 max-w-[64ch] text-[16px] text-ink-2">Every module reads the same corpus and the same retrieval pipeline, so a provision opened in one can be asked about, compared or cited in another.</p>
          <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {NAV.map(g => (
              <div key={g.id}>
                <h3 className="border-b border-line-strong pb-2 text-[13px] font-semibold text-ink">{g.group}</h3>
                <ul className="mt-1">{g.items.map(m => <li key={m.to} className="border-b border-line"><Link to={m.to} className="group block py-3"><span className="text-[15px] font-medium text-ink group-hover:text-accent">{m.label}</span><span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{m.desc}</span></Link></li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="results" className="mx-auto max-w-[1120px] scroll-mt-8 px-6 py-20">
        <h2 className="font-serif text-[32px] font-medium tracking-[-0.01em] text-ink">Measured, not asserted</h2>
        <p className="mt-2 max-w-[64ch] text-[16px] text-ink-2">Retrieval quality on 1,810 held-out queries across four tasks: BNS questions, IPC fact patterns, Constitution questions and Supreme Court case retrieval. Document-level metrics, macro-averaged.</p>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_.8fr]">
          <div className="self-start overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="tbl"><thead><tr><th>System</th><th className="text-right">R@1</th><th className="text-right">R@5</th><th className="text-right">nDCG@10</th></tr></thead>
              <tbody>{RESULTS.map(([s, a, b, c, ours]) => <tr key={s} className={ours ? "bg-accent-soft font-semibold" : ""}><td>{s}</td><td className="mono text-right">{a}</td><td className="mono text-right">{b}</td><td className="mono text-right">{c}</td></tr>)}</tbody></table>
          </div>
          <dl className="space-y-5">{NOTES.map(([t, d]) => <div key={t}><dt className="text-[14px] font-semibold text-ink">{t}</dt><dd className="mt-1 text-[14px] leading-relaxed text-ink-2">{d}</dd></div>)}</dl>
        </div>
        <div className="mt-8"><Link to="/app/analytics" className="link text-[15px]">See every chart and table in Analytics</Link></div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-8 text-[13px] text-ink-3">
          <span>LawLine AI · PES University capstone project</span>
          <span>LawLine gives legal information drawn from retrieved sources. It is not legal advice.</span>
        </div>
      </footer>
    </div>
  );
}
