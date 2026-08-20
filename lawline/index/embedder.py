"""Sentence-transformer wrapper with device auto-selection (MPS / CUDA / CPU)."""
from __future__ import annotations
import numpy as np
import torch
from sentence_transformers import SentenceTransformer
from ..config import BASE_EMBEDDING_MODEL

_CACHE: dict[str, "Embedder"] = {}


def pick_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class Embedder:
    """BGE-style models benefit from a query instruction; passages are encoded raw."""
    QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

    def __init__(self, model_name: str = BASE_EMBEDDING_MODEL, device: str | None = None, batch_size: int = 64):
        self.model_name = model_name
        self.device = device or pick_device()
        self.model = SentenceTransformer(model_name, device=self.device)
        self.model.max_seq_length = 384
        self.batch_size = batch_size
        self.dim = self.model.get_sentence_embedding_dimension()
        self.use_prefix = "bge" in model_name.lower()

    def encode_passages(self, texts: list[str], show_progress: bool = False) -> np.ndarray:
        return self.model.encode(texts, batch_size=self.batch_size, normalize_embeddings=True,
                                 convert_to_numpy=True, show_progress_bar=show_progress).astype("float32")

    def encode_queries(self, texts: list[str]) -> np.ndarray:
        if self.use_prefix:
            texts = [self.QUERY_PREFIX + t for t in texts]
        return self.model.encode(texts, batch_size=self.batch_size, normalize_embeddings=True,
                                 convert_to_numpy=True).astype("float32")


def get_embedder(model_name: str = BASE_EMBEDDING_MODEL) -> Embedder:
    if model_name not in _CACHE:
        _CACHE[model_name] = Embedder(model_name)
    return _CACHE[model_name]
