"""Engine / API tests with a stub retriever so they run without the full indices or network."""
import json
from fastapi.testclient import TestClient
from lawline.config import RetrievalConfig
from lawline.retrieval.hybrid import RetrievalResult, RetrievedPassage
from lawline.engine import QueryEngine


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


def test_doc_type_filter_config():
    cfg = RetrievalConfig(doc_types=("statute",))
    assert cfg.doc_types == ("statute",) and cfg.name == "faiss+bm25+kg+rerank"


def test_hybrid_retriever_doc_type_filter(tiny_chunks, tiny_corpus_path, tmp_path, monkeypatch):
    """The real retriever over tiny indices, with a stub encoder and no reranker."""
    import numpy as np
    from lawline.retrieval import hybrid
    from lawline.index.faiss_index import FaissIndex
    from lawline.index.bm25_index import BM25Index
    from lawline.index.knowledge_graph import LegalKG
    ids = [c.chunk_id for c in tiny_chunks]
    vecs = np.random.default_rng(0).normal(size=(len(ids), 8)).astype("float32"); vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    FaissIndex.build(ids, vecs).save(tmp_path / "faiss_base"); BM25Index.build(ids, [c.text for c in tiny_chunks]).save(tmp_path / "bm25")
    LegalKG.build(tiny_corpus_path, tiny_chunks).save(tmp_path / "kg")
    stub = type("StubEmbedder", (), {"dim": 8, "encode_queries": lambda self, texts: vecs[:1]})()
    monkeypatch.setattr(hybrid, "get_embedder", lambda name: stub)
    r = hybrid.HybridRetriever(index_dir=tmp_path, chunks=tiny_chunks, load_reranker=False)
    q = "punishment for murder under Article 21"
    assert {p.chunk.doc_type for p in r.retrieve(q).passages} == {"statute", "case"}
    assert {p.chunk.doc_type for p in r.retrieve(q, RetrievalConfig(doc_types=("case",))).passages} == {"case"}
    assert {p.chunk.doc_type for p in r.retrieve(q, RetrievalConfig(doc_types=("statute",))).passages} == {"statute"}
    assert r.retrieve(q, RetrievalConfig(doc_types=("Statute",))).passages == []       # an unknown type matches nothing
    both = r.retrieve(q, RetrievalConfig(doc_types=("statute", "case"))).passages
    for i in range(20):
        assert r.retrieve(q, RetrievalConfig(doc_types=("case", "statute", "case", f"x{i}"))).passages == both
    assert sorted(r._type_masks) == [("case",), ("case", "statute"), ("statute",)]     # one mask per real filter, however many are asked for
    assert r.faiss.ids[0] is r.chunks[0].chunk_id and r.bm25.ids[0] is r.chunks[0].chunk_id
