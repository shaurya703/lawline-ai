import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MODULES, NAV } from "@/components/shell/nav";
import { Wordmark } from "@/components/shell/Shell";
import Pipeline from "@/components/Pipeline";

const EXAMPLES = ["Is Section 498A bailable?", "What does Article 21 guarantee?", "What replaced IPC 302 in the BNS?"];
const FIGURES: [string, string][] = [["36,272", "statutory provisions"], ["6,596", "judgments"], ["1,810", "held-out benchmark queries"], ["0.725", "macro Recall@5"]];
const RESULTS: [string, string, string, string, boolean?][] = [
  ["BM25", "0.449", "0.559", "0.525"],
  ["Dense, off the shelf (bge-small)", "0.431", "0.541", "0.503"],
  ["Hybrid: dense + BM25 + graph, fused and reranked", "0.515", "0.625", "0.586"],
  ["Dense, legally fine-tuned", "0.526", "0.709", "0.664"],
  ["LawLine: fine-tuned + hybrid + routing", "0.563", "0.725", "0.685", true],
];
const NOTES = [
  ["Fine-tuning", "Recall@5 on IPC fact-pattern to section retrieval rises from 0.00 to 0.325, and on BNS questions from 0.41 to 0.68, on sections the model never saw."],
  ["Grounding", "Bar-exam (AIBE) accuracy rises from 64.7% closed-book to 68.0% with retrieval. Judged faithfulness is 2.0 out of 2, and 75% of answers cite the gold provision."],
  ["Latency", "On a laptop: query embedding 13 ms, FAISS 2 ms, graph lookup 68 ms, reranking about 0.3 s."],
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
          <p className="mt-3 font-serif text-[21px] font-medium leading-snug text-ink">Is a bounced cheque a criminal offence?</p>
          <div className="prose-ll mt-3">
            <p>Yes. Dishonour of a cheque for insufficient funds is an offence under Section 138 of the Negotiable Instruments Act, punishable with imprisonment of up to two years, a fine of up to twice the cheque amount, or both <span className="cite">[1]</span>.</p>
            <p>The payee must first send a written demand within 30 days of learning of the dishonour, and the drawer then has 15 days to pay <span className="cite">[1]</span>.</p>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-center gap-2"><span className="rounded bg-accent-soft px-1.5 font-mono text-[11px] font-medium leading-5 text-accent">[1]</span><span className="text-[13px] font-semibold">Negotiable Instruments Act, 1881 · Section 138</span></div>
            <p className="statute-sm mt-1.5">Where any cheque drawn by a person on an account maintained by him with a banker for payment of any amount of money … is returned by the bank unpaid …</p>
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
