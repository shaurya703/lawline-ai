import { Link } from "react-router-dom";
import { api, type Stats } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { ErrorBox, H3, Page, Section, Skeleton } from "@/components/ui";
import Pipeline from "@/components/Pipeline";

const SOURCES: Record<string, string> = { bare_acts: "India Code bare Acts", bns_family: "BNS, BNSS and BSA (2023)", ipc: "Indian Penal Code", constitution: "Constitution of India", sc2016: "Supreme Court Reports, 2016", hc_excerpts: "Patna High Court excerpts", landmark: "Landmark judgments (Phase II)", key_acts: "Key central Acts, completed sections", sc_reports: "Supreme Court Reports, 1950–2025", hc_judgments: "High Court judgments, 24 High Courts" };
const TASKS: Record<string, string> = { bns_qa: "BNS questions", ipc_facts: "IPC fact pattern to section", const_qa: "Constitution questions", sc_case: "Supreme Court case retrieval" };
const NODES: Record<string, string> = { act: "Acts", section: "Provisions", case: "Judgments", topic: "Topics", concept: "Curated concepts" };
const EDGES: Record<string, string> = { HAS_SECTION: "Act has section", REFERS_TO: "Provision refers to provision", CITES: "Judgment cites provision", ABOUT: "Judgment is about topic", CITES_CASE: "Judgment cites judgment", GOVERNED_BY: "Concept governed by provision" };
const OTHER: Record<string, string> = { hanno_train_rows: "IPC fact-pattern rows, train split", hanno_test_rows: "IPC fact-pattern rows, held-out split" };
const label = (map: Record<string, string>, k: string) => map[k] ?? k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const n = (v: number) => v.toLocaleString();
const prose = "max-w-[72ch] text-[14.5px] leading-relaxed text-ink-2";

function Count({ rows, total, head }: { rows: [string, number][]; total?: [string, number][]; head: [string, string] }) {
  return (
    <table className="tbl">
      <thead><tr><th>{head[0]}</th><th className="text-right">{head[1]}</th></tr></thead>
      <tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="mono text-right">{n(v)}</td></tr>)}</tbody>
      {total && <tfoot>{total.map(([k, v]) => <tr key={k} className="font-semibold"><td className="border-t border-line-strong">{k}</td><td className="mono border-t border-line-strong text-right">{n(v)}</td></tr>)}</tfoot>}
    </table>
  );
}

export default function Methodology() {
  const s = useFetch(() => api.get<Stats>("/stats")); const st = s.data;
  const sources = st ? Object.entries(st.corpus).filter(([k]) => k in SOURCES) : [];
  const other = st ? Object.entries(st.corpus).filter(([k]) => !(k in SOURCES) && !["total", "statutes", "cases"].includes(k)) : [];
  const gold = st ? Object.entries(st.gold) : [];
  return (
    <Page title="Methodology" desc="How LawLine is built, trained and evaluated, and what it does not cover.">
      <Section title="From a question to a cited answer" desc="The online pipeline. Every module that retrieves law goes through these five steps."><Pipeline /></Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Architecture">
          <div className="space-y-4">
            <div><H3>Offline: building the indices</H3><p className={`mt-1.5 ${prose}`}>Public statutes and judgments are normalised to one schema and cut into overlapping 220-word chunks that keep their provision metadata. Three indices are built from the chunks: a dense FAISS index over a legally fine-tuned <code className="font-mono text-[13px]">bge-small</code> encoder, a BM25 index with a legal tokenizer, and a knowledge graph that links Acts to sections, provisions to the provisions they refer to, judgments to the provisions they cite, and curated concepts to their governing provisions, including the IPC to BNS transition.</p></div>
            <div><H3>Online: answering a query</H3><p className={`mt-1.5 ${prose}`}>A query is routed by length: narrative fact patterns go to dense retrieval only, questions go to all three retrievers. The ranked lists are merged by reciprocal rank fusion and re-scored by a cross-encoder, with a guaranteed slot for exact knowledge-graph matches. The generator is constrained to the numbered passages and must cite them in brackets; the citations are parsed and verified. A follow-up is first rewritten into a standalone query using the conversation.</p></div>
          </div>
        </Section>
        <Section title="Training and evaluation">
          <div className="space-y-4">
            <div><H3>Training the retriever</H3><p className={`mt-1.5 ${prose}`}>The bi-encoder is fine-tuned on 13,016 triplets of query, provision and hard negative with MultipleNegativesRankingLoss. Hard negatives are mined from the base model's own mistakes, and gold sections and cases in the benchmark are excluded by construction. A legal cross-encoder was also trained and evaluated; it is reported but not shipped.</p></div>
            <div><H3>Evaluating the system</H3><p className={`mt-1.5 ${prose}`}>1,810 held-out queries across four tasks, with a case-level split for the IPC fact patterns. Retrieval is scored by Recall@k, MRR and nDCG, with ablations over retrievers, fusion weights, reranking and chunk size, plus latency. Answers are scored by AIBE multiple-choice accuracy and by correctness and faithfulness from an independent judge model.</p><p className="mt-2 text-[13.5px]"><Link to="/app/analytics" className="link">Open the results in Analytics</Link></p></div>
          </div>
        </Section>
      </div>

      {s.error ? <ErrorBox error={s.error} retry={() => location.reload()} /> : !st ? <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div> : (<>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Section title="Corpus" desc={`Documents by source, cut into ${n(st.chunks)} retrieval chunks.`} flush>
            <Count head={["Source", "Documents"]} rows={sources.map(([k, v]) => [label(SOURCES, k), v])} total={[["Statutory provisions", st.corpus.statutes], ["Judgments", st.corpus.cases], ["All documents", st.corpus.total]]} />
            {other.length > 0 && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">The IPC statute-identification set is split by case, so held-out fact patterns never enter the corpus: {other.map(([k, v]) => `${label(OTHER, k)} ${n(v)}`).join("; ")}.</p>}
          </Section>
          <Section title="Benchmark" desc="Held-out queries per task, and the training pairs drawn from the same source." flush>
            <table className="tbl">
              <thead><tr><th>Task</th><th className="text-right">Held-out queries</th><th className="text-right">Training pairs</th></tr></thead>
              <tbody>{gold.map(([k, g]) => <tr key={k}><td>{label(TASKS, k)}</td><td className="mono text-right">{n(g.queries)}</td><td className="mono text-right">{g.train_pairs ? n(g.train_pairs) : "–"}</td></tr>)}</tbody>
              <tfoot><tr className="font-semibold"><td className="border-t border-line-strong">All tasks</td><td className="mono border-t border-line-strong text-right">{n(gold.reduce((a, [, g]) => a + g.queries, 0))}</td><td className="mono border-t border-line-strong text-right">{n(gold.reduce((a, [, g]) => a + g.train_pairs, 0))}</td></tr></tfoot>
            </table>
          </Section>
        </div>
        <Section title="Knowledge graph" desc="What the graph holds and how its nodes are connected." flush>
          <div className="grid md:grid-cols-2 md:divide-x md:divide-line">
            <Count head={["Node type", "Nodes"]} rows={Object.entries(st.kg.nodes).map(([k, v]) => [label(NODES, k), v])} total={[["All nodes", Object.values(st.kg.nodes).reduce((a, b) => a + b, 0)]]} />
            <Count head={["Relation", "Edges"]} rows={Object.entries(st.kg.edges).map(([k, v]) => [label(EDGES, k), v])} total={[["All edges", Object.values(st.kg.edges).reduce((a, b) => a + b, 0)]]} />
          </div>
        </Section>
      </>)}

      <Section title="Sources and limitations">
        <div className="space-y-3">
          <p className={prose}>The corpus is built from the India Code bare-Acts dump, the BNS, BNSS and BSA 2023 sections and question sets, the Indian Penal Code (offence tables and commentary text), the official text of the Constitution of India, Supreme Court Reports from 1950 to 2025 (a sample of each year, and the landmark decisions added by name), judgments of all 25 High Courts and AIBE multiple-choice questions. All of it is public; judgments are public records under section 52(1)(q) of the Copyright Act, 1957.</p>
          <p className={prose}>Case-law coverage is a sample, not the full reports: long judgments keep their headnote and final order only, and the oldest reports are scanned text with spelling noise. Adding judgments made the statute benchmarks harder, because a judgment on the same topic can outrank the section a question is about (see Analytics, Corpus v1 and v2). The generator is a hosted model with a daily free-tier quota. LawLine provides legal information grounded in retrieved sources. It is not legal advice: always read the cited passage before relying on an answer.</p>
        </div>
      </Section>
    </Page>
  );
}
