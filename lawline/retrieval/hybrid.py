"""Hybrid retriever: FAISS (semantic) + BM25 (lexical) + KG (entity) -> RRF -> cross-encoder rerank."""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from pathlib import Path
from ..config import RetrievalConfig, INDEX_DIR, CHUNKS_PATH, BASE_EMBEDDING_MODEL, ROUTE_WORDS, SHORT_QUERY_WORDS
from dataclasses import replace as _replace
from ..data.chunking import load_chunks
from ..data.schema import Chunk
from ..index.embedder import get_embedder
from ..index.faiss_index import FaissIndex
from ..index.bm25_index import BM25Index
from ..index.knowledge_graph import LegalKG
from .fusion import rrf
from .reranker import get_reranker


@dataclass
class RetrievedPassage:
    chunk: Chunk
    score: float
    sources: list[str]            # which retrievers surfaced it
    rank: int


@dataclass
class RetrievalResult:
    passages: list[RetrievedPassage]
    timings_ms: dict[str, float] = field(default_factory=dict)
    per_retriever: dict[str, list[str]] = field(default_factory=dict)
    fused: list[str] = field(default_factory=list)


class HybridRetriever:
    def __init__(self, index_dir: Path = INDEX_DIR, faiss_tag: str = "base", embed_model: str = BASE_EMBEDDING_MODEL,
                 chunks: list[Chunk] | None = None, load_reranker: bool = True):
        self.chunks = chunks or load_chunks(CHUNKS_PATH)
        self.by_id = {c.chunk_id: c for c in self.chunks}
        self.embedder = get_embedder(embed_model)
        self.faiss = FaissIndex.load(index_dir / f"faiss_{faiss_tag}")
        self.bm25 = BM25Index.load(index_dir / "bm25")
        self.kg = LegalKG.load(index_dir / "kg")
        self.reranker = get_reranker() if load_reranker else None
        self._type_masks: dict[tuple, tuple] = {}

    def type_masks(self, types: tuple):
        """(bm25 boolean mask, faiss allowed-id array) for a document-type restriction; cached."""
        if types not in self._type_masks:
            import numpy as np
            tset = set(types)
            bm = np.array([self.by_id[c].doc_type in tset if c in self.by_id else False for c in self.bm25.ids])
            fa = np.array([i for i, c in enumerate(self.faiss.ids) if c in self.by_id and self.by_id[c].doc_type in tset], dtype="int64")
            self._type_masks[types] = (bm, fa)
        return self._type_masks[types]

    def retrieve(self, query: str, cfg: RetrievalConfig | None = None) -> RetrievalResult:
        cfg = cfg or RetrievalConfig()
        route = "question"
        if cfg.auto_route and len(query.split()) > ROUTE_WORDS and cfg.use_faiss:
            # Narrative fact patterns: lexical overlap with procedural boilerplate misleads BM25 and the generic
            # cross-encoder (ablation: R@5 0.325 dense-only vs 0.023 hybrid+rerank); use the legal-tuned dense retriever.
            cfg = _replace(cfg, use_bm25=False, use_kg=False, use_reranker=False)
            route = "narrative"
        rankings, timings = {}, {}
        timings["route"] = 1.0 if route == "narrative" else 0.0
        types = tuple(cfg.doc_types)
        bm_mask, fa_allowed = self.type_masks(types) if types else (None, None)
        def keep(ranked):                               # KG results are filtered after the fact (cheap, small)
            if not types:
                return ranked[:cfg.top_k_each]
            return [(c, s) for c, s in ranked if c in self.by_id and self.by_id[c].doc_type in types][:cfg.top_k_each]
        if cfg.use_faiss:
            t = time.perf_counter()
            qv = self.embedder.encode_queries([query])
            timings["embed"] = (time.perf_counter() - t) * 1000
            t = time.perf_counter()
            rankings["faiss"] = self.faiss.search(qv, cfg.top_k_each, allowed=fa_allowed)[0]
            timings["faiss"] = (time.perf_counter() - t) * 1000
        if cfg.use_bm25:
            t = time.perf_counter()
            rankings["bm25"] = self.bm25.search(query, cfg.top_k_each, mask=bm_mask)
            timings["bm25"] = (time.perf_counter() - t) * 1000
        if cfg.use_kg:
            t = time.perf_counter()
            rankings["kg"] = keep(self.kg.retrieve(query, cfg.top_k_each * (8 if types else 1)))
            timings["kg"] = (time.perf_counter() - t) * 1000
        t = time.perf_counter()
        weights = dict(cfg.weights)
        if rankings.get("kg") and rankings["kg"][0][1] >= 0.9:
            weights["kg"] = weights.get("kg", 1.0) * cfg.kg_confident_boost
        fused = rrf(rankings, k=cfg.rrf_k, weights=weights) if len(rankings) > 1 else \
            [(d, s) for d, s in next(iter(rankings.values()), [])]
        timings["fusion"] = (time.perf_counter() - t) * 1000
        src = {}
        for name, ranked in rankings.items():
            for cid, _ in ranked:
                src.setdefault(cid, []).append(name)
        cand_n = cfg.top_k_each if cfg.use_reranker else cfg.final_k
        candidates = [(cid, s) for cid, s in fused[:cand_n] if cid in self.by_id]
        if cfg.use_reranker and self.reranker and candidates:
            t = time.perf_counter()
            reranked = self.reranker.rerank(query, [(cid, self.by_id[cid].text) for cid, _ in candidates], cfg.final_k)
            timings["rerank"] = (time.perf_counter() - t) * 1000
            final = reranked
        else:
            final = candidates[:cfg.final_k]
        # Guaranteed slot: for short questions an exact KG match (e.g. "anticipatory bail" -> BNSS s.482, whose text never
        # contains the word) is kept even when lexical/dense consensus and the generic reranker drop it. Offline evaluation
        # showed this is neutral on the benchmark (macro R@5 0.725 -> 0.724) while fixing such vocabulary-gap queries.
        if cfg.kg_guarantee_slot and rankings.get("kg") and rankings["kg"][0][1] >= 0.9 and len(query.split()) <= SHORT_QUERY_WORDS:
            top_cid = rankings["kg"][0][0]
            top_doc = top_cid.split("#c")[0]
            if top_cid in self.by_id and not any(c.split("#c")[0] == top_doc for c, _ in final):
                final = final[:max(0, cfg.final_k - 1)] + [(top_cid, rankings["kg"][0][1])]
                src.setdefault(top_cid, []).append("kg-slot")
        passages = [RetrievedPassage(self.by_id[cid], float(s), src.get(cid, []), i + 1) for i, (cid, s) in enumerate(final)]
        return RetrievalResult(passages, timings, {k: [c for c, _ in v] for k, v in rankings.items()}, [c for c, _ in fused])
