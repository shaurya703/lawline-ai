"""FastAPI wrapper around the QueryEngine."""
from __future__ import annotations
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .config import RetrievalConfig
from . import __version__

app = FastAPI(title="LawLine AI", version=__version__, description="Hybrid RAG for Indian legal research")
_engine = None


def get_engine():
    global _engine
    if _engine is None:
        from .engine import QueryEngine
        _engine = QueryEngine(faiss_tag=os.environ.get("LAWLINE_FAISS_TAG", "base"),
                              embed_model=os.environ.get("LAWLINE_EMBED_MODEL", None) or __import__("lawline.config", fromlist=["BASE_EMBEDDING_MODEL"]).BASE_EMBEDDING_MODEL)
    return _engine


class QueryIn(BaseModel):
    question: str = Field(..., min_length=3, max_length=4000)
    use_llm: bool = True
    use_faiss: bool = True
    use_bm25: bool = True
    use_kg: bool = True
    use_reranker: bool = True
    final_k: int = Field(5, ge=1, le=20)
    doc_types: list[str] = Field(default_factory=list, description='e.g. ["statute"] or ["case"]; empty = all')


def _cfg(q: QueryIn) -> RetrievalConfig:
    return RetrievalConfig(use_faiss=q.use_faiss, use_bm25=q.use_bm25, use_kg=q.use_kg, use_reranker=q.use_reranker, final_k=q.final_k, doc_types=tuple(q.doc_types))


@app.get("/health")
def health():
    return {"status": "ok", "version": __version__}


@app.post("/query")
def query(q: QueryIn):
    if not any((q.use_faiss, q.use_bm25, q.use_kg)):
        raise HTTPException(400, "enable at least one retriever")
    return get_engine().ask(q.question, _cfg(q), use_llm=q.use_llm).to_dict()


@app.post("/retrieve")
def retrieve(q: QueryIn):
    rr = get_engine().retriever.retrieve(q.question, _cfg(q))
    return {"passages": [{"rank": p.rank, "chunk_id": p.chunk.chunk_id, "citation": p.chunk.citation, "score": p.score,
                          "sources": p.sources, "text": p.chunk.text} for p in rr.passages], "timings_ms": rr.timings_ms}
