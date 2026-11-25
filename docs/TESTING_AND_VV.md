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
| `retrieval/hybrid.py` | `test_engine_api.py`, `test_core_hardening.py` | document-type filter over real (tiny) indices; unknown types return nothing and cannot grow the mask cache; an encoder of the wrong width is refused |
| `index/*` (loading) | `test_core_hardening.py` | index files that name anything but their own data types are refused on load; a FAISS file and id list of different lengths are refused; graph caches are not written to disk |
| `data/expand.py` | `test_expand.py` | corpus-expansion rules: leakage guards, duplicate detection, title and date parsing, court mapping |
| `eval/export_facts.py` | `test_facts.py` | the figures on the landing page and in the README equal the result files they are generated from |
| `index/embedder.py`, `retrieval/reranker.py`, `api_features.py` | `test_api_robustness.py` | model calls never overlap across request threads; malformed model JSON is repaired or retried once |
| `api*.py`, `ratelimit.py`, `generation/llm.py` | `test_api_hardening.py` | over-long, malformed and unknown inputs answer 422, never 500; the two regular expressions that were quadratic finish in milliseconds on adversarial input; a failing model gives 503 or the extractive fallback; the retry loop honours its deadline, does not retry a bad request and disables a backend only on a real key failure; the request budget returns 429 and recovers, and cannot be bypassed with a forged forwarding header; upload limits; the graph neighbourhood is stable and nearest-first |

Run: `pytest --cov=lawline --cov-report=term-missing` (107 tests). Tests use a 5-document fixture corpus and stub
LLM/retriever, so they run in seconds with no network and no prebuilt indices. CI runs them on Python 3.11 and 3.12 and
type-checks, lints and builds the React app on every pull request.

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
* React app: `npm run e2e` in `frontend/` drives all 22 routes in a real browser against the running API (49 checks;
  `-- --llm` includes the 11 that call the language model). Besides each module's main flow it covers failure paths:
  the API being down, a failed request being retried, model output with missing fields, a page that throws while
  rendering, keyboard handling of stacked dialogs, a real PDF upload, and sideways scrolling at phone width.
* Streamlit UI: all nine pages loaded in a browser with no exception; Counsel follow-up buttons, literal search in the
  Provision Explorer and escaping of pasted HTML checked the same way. Latency per stage is displayed for every answer.
* Before and after the hardening change, 221 requests to the deterministic endpoints were recorded and compared: 176
  retrievals over 80 benchmark questions (with and without each retriever, the reranker and the type filters), 16
  retrieval traces, and the provision, Act, glossary, limitation, quiz, statistics and citation-verification routes.
  218 bodies are identical apart from timings. The other three changed on purpose: the two graph-neighbourhood answers
  (now nearest-first and the same on every run) and the re-timed graph latency reported by `/analytics`.
* `docker compose up --build` builds a CPU image containing the prebuilt indices and fine-tuned model.

## 5. Security and robustness review
A review of the whole codebase (API, retrieval core, Streamlit app, React app, packaging) produced about eighty
findings. All but two are fixed, and covered by the tests above where a test is possible; the two left open are the
owner's to decide (adding a licence file, and moving the large per-query result files out of the repository). The main
fixes:
* Two regular expressions (case names in the knowledge graph, citations in the verifier) took quadratic time on crafted
  input, so one request could hold the server for many seconds. Both are now linear, with unchanged matches on 40,000
  fuzzed strings and on every case title in the graph.
* Request bodies and query parameters had no upper bounds, and free-text fields reached model prompts unchecked. All are
  bounded now; fields that enter a system prompt accept a restricted character set.
* Routes that call the language model share a per-client and a global request budget (`lawline/ratelimit.py`), calls
  have a timeout and a bounded wait, and a model failure degrades to the retrieved passages instead of an error page.
  When a Gemini model is overloaded the client moves to the next one in its chain, with the thinking setting that model
  accepts (the fallback models used to reject the first model's setting, so the chain never answered). The nested
  argument reply is requested with a response schema: JSON mode alone lost a closing brace in roughly one reply in three.
* Index files fetched from the assets repository are loaded through an allow-list, and the repository revision is
  pinned to a commit, so a changed remote file cannot run code on a host.
* Text from the corpus, the model or the user is escaped wherever either front end builds HTML (Streamlit pages, the
  graph tooltip, the print view).
* The knowledge-graph stage recompiled about 1,300 patterns per query: 35 ms, now 1 ms, with the stored benchmark
  rankings reproduced exactly for all 1,810 queries. Loading the chunk file uses about 60 MB less memory.

## 6. Known limitations
* KG case→case citation edges rely on fuzzy title matching (precision-oriented thresholds).
* Case-law coverage is a sample (Supreme Court Reports 1950–2025, 100 judgments from each of 24 High Courts, Patna excerpts, 7 Phase-II landmarks); long judgments are shortened; not a complete reporter.
* The LLM backend is a hosted API (Gemini); offline mode falls back to extractive answers.
