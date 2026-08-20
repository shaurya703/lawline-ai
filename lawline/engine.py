"""QueryEngine: orchestrates retrieval -> prompt -> generation -> cited answer."""
from __future__ import annotations
import re, time
from dataclasses import dataclass, field, asdict
from .config import RetrievalConfig
from .retrieval.hybrid import HybridRetriever, RetrievalResult
from .generation.llm import LLMClient, extractive_answer
from .generation.prompts import SYSTEM_PROMPT, USER_TEMPLATE, format_context


@dataclass
class Answer:
    question: str
    answer: str
    citations: list[dict]
    backend: str
    model: str
    timings_ms: dict
    retrieval: RetrievalResult = field(repr=False)

    def to_dict(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if k != "retrieval"}
        d["passages"] = [{"rank": p.rank, "chunk_id": p.chunk.chunk_id, "citation": p.chunk.citation,
                          "score": p.score, "sources": p.sources, "text": p.chunk.text} for p in self.retrieval.passages]
        return d


class QueryEngine:
    def __init__(self, retriever: HybridRetriever | None = None, llm: LLMClient | None = None, **retriever_kwargs):
        self.retriever = retriever or HybridRetriever(**retriever_kwargs)
        self.llm = llm if llm is not None else LLMClient()

    def ask(self, question: str, cfg: RetrievalConfig | None = None, use_llm: bool = True) -> Answer:
        t0 = time.perf_counter()
        rr = self.retriever.retrieve(question, cfg)
        timings = dict(rr.timings_ms)
        timings["retrieval_total"] = (time.perf_counter() - t0) * 1000
        backend = model = "extractive"
        if use_llm and self.llm and self.llm.available and rr.passages:
            resp = self.llm.complete(SYSTEM_PROMPT, USER_TEMPLATE.format(context=format_context(rr.passages), question=question))
            text, backend, model = resp.text, resp.backend, resp.model
            timings["generation"] = resp.latency_ms
        else:
            text = extractive_answer(rr.passages)
        cited = sorted({int(n) for n in re.findall(r"\[(\d+)\]", text)})
        citations = [{"n": p.rank, "citation": p.chunk.citation, "chunk_id": p.chunk.chunk_id, "used": p.rank in cited}
                     for p in rr.passages]
        timings["total"] = (time.perf_counter() - t0) * 1000
        return Answer(question, text, citations, backend, model, timings, rr)
