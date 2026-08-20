"""Cross-encoder reranker."""
from __future__ import annotations
from sentence_transformers import CrossEncoder
from ..config import RERANKER_MODEL
from ..index.embedder import pick_device

_CACHE = {}


class Reranker:
    def __init__(self, model_name: str = RERANKER_MODEL, max_length: int = 512):
        self.model_name = model_name
        self.model = CrossEncoder(model_name, max_length=max_length, device=pick_device())

    def rerank(self, query: str, candidates: list[tuple[str, str]], top_k: int | None = None) -> list[tuple[str, float]]:
        """candidates: [(chunk_id, text)] -> [(chunk_id, score)] best-first."""
        if not candidates:
            return []
        scores = self.model.predict([(query, t) for _, t in candidates], batch_size=32, show_progress_bar=False)
        ranked = sorted(zip((c for c, _ in candidates), map(float, scores)), key=lambda x: -x[1])
        return ranked[:top_k] if top_k else ranked


def get_reranker(model_name: str = RERANKER_MODEL) -> Reranker:
    if model_name not in _CACHE:
        _CACHE[model_name] = Reranker(model_name)
    return _CACHE[model_name]
