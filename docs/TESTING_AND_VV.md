# System testing, verification & validation

## 1. Unit / integration tests (`pytest`)
| Module | Test | What it verifies |
|---|---|---|
| `data/chunking.py` | `test_chunking.py` | overlap preserved, no words lost, metadata propagated, statute header + citation string, empty-doc handling, invalid params rejected |
| `retrieval/fusion.py` | `test_fusion_metrics.py` | RRF rewards consensus, weights change ordering |
| `eval/metrics.py` | `test_fusion_metrics.py` | Recall@k, Hit@k, P@k, MRR, nDCG against hand-computed values; chunk→doc collapsing |
| `index/bm25_index.py` | `test_indices.py` | legal tokenizer keeps `498a`, stop-words removed; build/search/save/load round-trip; no false positives |
| `index/faiss_index.py` | `test_indices.py` | exact self-match (cos = 1), save/load round-trip |
| `index/knowledge_graph.py` | `test_indices.py` | node/edge construction, mention extraction (act aliases, sections, articles, case names, concepts), one-hop expansion, ambiguity handling |
| `engine.py` | `test_engine_api.py` | extractive fallback, citation parsing (`[1]`, `[1, 3]`), answer serialisation |
| `api.py` | `test_engine_api.py` | `/health`, `/query`, `/retrieve`, input validation (422), retriever toggles |

Run: `pytest --cov=lawline --cov-report=term-missing`. Tests use a 5-document fixture corpus and stub LLM/retriever, so
they run in seconds with no network and no prebuilt indices.

## 2. Data verification
* Corpus ids are unique (asserted during ingest); every gold label is checked to exist in the corpus
  (`lawline/eval/gold.py`) — labels whose provision is absent are dropped and counted.
* IPC coverage: all 159 sections appearing in the held-out IPC-facts test set exist in the corpus (verified after the
  bare-acts IPC was found incomplete and replaced).
* Constitution parser: 496 articles including inserted articles (21A, 243B, 239AA…), spot-checked against India Code.
* Leakage: BNS-QA split by section, IPC facts split by case (test cases excluded from the corpus and from training),
  SC summaries never used for training. The Hanno test split is materialised to `data/processed/hanno_test.parquet`
  before the corpus is built so the exclusion is mechanical, not by convention.

## 3. Validation (does it answer the right thing?)
* Retrieval: 1,810 frozen gold queries across four tasks; document-level Recall@k / MRR / nDCG; full ablation over
  retriever combinations, fusion weights, reranking and embedding model (`outputs/results/ablation_*`).
* Generation: AIBE multiple-choice accuracy (closed-book vs RAG) and LLM-as-judge correctness / faithfulness with a
  judge model from a different family than the generator, plus automatic citation checks
  (retrieval-hit, gold-cited, fabricated-citation rate) (`outputs/results/answer_eval`).
* Manual smoke queries (Section 420, dowry death, Maneka Gandhi, BNSS anticipatory bail, cheque bounce) are recorded in
  `docs/EXAMPLES.md`.

## 4. Deployment verification
* `GET /health` liveness; `POST /query` round-trip tested with `TestClient` and with `curl` against a live uvicorn.
* Streamlit UI exercised manually; latency per stage displayed in the UI for every answer.
* `docker compose up --build` builds a CPU image containing the prebuilt indices and fine-tuned model.

## 5. Known limitations
* KG case→case citation edges rely on fuzzy title matching (precision-oriented thresholds).
* Case-law coverage is SCR 2016 + Patna HC excerpts + 7 landmark judgments; not a complete reporter.
* The LLM backend is a hosted API (Gemini); offline mode falls back to extractive answers.
