"""Document-level ranking metrics. `ranked` is a best-first list of doc_ids; `relevant` a set of doc_ids."""
from __future__ import annotations
import math
from collections import defaultdict


def dedupe_docs(chunk_ids: list[str]) -> list[str]:
    """Map a ranked chunk list to a ranked doc list (first occurrence wins)."""
    seen, out = set(), []
    for cid in chunk_ids:
        d = cid.split("#c")[0]
        if d not in seen:
            seen.add(d); out.append(d)
    return out


def recall_at_k(ranked, relevant, k) -> float:
    return len(set(ranked[:k]) & relevant) / len(relevant) if relevant else 0.0


def hit_at_k(ranked, relevant, k) -> float:
    return 1.0 if set(ranked[:k]) & relevant else 0.0


def precision_at_k(ranked, relevant, k) -> float:
    return len(set(ranked[:k]) & relevant) / k


def reciprocal_rank(ranked, relevant, k=10) -> float:
    for i, d in enumerate(ranked[:k]):
        if d in relevant:
            return 1.0 / (i + 1)
    return 0.0


def ndcg_at_k(ranked, relevant, k=10) -> float:
    dcg = sum(1.0 / math.log2(i + 2) for i, d in enumerate(ranked[:k]) if d in relevant)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(min(len(relevant), k)))
    return dcg / idcg if idcg else 0.0


def evaluate_run(run: dict[str, list[str]], gold: list[dict], ks=(1, 3, 5, 10)) -> dict[str, float]:
    """run: qid -> ranked doc ids. Returns mean metrics over gold queries."""
    agg = defaultdict(list)
    for g in gold:
        ranked, rel = run.get(g["qid"], []), set(g["relevant"])
        for k in ks:
            agg[f"R@{k}"].append(recall_at_k(ranked, rel, k))
            agg[f"Hit@{k}"].append(hit_at_k(ranked, rel, k))
        agg["MRR@10"].append(reciprocal_rank(ranked, rel, 10))
        agg["nDCG@10"].append(ndcg_at_k(ranked, rel, 10))
        agg["P@5"].append(precision_at_k(ranked, rel, 5))
    return {m: sum(v) / len(v) for m, v in agg.items()} | {"n": len(gold)}
