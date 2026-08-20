"""Retrieval ablation over the frozen gold sets.

For every query the three base rankings (FAISS / BM25 / KG, top-N each) are computed once; every retriever
combination is then fused with RRF offline and optionally reranked with the cross-encoder (scores cached per
(query, chunk)). Metrics are document-level (chunks are collapsed to their parent section / judgment).
"""
from __future__ import annotations
import argparse, json, time, itertools
from collections import defaultdict
from pathlib import Path
import numpy as np
import pandas as pd
from tqdm import tqdm
from ..config import INDEX_DIR, RESULTS_DIR, BASE_EMBEDDING_MODEL, RERANKER_MODEL, RRF_K, RETRIEVER_WEIGHTS
from ..data.chunking import load_chunks
from ..index.embedder import Embedder
from ..index.faiss_index import FaissIndex
from ..index.bm25_index import BM25Index
from ..index.knowledge_graph import LegalKG
from ..retrieval.fusion import rrf
from ..retrieval.reranker import Reranker
from .gold import load_gold
from .metrics import evaluate_run, dedupe_docs

COMBOS = [("bm25",), ("faiss",), ("kg",), ("faiss", "bm25"), ("faiss", "kg"), ("bm25", "kg"), ("faiss", "bm25", "kg")]
RERANK_COMBOS = [("faiss",), ("bm25",), ("faiss", "bm25"), ("faiss", "bm25", "kg")]


def run(tag: str, embed_model: str, top_n: int = 30, rerank_n: int = 30, tasks=None, limit=None, no_rerank=False, out_name=None):
    gold = [g for g in load_gold() if not tasks or g["task"] in tasks]
    if limit:
        gold = gold[:limit]
    chunks = load_chunks(); by_id = {c.chunk_id: c for c in chunks}
    emb = Embedder(embed_model)
    faiss_idx = FaissIndex.load(INDEX_DIR / f"faiss_{tag}")
    bm25 = BM25Index.load(INDEX_DIR / "bm25")
    kg = LegalKG.load(INDEX_DIR / "kg")
    rer = None if no_rerank else Reranker(RERANKER_MODEL)

    base = {}                       # qid -> {"faiss": [...], "bm25": [...], "kg": [...]}
    lat = defaultdict(list)
    queries = [g["query"] for g in gold]
    t = time.perf_counter(); qvecs = emb.encode_queries(queries); lat["embed_batch_total_ms"].append((time.perf_counter() - t) * 1000)
    for g, qv in tqdm(list(zip(gold, qvecs)), desc="base retrieval"):
        r = {}
        t = time.perf_counter(); r["faiss"] = faiss_idx.search(qv, top_n)[0]; lat["faiss"].append((time.perf_counter() - t) * 1000)
        t = time.perf_counter(); r["bm25"] = bm25.search(g["query"], top_n); lat["bm25"].append((time.perf_counter() - t) * 1000)
        t = time.perf_counter(); r["kg"] = kg.retrieve(g["query"], top_n); lat["kg"].append((time.perf_counter() - t) * 1000)
        base[g["qid"]] = r
    # single-query embed latency sample
    for q in queries[:50]:
        t = time.perf_counter(); emb.encode_queries([q]); lat["embed_single"].append((time.perf_counter() - t) * 1000)

    runs: dict[str, dict[str, list[str]]] = {}
    for combo in COMBOS:
        name = "+".join(combo)
        runs[name] = {}
        for g in gold:
            sub = {k: base[g["qid"]][k] for k in combo}
            fused = rrf(sub, k=RRF_K, weights=RETRIEVER_WEIGHTS) if len(sub) > 1 else sub[combo[0]]
            runs[name][g["qid"]] = dedupe_docs([c for c, _ in fused])[:10]
    if rer:
        cache: dict[tuple, float] = {}
        for combo in RERANK_COMBOS:
            name = "+".join(combo) + "+rerank"
            runs[name] = {}
            for g in tqdm(gold, desc=f"rerank {name}"):
                sub = {k: base[g["qid"]][k] for k in combo}
                fused = rrf(sub, k=RRF_K, weights=RETRIEVER_WEIGHTS) if len(sub) > 1 else sub[combo[0]]
                cands = [c for c, _ in fused[:rerank_n] if c in by_id]
                todo = [c for c in cands if (g["qid"], c) not in cache]
                if todo:
                    t = time.perf_counter()
                    for c, s in rer.rerank(g["query"], [(c, by_id[c].text) for c in todo]):
                        cache[(g["qid"], c)] = s
                    lat["rerank_per_pair"].append((time.perf_counter() - t) * 1000 / len(todo))
                ranked = sorted(cands, key=lambda c: -cache[(g["qid"], c)])
                runs[name][g["qid"]] = dedupe_docs(ranked)[:10]
    # metrics per task + macro
    rows = []
    tasks_present = sorted({g["task"] for g in gold})
    for name, run_ in runs.items():
        per = {}
        for task in tasks_present:
            gt = [g for g in gold if g["task"] == task]
            per[task] = evaluate_run(run_, gt)
        macro = {m: float(np.mean([per[t][m] for t in tasks_present])) for m in per[tasks_present[0]] if m != "n"}
        for task, mm in per.items():
            rows.append({"config": name, "task": task, **mm})
        rows.append({"config": name, "task": "macro", **macro, "n": len(gold)})
    df = pd.DataFrame(rows)
    out = RESULTS_DIR / (out_name or f"ablation_{tag}")
    out.mkdir(parents=True, exist_ok=True)
    df.to_csv(out / "metrics.csv", index=False)
    json.dump({k: {"mean_ms": float(np.mean(v)), "p50_ms": float(np.median(v)), "p95_ms": float(np.percentile(v, 95))} for k, v in lat.items()},
              open(out / "latency.json", "w"), indent=2)
    json.dump({n: r for n, r in runs.items()}, open(out / "runs.json", "w"))
    json.dump({"tag": tag, "embed_model": embed_model, "reranker": None if no_rerank else RERANKER_MODEL, "top_n": top_n,
               "n_queries": len(gold), "tasks": tasks_present}, open(out / "meta.json", "w"), indent=2)
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="base"); ap.add_argument("--embed-model", default=BASE_EMBEDDING_MODEL)
    ap.add_argument("--tasks", nargs="*"); ap.add_argument("--limit", type=int); ap.add_argument("--no-rerank", action="store_true")
    ap.add_argument("--out-name"); a = ap.parse_args()
    df = run(a.tag, a.embed_model, tasks=a.tasks, limit=a.limit, no_rerank=a.no_rerank, out_name=a.out_name)
    pd.set_option("display.width", 200)
    print(df[df.task == "macro"][["config", "R@1", "R@5", "R@10", "MRR@10", "nDCG@10"]].round(3).to_string(index=False))


if __name__ == "__main__":
    main()
