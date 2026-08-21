import { api, type Stats } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Card, Eyebrow, H2 } from "@/components/shell/ui";

export default function Methodology() {
  const s = useFetch(() => api.get<Stats>("/stats"));
  return (
    <div className="space-y-6">
      <Card><Eyebrow>Documentation</Eyebrow><H2 className="mt-1">Methodology</H2></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 text-sm leading-relaxed"><H2 className="text-base">Architecture</H2>
          <p><b>Offline</b>: public statutes and judgments → unified schema → 220-word overlapping chunks with provision metadata → three indices: FAISS (dense, legally fine-tuned <code>bge-small</code>), BM25 (legal tokenizer), and a knowledge graph (Acts → sections, cross-references, case→provision citations, curated concepts incl. the IPC→BNS transition).</p>
          <p><b>Online</b>: query → length-based routing (narrative fact patterns → dense only; questions → all three retrievers) → reciprocal rank fusion → cross-encoder reranking → guaranteed slot for exact KG matches → Gemini generates an answer constrained to the numbered passages, with bracketed citations that are parsed and verified. Follow-ups are rewritten into standalone queries using the conversation.</p></Card>
        <Card className="space-y-3 text-sm leading-relaxed"><H2 className="text-base">Training & evaluation</H2>
          <p>Bi-encoder: 13,016 (query, provision, hard-negative) triplets, MultipleNegativesRankingLoss, hard negatives mined from the base model's own mistakes; gold sections/cases excluded by construction. A legal cross-encoder was trained and evaluated (reported, not shipped).</p>
          <p>1,810 held-out queries across BNS-QA, IPC facts→section (case-level split), Constitution-QA and SC case retrieval; Recall@k / MRR / nDCG; ablations over retrievers, fusion weights, reranking, chunking; latency; AIBE accuracy and LLM-judged faithfulness with an independent judge model.</p></Card>
        <Card><H2 className="text-base">Corpus</H2><pre className="mt-2 overflow-auto font-mono text-xs text-muted">{JSON.stringify(s.data?.corpus ?? {}, null, 2)}</pre></Card>
        <Card><H2 className="text-base">Benchmark</H2><pre className="mt-2 overflow-auto font-mono text-xs text-muted">{JSON.stringify(s.data?.gold ?? {}, null, 2)}</pre></Card>
      </div>
      <Card className="text-sm leading-relaxed text-muted"><H2 className="text-base text-fg">Sources & limitations</H2>
        <p className="mt-2">India Code bare-acts dump, BNS/BNSS/BSA 2023 sections and QA, IPC (offence tables + commentary text), Constitution of India (official text), Supreme Court Reports 2016, High-Court excerpts, AIBE MCQs. All public; judgments are public records under s.52(1)(q) Copyright Act 1957.</p>
        <p className="mt-2">Case-law coverage is partial; the generator is a hosted model with a daily free-tier quota. LawLine provides legal <b>information</b> grounded in retrieved sources; it is <b>not legal advice</b> — always verify the cited passage.</p></Card>
    </div>
  );
}
