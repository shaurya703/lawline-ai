"""Chunk-size / overlap sweep on a controlled sub-corpus (core statutes + SC 2016 judgments).
Each configuration is re-chunked, re-embedded and re-indexed (FAISS + BM25); retrieval quality is measured on the
same gold queries. Results -> outputs/results/chunk_sweep.csv"""
from __future__ import annotations
import argparse, json, time
import numpy as np
import pandas as pd
from ..config import CORPUS_PATH, RESULTS_DIR, RRF_K, BASE_EMBEDDING_MODEL
from ..data.schema import Document, read_jsonl
from ..data.chunking import chunk_document
from ..index.embedder import Embedder
from ..index.faiss_index import FaissIndex
from ..index.bm25_index import BM25Index
from ..retrieval.fusion import rrf
from .gold import load_gold
from .metrics import evaluate_run, dedupe_docs

CORE_ACTS = {"Indian Penal Code, 1860", "Bharatiya Nyaya Sanhita, 2023", "Bharatiya Nagarik Suraksha Sanhita, 2023",
             "Bharatiya Sakshya Adhiniyam, 2023", "Constitution of India, 1949", "Code of Criminal Procedure Act, 1973",
             "Indian Evidence Act, 1872", "Indian Contract Act, 1872"}
GRID = [(80, 0), (120, 20), (160, 30), (220, 40), (320, 60), (450, 80)]


def sub_corpus() -> list[Document]:
    docs = []
    for d in read_jsonl(CORPUS_PATH):
        if (d["doc_type"] == "statute" and d["act"] in CORE_ACTS) or d["doc_id"].startswith("case::sc2016::"):
            docs.append(Document.from_dict(d))
    return docs


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--embed-model", default=BASE_EMBEDDING_MODEL)
    ap.add_argument("--per-task", type=int, default=150); a = ap.parse_args()
    docs = sub_corpus(); ids = {d.doc_id for d in docs}
    gold = []
    for t in ("bns_qa", "ipc_facts", "const_qa", "sc_case"):
        g = [x for x in load_gold(t) if all(r in ids for r in x["relevant"])][: a.per_task]
        gold += g
    emb = Embedder(a.embed_model)
    qvecs = emb.encode_queries([g["query"] for g in gold])
    rows = []
    for size, ov in GRID:
        t0 = time.perf_counter()
        chunks = [c for d in docs for c in chunk_document(d, size, ov)]
        vecs = emb.encode_passages([c.text for c in chunks]); t_emb = time.perf_counter() - t0
        cids = [c.chunk_id for c in chunks]
        fi = FaissIndex.build(cids, vecs); bm = BM25Index.build(cids, [c.text for c in chunks])
        runs = {"faiss": {}, "bm25": {}, "faiss+bm25": {}}
        for g, qv in zip(gold, qvecs):
            f = fi.search(qv, 30)[0]; b = bm.search(g["query"], 30)
            runs["faiss"][g["qid"]] = dedupe_docs([c for c, _ in f])[:10]
            runs["bm25"][g["qid"]] = dedupe_docs([c for c, _ in b])[:10]
            runs["faiss+bm25"][g["qid"]] = dedupe_docs([c for c, _ in rrf({"faiss": f, "bm25": b}, k=RRF_K)])[:10]
        for name, run in runs.items():
            per_task = {t: evaluate_run(run, [g for g in gold if g["task"] == t]) for t in sorted({g["task"] for g in gold})}
            macro = {m: float(np.mean([v[m] for v in per_task.values()])) for m in ("R@1", "R@5", "R@10", "MRR@10", "nDCG@10")}
            rows.append({"chunk_words": size, "overlap": ov, "retriever": name, "n_chunks": len(chunks),
                         "embed_s": round(t_emb, 1), **macro, **{f"{t}_R@5": v["R@5"] for t, v in per_task.items()}})
            print(rows[-1])
    df = pd.DataFrame(rows); df.to_csv(RESULTS_DIR / "chunk_sweep.csv", index=False)
    json.dump({"docs": len(docs), "queries": len(gold), "grid": GRID, "embed_model": a.embed_model}, open(RESULTS_DIR / "chunk_sweep_meta.json", "w"), indent=2)


if __name__ == "__main__":
    main()
