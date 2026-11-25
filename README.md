# LawLine AI — Conversational Assistant for Legal Support

**Live app:** https://lawline-ai.streamlit.app · assets: https://huggingface.co/datasets/shaurya2121/lawline-ai-assets

Hybrid Retrieval-Augmented Generation for Indian law: FAISS (semantic) + BM25 (lexical) + legal knowledge graph
(entity) → Reciprocal Rank Fusion → cross-encoder reranking → grounded, cited answers from an LLM.
Includes a legally fine-tuned bi-encoder, a 1,810-query evaluation benchmark across four tasks, a pytest suite,
FastAPI + Streamlit deployment and a paper draft (`paper/`).

The corpus holds the provisions of about a thousand central Acts and judgments of the Supreme Court (a sample of
every year from 1950 to 2025) and of all 25 High Courts; the counts are under Results. Sources and selection rules:
`docs/DATA_SOURCES.md`.

```
lawline/
  data/        ingest.py (corpus build), expand.py (v2: more judgments, completed Acts), constitution.py, chunking.py, schema.py
  index/       embedder.py, faiss_index.py, bm25_index.py, knowledge_graph.py
  retrieval/   fusion.py (RRF), reranker.py, hybrid.py
  generation/  llm.py (Gemini / Groq / extractive fallback), prompts.py
  engine.py    QueryEngine (retrieve → prompt → generate → citations)
  api.py       FastAPI  ·  app.py  Streamlit UI
  eval/        gold.py, metrics.py, run_ablation.py, landmark_eval.py, chunk_sweep.py, answer_eval.py, plots.py
  training/    train_biencoder.py
scripts/       build_indices.py, run_api.sh, run_ui.sh
tests/         unit + API tests (no network / indices needed)
```

## React front-end (`frontend/`)
A landing page and a 22-route application. Nineteen modules are grouped by the job they do: **Ask & learn** (Counsel, Rights Guides, Offence Lookup, Glossary, Bar Exam Trainer), **Statutes** (Provision Explorer, IPC → BNS Bridge, Compare Provisions, Knowledge Graph, Limitation Clock), **Documents** (Document Analyzer, Judgment Summarizer, Case Timeline, Argument Arena, Citation Verifier, Drafting Studio) and **Evaluation** (Retrieval Lab, Analytics, Methodology), plus Overview, Case Files and Settings. Vite 6 · React 19 · TypeScript · Tailwind v4 · Plotly · react-force-graph-3d.
```bash
LAWLINE_FAISS_TAG=ft LAWLINE_EMBED_MODEL=outputs/models/lawline-bge-small-legal scripts/run_api.sh   # backend :8000 (lawline/api.py + api_ext.py)
cd frontend && npm install && npm run dev                                                         # http://localhost:5173
```
Design system: `.claude/skills/frontend-design/SKILL.md` and `design-system/lawline-ai/MASTER.md`.

## Quick start
To run the app without rebuilding anything, fetch the prebuilt chunks, indices and fine-tuned encoder from the
assets repo (`python -m lawline.bootstrap`; add `--corpus` for `corpus.jsonl`) and skip to the last three lines.
`corpus.jsonl` and `chunks.jsonl` are not in git: since the v2 corpus they exceed GitHub's 100 MB file limit.
```bash
python3.12 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
cp .env.example .env                      # add GEMINI_API_KEY (or GROQ_API_KEY)
python -m lawline.data.ingest             # raw datasets -> data/processed/corpus.jsonl   (see docs/DATA_SOURCES.md)
python -m lawline.data.expand             # optional: add Supreme Court 1950-2025, 25 High Courts and missing sections of key Acts
python scripts/build_indices.py           # chunks, BM25, knowledge graph, FAISS (base embeddings)
python -m lawline.eval.gold               # frozen gold sets + training pairs
python -m lawline.training.train_biencoder            # fine-tune retriever -> outputs/models/lawline-bge-small-legal
python scripts/build_indices.py --skip-chunks --only faiss --tag ft --embed-model outputs/models/lawline-bge-small-legal
python -m lawline.eval.run_ablation --tag base        # retrieval ablation (base embeddings)
python -m lawline.eval.run_ablation --tag ft --embed-model outputs/models/lawline-bge-small-legal
python -m lawline.eval.postprocess        # adds the routed "LawLine" row to both ablations
python -m lawline.eval.landmark_eval      # landmark-judgment coverage test (73 doctrinal questions)
python -m lawline.eval.chunk_sweep; python -m lawline.eval.answer_eval --tag ft --embed-model outputs/models/lawline-bge-small-legal
python -m lawline.eval.make_tables        # tables -> outputs/results/tables
python -m lawline.eval.plots              # figures -> outputs/figures
pytest                                    # tests
LAWLINE_FAISS_TAG=ft LAWLINE_EMBED_MODEL=outputs/models/lawline-bge-small-legal scripts/run_api.sh   # http://localhost:8000/docs
LAWLINE_FAISS_TAG=ft LAWLINE_EMBED_MODEL=outputs/models/lawline-bge-small-legal scripts/run_ui.sh    # http://localhost:8501
```
Docker: `docker compose up --build` (serves API on :8000 and UI on :8501).
The image copies prebuilt artefacts rather than building them, so run the index and
training steps above first, or fetch them with `python -m lawline.bootstrap`: `data/processed/chunks.jsonl`,
`outputs/indices/` and `outputs/models/` are gitignored, and without them the build fails at the first `COPY` of them.

## Results (see `outputs/results/tables`, `outputs/figures` and the app's Analytics page)

<!-- results:start (generated by lawline.eval.export_facts) -->

Benchmark: 1,810 held-out queries, four tasks (BNS-QA, IPC fact-pattern→section, Constitution-QA, SC case retrieval), document-level metrics, macro-averaged.
Numbers are for the current corpus (v2, 53,746 documents); the first corpus (v1, 42,868 documents) is in brackets.

| System | R@1 | R@5 | nDCG@10 |
|---|---|---|---|
| BM25 | 0.394 (0.449) | 0.527 (0.559) | 0.482 (0.525) |
| Dense, off the shelf (bge-small) | 0.358 (0.431) | 0.472 (0.541) | 0.441 (0.503) |
| Hybrid: dense + BM25 + graph, fused and reranked | 0.445 (0.515) | 0.594 (0.625) | 0.540 (0.586) |
| Dense, legally fine-tuned | 0.422 (0.526) | 0.648 (0.709) | 0.580 (0.664) |
| **LawLine: fine-tuned + hybrid + routing** | **0.490** (0.563) | **0.694** (0.725) | **0.637** (0.685) |

The v2 corpus adds 5,367 Supreme Court judgments (1950–2025), 2,400 High Court judgments and 3,111 statute sections.
The expansion added no benchmark answer, so the drop from v1 measures distraction: judgments on the same topic now
compete with the section a question is about.
Restricting each query to the document type of its answer scores 0.714 macro R@5, the ceiling for a statute-or-judgment router that is not built.

In exchange the system can cite leading cases. On 73 doctrinal questions that each turn on a well-known Supreme Court
judgment (never named in the question), that judgment is among the first five documents retrieved for 82 % of questions,
against 4 % on v1, which held 3 of the judgments. Every target was added to v2 by name, so this shows that an added judgment
can be found from a plain question; it does not measure how much case law is covered (`lawline/eval/landmark_eval.py`).

Fine-tuning lifts IPC fact-pattern→section retrieval from 0.00 to 0.315 R@5 and BNS-QA from 0.29 to 0.65 on unseen sections.
Grounding raises AIBE accuracy from 64.7 % to 68.0 % (n = 150) and judged faithfulness to 2.0/2 with 75 % of answers citing the gold provision (measured on v1, not re-run on v2).
Retrieval latency on a laptop (median): embed 5 ms · FAISS 4 ms · BM25 4 ms · KG 35 ms · reranker ≈ 0.15 s.

<!-- results:end -->
`docs/REPORT_PHASE3_CHAPTERS.md` and `paper/` describe the v1 corpus and its results.

Disclaimer: LawLine AI provides legal *information* grounded in retrieved sources; it is not legal advice.
