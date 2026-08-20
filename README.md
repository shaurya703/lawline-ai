# LawLine AI — Conversational Assistant for Legal Support

Hybrid Retrieval-Augmented Generation for Indian law: FAISS (semantic) + BM25 (lexical) + legal knowledge graph
(entity) → Reciprocal Rank Fusion → cross-encoder reranking → grounded, cited answers from an LLM.
Includes a legally fine-tuned bi-encoder, a 1,810-query evaluation benchmark across four tasks, a pytest suite,
FastAPI + Streamlit deployment and a paper draft (`paper/`).

```
lawline/
  data/        ingest.py (corpus build), constitution.py (article parser), chunking.py, schema.py
  index/       embedder.py, faiss_index.py, bm25_index.py, knowledge_graph.py
  retrieval/   fusion.py (RRF), reranker.py, hybrid.py
  generation/  llm.py (Gemini / Groq / extractive fallback), prompts.py
  engine.py    QueryEngine (retrieve → prompt → generate → citations)
  api.py       FastAPI  ·  app.py  Streamlit UI
  eval/        gold.py, metrics.py, run_ablation.py, chunk_sweep.py, answer_eval.py, plots.py
  training/    train_biencoder.py
scripts/       build_indices.py, run_api.sh, run_ui.sh
tests/         unit + API tests (no network / indices needed)
```

## Quick start
```bash
python3.12 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
cp .env.example .env                      # add GEMINI_API_KEY (or GROQ_API_KEY)
python -m lawline.data.ingest             # raw datasets -> data/processed/corpus.jsonl   (see docs/DATA_SOURCES.md)
python scripts/build_indices.py           # chunks, BM25, knowledge graph, FAISS (base embeddings)
python -m lawline.eval.gold               # frozen gold sets + training pairs
python -m lawline.training.train_biencoder            # fine-tune retriever -> outputs/models/lawline-bge-small-legal
python scripts/build_indices.py --skip-chunks --only faiss --tag ft --embed-model outputs/models/lawline-bge-small-legal
python -m lawline.eval.run_ablation --tag base        # retrieval ablation (base embeddings)
python -m lawline.eval.run_ablation --tag ft --embed-model outputs/models/lawline-bge-small-legal
python -m lawline.eval.chunk_sweep; python -m lawline.eval.answer_eval --tag ft --embed-model outputs/models/lawline-bge-small-legal
python -m lawline.eval.plots              # figures -> outputs/figures
pytest                                    # tests
LAWLINE_FAISS_TAG=ft LAWLINE_EMBED_MODEL=outputs/models/lawline-bge-small-legal scripts/run_api.sh   # http://localhost:8000/docs
LAWLINE_FAISS_TAG=ft LAWLINE_EMBED_MODEL=outputs/models/lawline-bge-small-legal scripts/run_ui.sh    # http://localhost:8501
```
Docker: `docker compose up --build` (serves API on :8000 and UI on :8501).

Disclaimer: LawLine AI provides legal *information* grounded in retrieved sources; it is not legal advice.
