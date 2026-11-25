"""Retrieval ablation over the frozen gold sets.

For every query the three base rankings (FAISS / BM25 / KG, top-N each) are computed once; every retriever
combination is then fused with RRF offline and optionally reranked with the cross-encoder (scores cached per
(query, chunk)). Metrics are document-level (chunks are collapsed to their parent section / judgment).
"""
from __future__ import annotations
import argparse, hashlib, json, time, itertools
from collections import defaultdict
from pathlib import Path
import numpy as np
import pandas as pd
from tqdm import tqdm
from ..config import CORPUS_VERSION, INDEX_DIR, RESULTS_DIR, BASE_EMBEDDING_MODEL, RERANKER_MODEL, RRF_K, RETRIEVER_WEIGHTS, KG_CONFIDENT_BOOST
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


def run(tag: str, embed_model: str, top_n: int = 30, rerank_n: int = 30, tasks=None, limit=None, no_rerank=False, out_name=None, reranker_model: str = RERANKER_MODEL,
        right_type: bool = False, balanced: bool = False):
    """right_type: restrict every query to the document type of its gold documents (statute or case). That is what a
    perfect statute-or-judgment router would score: a ceiling for routing, not a configuration the system ships."""
    gold = [g for g in load_gold() if not tasks or g["task"] in tasks]
    if limit:
        gold = gold[:limit]
    chunks = load_chunks(); by_id = {c.chunk_id: c for c in chunks}
    emb = Embedder(embed_model)
    faiss_idx = FaissIndex.load(INDEX_DIR / f"faiss_{tag}")
    bm25 = BM25Index.load(INDEX_DIR / "bm25")
    kg = LegalKG.load(INDEX_DIR / "kg")
    rer = None if no_rerank else Reranker(reranker_model)

    base = {}                       # qid -> {"faiss": [...], "bm25": [...], "kg": [...]}
    lat = defaultdict(list)
    queries = [g["query"] for g in gold]
    # BM25 / KG rankings are independent of the embedding model -> cache them across runs
    types_of = {g["qid"]: tuple(g.get("meta", {}).get("doc_types", ())) for g in gold}
    if right_type:
        types_of = {g["qid"]: tuple(sorted({r.split("::")[0] for r in g["relevant"]})) for g in gold}
    masks = {}
    for ty in {t for t in types_of.values() if t}:
        masks[ty] = (np.array([by_id[c].doc_type in ty if c in by_id else False for c in bm25.ids]),
                     np.array([i for i, c in enumerate(faiss_idx.ids) if c in by_id and by_id[c].doc_type in ty], dtype="int64"))
    def keep(qid, ranked):
        ty = types_of[qid]
        if not ty:
            return ranked[:top_n]
        return [(c, s) for c, s in ranked if c in by_id and by_id[c].doc_type in ty][:top_n]
    def ckey(qid):                                    # cache key carries the filter so filtered queries are versioned
        return qid if not types_of[qid] else f"{qid}|{'+'.join(types_of[qid])}|exact"
    # The cache is only valid for the indices it was computed on, so its name carries a fingerprint of them.
    fp = hashlib.md5(f"{len(bm25.ids)}|{bm25.ids[0]}|{bm25.ids[-1]}|{len(bm25.vocab)}|{kg.stats()}".encode()).hexdigest()[:10]
    cache_p = RESULTS_DIR / f"cache_bm25_kg_top{top_n}_{fp}.json"
    cached = json.load(open(cache_p)) if cache_p.exists() else {"bm25": {}, "kg": {}, "lat": {"bm25": [], "kg": []}}
    t = time.perf_counter(); qvecs = emb.encode_queries(queries); lat["embed_batch_total_ms"].append((time.perf_counter() - t) * 1000)
    dirty = False
    for g, qv in tqdm(list(zip(gold, qvecs)), desc="base retrieval"):
        r = {}
        ty = types_of[g["qid"]]; bm_mask, fa_allowed = masks.get(ty, (None, None))
        t = time.perf_counter(); r["faiss"] = faiss_idx.search(qv, top_n, allowed=fa_allowed)[0]; lat["faiss"].append((time.perf_counter() - t) * 1000)
        key = ckey(g["qid"])
        if key in cached["bm25"]:
            r["bm25"] = [tuple(x) for x in cached["bm25"][key]]; r["kg"] = [tuple(x) for x in cached["kg"][key]]
        else:
            t = time.perf_counter(); r["bm25"] = bm25.search(g["query"], top_n, mask=bm_mask); cached["lat"]["bm25"].append((time.perf_counter() - t) * 1000)
            t = time.perf_counter(); r["kg"] = keep(g["qid"], kg.retrieve(g["query"], top_n * (8 if ty else 1))); cached["lat"]["kg"].append((time.perf_counter() - t) * 1000)
            cached["bm25"][key] = r["bm25"]; cached["kg"][key] = r["kg"]; dirty = True
        base[g["qid"]] = r
    if dirty:
        json.dump(cached, open(cache_p, "w"))
    lat["bm25"] = cached["lat"]["bm25"]; lat["kg"] = cached["lat"]["kg"]
    # single-query embed latency sample
    for q in queries[:50]:
        t = time.perf_counter(); emb.encode_queries([q]); lat["embed_single"].append((time.perf_counter() - t) * 1000)

    def fuse(qid, combo, boost=KG_CONFIDENT_BOOST, weights=RETRIEVER_WEIGHTS):
        sub = {k: base[qid][k] for k in combo}
        if len(sub) == 1:
            return sub[combo[0]]
        w = dict(weights)
        if sub.get("kg") and sub["kg"][0][1] >= 0.9:
            w["kg"] = w.get("kg", 1.0) * boost
        return rrf(sub, k=RRF_K, weights=w)

    runs: dict[str, dict[str, list[str]]] = {}
    for combo in COMBOS:
        name = "+".join(combo)
        runs[name] = {g["qid"]: dedupe_docs([c for c, _ in fuse(g["qid"], combo)])[:10] for g in gold}
    # fusion-weight sensitivity (full hybrid, no reranker)
    for kgw, boost in ((0.5, 1.0), (1.0, 1.0), (1.0, 2.0), (1.0, 3.0), (2.0, 1.0)):
        name = f"faiss+bm25+kg[w_kg={kgw},boost={boost}]"
        runs[name] = {g["qid"]: dedupe_docs([c for c, _ in fuse(g["qid"], ("faiss", "bm25", "kg"), boost, {"faiss": 1, "bm25": 1, "kg": kgw})])[:10] for g in gold}
    for rk in (20, 100):
        name = f"faiss+bm25+kg[rrf_k={rk}]"
        runs[name] = {}
        for g in gold:
            sub = {k: base[g["qid"]][k] for k in ("faiss", "bm25", "kg")}
            w = dict(RETRIEVER_WEIGHTS)
            if sub["kg"] and sub["kg"][0][1] >= 0.9: w["kg"] *= KG_CONFIDENT_BOOST
            runs[name][g["qid"]] = dedupe_docs([c for c, _ in rrf(sub, k=rk, weights=w)])[:10]
    if rer:
        cache: dict[tuple, float] = {}
        for combo in RERANK_COMBOS:
            name = "+".join(combo) + "+rerank"
            runs[name] = {}
            for g in tqdm(gold, desc=f"rerank {name}"):
                fused = fuse(g["qid"], combo)
                cands = [c for c, _ in fused[:rerank_n] if c in by_id]
                todo = [c for c in cands if (g["qid"], c) not in cache]
                if todo:
                    t = time.perf_counter()
                    for c, s in rer.rerank(g["query"], [(c, by_id[c].text) for c in todo]):
                        cache[(g["qid"], c)] = s
                    lat["rerank_per_pair"].append((time.perf_counter() - t) * 1000 / len(todo))
                ranked = sorted(cands, key=lambda c: -cache[(g["qid"], c)])
                runs[name][g["qid"]] = dedupe_docs(ranked)[:10]
        if balanced:
            # Experiment: gather candidates per document type, so that judgments (two thirds of the chunks) cannot crowd
            # provisions out of the pool; the reranker still decides the final order. `per` candidates of each type.
            tmask = {ty: (np.array([by_id[c].doc_type in ty if c in by_id else False for c in bm25.ids]),
                          np.array([i for i, c in enumerate(faiss_idx.ids) if c in by_id and by_id[c].doc_type in ty], dtype="int64")) for ty in (("statute",), ("case",))}
            def typed(g, qv, ty):
                bm, fa = tmask[ty]
                sub = {"faiss": faiss_idx.search(qv, top_n, allowed=fa)[0], "bm25": bm25.search(g["query"], top_n, mask=bm),
                       "kg": [(c, s) for c, s in kg.retrieve(g["query"], top_n * 8) if c in by_id and by_id[c].doc_type in ty][:top_n]}
                w = dict(RETRIEVER_WEIGHTS)
                if sub["kg"] and sub["kg"][0][1] >= 0.9:
                    w["kg"] = w.get("kg", 1.0) * KG_CONFIDENT_BOOST
                return [c for c, _ in rrf(sub, k=RRF_K, weights=w) if c in by_id]
            pools: dict[str, dict] = {}
            for per in (15, 30):
                name = f"faiss+bm25+kg+rerank[balanced={per}]"; runs[name] = {}
                for g, qv in tqdm(list(zip(gold, qvecs)), desc=name):
                    if types_of[g["qid"]]:                    # the query is already restricted to one type
                        runs[name][g["qid"]] = runs["faiss+bm25+kg+rerank"][g["qid"]]; continue
                    if g["qid"] not in pools:
                        pools[g["qid"]] = {ty: typed(g, qv, ty) for ty in tmask}
                    cands = list(dict.fromkeys(c for ty in tmask for c in pools[g["qid"]][ty][:per]))
                    todo = [c for c in cands if (g["qid"], c) not in cache]
                    if todo:
                        for c, sc in rer.rerank(g["query"], [(c, by_id[c].text) for c in todo]):
                            cache[(g["qid"], c)] = sc
                    runs[name][g["qid"]] = dedupe_docs(sorted(cands, key=lambda c: -cache[(g["qid"], c)]))[:10]
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
    json.dump({"tag": tag, "embed_model": embed_model, "reranker": None if no_rerank else reranker_model, "top_n": top_n,
               "n_queries": len(gold), "tasks": tasks_present, "chunks": len(chunks), "right_type": right_type, "corpus": CORPUS_VERSION}, open(out / "meta.json", "w"), indent=2)
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="base"); ap.add_argument("--embed-model", default=BASE_EMBEDDING_MODEL)
    ap.add_argument("--tasks", nargs="*"); ap.add_argument("--limit", type=int); ap.add_argument("--no-rerank", action="store_true")
    ap.add_argument("--out-name"); ap.add_argument("--reranker-model", default=RERANKER_MODEL)
    ap.add_argument("--right-type", action="store_true", help="restrict each query to the document type of its answer (a routing ceiling)")
    ap.add_argument("--balanced", action="store_true", help="also evaluate type-balanced candidate pools (an experiment; use with --out-name)")
    a = ap.parse_args()
    df = run(a.tag, a.embed_model, tasks=a.tasks, limit=a.limit, no_rerank=a.no_rerank, out_name=a.out_name, reranker_model=a.reranker_model,
             right_type=a.right_type, balanced=a.balanced)
    pd.set_option("display.width", 200)
    print(df[df.task == "macro"][["config", "R@1", "R@5", "R@10", "MRR@10", "nDCG@10"]].round(3).to_string(index=False))


if __name__ == "__main__":
    main()
