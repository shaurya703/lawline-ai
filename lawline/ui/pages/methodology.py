import streamlit as st, pandas as pd
from ..theme import hero
from ..state import corpus_stats, gold_stats


def render():
    hero("METHODOLOGY", "How LawLine works, what it was trained and tested on, and what it cannot do.", "DOCUMENTATION")
    st.markdown("""
#### Architecture
**Offline**: public statutes and judgments → unified schema → 220-word overlapping chunks with provision metadata → three indices: FAISS (dense, legally fine-tuned `bge-small`), BM25 (legal tokenizer), and a knowledge graph (Acts → sections, cross-references, case→provision citations, curated legal concepts incl. the IPC→BNS transition).

**Online**: query → length-based routing (narrative fact patterns → dense only; questions → all three retrievers) → reciprocal rank fusion → cross-encoder reranking → guaranteed slot for exact KG matches on short questions → Gemini generates an answer constrained to the numbered passages, with bracketed citations that are parsed and verified.

#### Training
* Bi-encoder: 13,016 (query, provision, hard-negative) triplets, MultipleNegativesRankingLoss, hard negatives mined from the base model's own mistakes; gold sections/cases excluded by construction.
* A legal cross-encoder was trained and evaluated; it is reported but not shipped (forgets general relevance after one epoch).

#### Evaluation
1,810 held-out queries across BNS-QA, IPC facts→section (case-level split, test cases not in the corpus), Constitution-QA and SC case retrieval; Recall@k / MRR / nDCG; ablations over retrievers, fusion weights, reranking, chunking; latency; AIBE multiple-choice accuracy and LLM-judged faithfulness with an independent judge model.
""")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### Corpus"); st.json(corpus_stats())
    with c2:
        st.markdown("#### Benchmark"); st.json(gold_stats())
    st.markdown("""
#### Data sources
India Code bare-acts dump (`mratanusarkar/Indian-Laws`), BNS/BNSS/BSA 2023 sections and QA (`GSMS-B`), IPC (`kmeanskaran/ipc-sections` + `Hanno-Labs`), Constitution of India (official text), Supreme Court Reports 2016 (`Shreyasrao`), High-Court excerpts (`Hanno-Labs`), AIBE MCQs (`jmukesh99`). All public; judgments are public records under s.52(1)(q) Copyright Act 1957.

#### Limitations
Case-law coverage is partial (SCR 2016, one High Court, seven landmark cases). The generator is a hosted model with a daily free-tier quota. LawLine provides legal **information** grounded in retrieved sources; it is **not legal advice** and can still miss or misread a provision — always verify the cited passage.
""")
