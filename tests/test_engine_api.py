"""Engine / API tests with a stub retriever so they run without the full indices or network."""
import json
from dataclasses import dataclass
from fastapi.testclient import TestClient
from lawline.config import RetrievalConfig
from lawline.retrieval.hybrid import RetrievalResult, RetrievedPassage
from lawline.engine import QueryEngine
from lawline.generation.llm import extractive_answer


class StubRetriever:
    def __init__(self, chunks):
        self.chunks = chunks
    def retrieve(self, query, cfg=None):
        ps = [RetrievedPassage(c, 1.0 - i * 0.1, ["bm25"], i + 1) for i, c in enumerate(self.chunks[:3])]
        return RetrievalResult(ps, {"bm25": 1.0}, {"bm25": [c.chunk_id for c in self.chunks[:3]]}, [c.chunk_id for c in self.chunks])


class StubLLM:
    available = ["stub"]
    def complete(self, system, user):
        from lawline.generation.llm import LLMResponse
        assert "Context passages" in user and "[1]" in user
        return LLMResponse("Murder is punishable with death or life imprisonment [1]. Not legal advice.", "stub", "stub-1", 12.0)


def test_engine_extractive_mode(tiny_chunks):
    eng = QueryEngine(retriever=StubRetriever(tiny_chunks), llm=None)
    a = eng.ask("punishment for murder", use_llm=False)
    assert a.backend == "extractive" and "Section 302" in a.answer
    assert len(a.citations) == 3 and "total" in a.timings_ms
    assert json.dumps(a.to_dict())


def test_engine_llm_citations(tiny_chunks):
    eng = QueryEngine(retriever=StubRetriever(tiny_chunks), llm=StubLLM())
    a = eng.ask("punishment for murder")
    assert a.backend == "stub" and a.citations[0]["used"] is True and a.citations[1]["used"] is False


def test_retrieval_config_name():
    assert RetrievalConfig().name == "faiss+bm25+kg+rerank"
    assert RetrievalConfig(use_kg=False, use_reranker=False).name == "faiss+bm25"


def test_api_endpoints(tiny_chunks, monkeypatch):
    from lawline import api
    monkeypatch.setattr(api, "_engine", QueryEngine(retriever=StubRetriever(tiny_chunks), llm=StubLLM()))
    client = TestClient(api.app)
    assert client.get("/health").json()["status"] == "ok"
    r = client.post("/query", json={"question": "punishment for murder", "use_llm": True})
    assert r.status_code == 200
    body = r.json()
    assert body["answer"].startswith("Murder") and body["passages"][0]["citation"].startswith("Section 302")
    r = client.post("/query", json={"question": ""})
    assert r.status_code == 422
    r = client.post("/retrieve", json={"question": "murder", "final_k": 2})
    assert r.status_code == 200 and len(r.json()["passages"]) <= 3
