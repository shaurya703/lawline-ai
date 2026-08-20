"""Central configuration. Paths are relative to the project root."""
from __future__ import annotations
import os
from pathlib import Path
from dataclasses import dataclass, field

ROOT = Path(os.environ.get("LAWLINE_ROOT", Path(__file__).resolve().parent.parent))
DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "outputs"
INDEX_DIR = OUT / "indices"
RESULTS_DIR = OUT / "results"
FIG_DIR = OUT / "figures"
MODEL_DIR = OUT / "models"
for _p in (DATA_PROCESSED, INDEX_DIR, RESULTS_DIR, FIG_DIR, MODEL_DIR):
    _p.mkdir(parents=True, exist_ok=True)

CORPUS_PATH = DATA_PROCESSED / "corpus.jsonl"
CHUNKS_PATH = DATA_PROCESSED / "chunks.jsonl"

# Models
BASE_EMBEDDING_MODEL = os.environ.get("LAWLINE_EMBED_MODEL", "BAAI/bge-small-en-v1.5")
FINETUNED_EMBEDDING_MODEL = str(MODEL_DIR / "lawline-bge-small-legal")
RERANKER_MODEL = os.environ.get("LAWLINE_RERANKER", "cross-encoder/ms-marco-MiniLM-L-6-v2")

# Chunking
CHUNK_WORDS = int(os.environ.get("LAWLINE_CHUNK_WORDS", 220))
CHUNK_OVERLAP = int(os.environ.get("LAWLINE_CHUNK_OVERLAP", 40))

# Retrieval
TOP_K_EACH = 30       # candidates from each retriever
RRF_K = 60
FINAL_K = 5           # passages handed to the LLM
RETRIEVER_WEIGHTS = {"faiss": 1.0, "bm25": 1.0, "kg": 0.7}

# LLM
GROQ_MODEL = os.environ.get("LAWLINE_GROQ_MODEL", "llama-3.1-8b-instant")
GEMINI_MODEL = os.environ.get("LAWLINE_GEMINI_MODEL", "gemini-3.5-flash-lite")
JUDGE_MODEL = os.environ.get("LAWLINE_JUDGE_MODEL", "gemini-3.6-flash")


@dataclass
class RetrievalConfig:
    use_faiss: bool = True
    use_bm25: bool = True
    use_kg: bool = True
    use_reranker: bool = True
    top_k_each: int = TOP_K_EACH
    final_k: int = FINAL_K
    rrf_k: int = RRF_K
    weights: dict = field(default_factory=lambda: dict(RETRIEVER_WEIGHTS))

    @property
    def name(self) -> str:
        parts = [n for n, on in (("faiss", self.use_faiss), ("bm25", self.use_bm25), ("kg", self.use_kg)) if on]
        s = "+".join(parts) if parts else "none"
        return s + ("+rerank" if self.use_reranker else "")
