"""FAISS inner-product index over L2-normalised embeddings (== cosine similarity)."""
from __future__ import annotations
from pathlib import Path
import json
import numpy as np
import faiss

# faiss-cpu and torch ship separate OpenMP runtimes; on macOS a multi-threaded faiss search after torch
# inference segfaults. A single thread is plenty for an exact IndexFlatIP over ~10^5 vectors (~1 ms).
faiss.omp_set_num_threads(1)
from .embedder import Embedder


class FaissIndex:
    def __init__(self, dim: int):
        self.index = faiss.IndexFlatIP(dim)
        self.ids: list[str] = []

    @classmethod
    def build(cls, chunk_ids: list[str], embeddings: np.ndarray) -> "FaissIndex":
        if len(chunk_ids) != embeddings.shape[0]:
            raise ValueError("ids / embeddings length mismatch")
        idx = cls(embeddings.shape[1])
        idx.index.add(np.ascontiguousarray(embeddings, dtype="float32"))
        idx.ids = list(chunk_ids)
        return idx

    def search(self, query_vecs: np.ndarray, k: int = 10) -> list[list[tuple[str, float]]]:
        q = np.ascontiguousarray(query_vecs, dtype="float32")
        if q.ndim == 1:
            q = q[None, :]
        scores, idxs = self.index.search(q, min(k, len(self.ids)))
        return [[(self.ids[j], float(s)) for j, s in zip(row_i, row_s) if j >= 0] for row_i, row_s in zip(idxs, scores)]

    def save(self, path: Path):
        path = Path(path); path.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(path / "index.faiss"))
        json.dump(self.ids, open(path / "ids.json", "w"))

    @classmethod
    def load(cls, path: Path) -> "FaissIndex":
        path = Path(path)
        obj = cls.__new__(cls)
        obj.index = faiss.read_index(str(path / "index.faiss"))
        obj.ids = json.load(open(path / "ids.json"))
        return obj

    def __len__(self):
        return len(self.ids)
