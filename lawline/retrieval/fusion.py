"""Reciprocal Rank Fusion (Cormack et al., 2009) with optional per-retriever weights."""
from __future__ import annotations
from collections import defaultdict


def rrf(rankings: dict[str, list[tuple[str, float]]], k: int = 60, weights: dict[str, float] | None = None) -> list[tuple[str, float]]:
    """rankings: {retriever_name: [(doc_id, score), ...] ordered best-first}. Returns fused list best-first."""
    weights = weights or {}
    fused: dict[str, float] = defaultdict(float)
    for name, ranked in rankings.items():
        w = weights.get(name, 1.0)
        for rank, (doc_id, _) in enumerate(ranked):
            fused[doc_id] += w / (k + rank + 1)
    return sorted(fused.items(), key=lambda x: -x[1])
