import os
import pickle
import numpy as np
import pytest
from lawline.config import RetrievalConfig
from lawline.data.chunking import load_chunks
from lawline.data.schema import write_jsonl
from lawline.index.bm25_index import BM25Index
from lawline.index.faiss_index import FaissIndex
from lawline.index.knowledge_graph import LegalKG


class _Evil:
    def __reduce__(self):
        return os.system, ("echo pwned",)


def test_kg_load_refuses_foreign_callables(tmp_path):
    (tmp_path / "kg.pkl").write_bytes(pickle.dumps({"g": _Evil()}))
    with pytest.raises(pickle.UnpicklingError, match="kg.pkl references"):
        LegalKG.load(tmp_path)


def test_bm25_load_refuses_foreign_callables(tmp_path):
    (tmp_path / "bm25.pkl").write_bytes(pickle.dumps({"format": 3, "ids": _Evil()}, protocol=4))
    with pytest.raises(pickle.UnpicklingError, match="bm25.pkl references"):
        BM25Index.load(tmp_path)


def test_kg_save_leaves_out_caches_and_loads_older_files(tiny_corpus_path, tiny_chunks, tmp_path):
    kg = LegalKG.build(tiny_corpus_path, tiny_chunks)
    q = "What did Maneka Gandhi v. Union of India decide under Article 21?"
    hits, st = kg.retrieve(q), kg.stats()
    list(kg.g.in_degree()); list(kg.g.out_degree())                     # leave networkx's cached views on the graph
    kg.save(tmp_path / "new")
    with open(tmp_path / "new" / "kg.pkl", "rb") as f:
        assert not any(k.startswith("_") for k in pickle.load(f))
    (tmp_path / "old").mkdir()                                          # the format written before caches existed
    (tmp_path / "old" / "kg.pkl").write_bytes(pickle.dumps({k: v for k, v in kg.__dict__.items() if not k.startswith("_")}))
    for d in ("new", "old"):
        kg2 = LegalKG.load(tmp_path / d)
        assert kg2.retrieve(q) == hits and kg2.stats() == st


def test_faiss_load_rejects_ids_from_another_build(tmp_path):
    vecs = np.eye(4, 8, dtype="float32")
    FaissIndex.build([f"d{i}#c0" for i in range(4)], vecs).save(tmp_path)
    (tmp_path / "ids.json").write_text('["d0#c0", "d1#c0"]')
    with pytest.raises(ValueError, match="4 vectors but ids.json lists 2"):
        FaissIndex.load(tmp_path)


def test_faiss_search_with_nothing_allowed(tmp_path):
    idx = FaissIndex.build([f"d{i}#c0" for i in range(4)], np.eye(4, 8, dtype="float32"))
    assert idx.search(np.eye(2, 8, dtype="float32"), k=3, allowed=np.array([], dtype="int64")) == [[], []]


def test_load_chunks_shares_repeated_strings(tiny_chunks, tmp_path):
    write_jsonl(tmp_path / "chunks.jsonl", (c.to_json() for c in tiny_chunks))
    loaded = load_chunks(tmp_path / "chunks.jsonl")
    assert [c.to_json() for c in loaded] == [c.to_json() for c in tiny_chunks]
    maneka = [c for c in loaded if c.doc_type == "case"]
    assert len(maneka) > 1 and maneka[0].title is maneka[1].title and maneka[0].doc_id is maneka[1].doc_id


def test_doc_types_are_canonicalised(tiny_chunks, tiny_corpus_path, tmp_path, monkeypatch):
    from lawline.retrieval import hybrid
    ids = [c.chunk_id for c in tiny_chunks]
    vecs = np.random.default_rng(0).normal(size=(len(ids), 8)).astype("float32"); vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    FaissIndex.build(ids, vecs).save(tmp_path / "faiss_base"); BM25Index.build(ids, [c.text for c in tiny_chunks]).save(tmp_path / "bm25")
    LegalKG.build(tiny_corpus_path, tiny_chunks).save(tmp_path / "kg")
    stub = type("StubEmbedder", (), {"dim": 8, "encode_queries": lambda self, texts: vecs[:1]})()
    monkeypatch.setattr(hybrid, "get_embedder", lambda name: stub)
    r = hybrid.HybridRetriever(index_dir=tmp_path, chunks=tiny_chunks, load_reranker=False)
    assert r.doc_types == {"statute", "case"}
    q = "cheating under section 420 IPC"
    ref = [p.chunk.chunk_id for p in r.retrieve(q, RetrievalConfig(doc_types=("statute",))).passages]
    for types in (("statute", "statute"), ("statute", "statutes"), ["statute", "Case"]):
        assert [p.chunk.chunk_id for p in r.retrieve(q, RetrievalConfig(doc_types=types)).passages] == ref
    for types in (("statutes",), ("",), ("Statute", "CASE")):
        assert r.retrieve(q, RetrievalConfig(doc_types=types)).passages == []
    assert list(r._type_masks) == [("statute",)]


def test_retriever_refuses_an_encoder_of_another_width(tiny_chunks, tiny_corpus_path, tmp_path, monkeypatch):
    from lawline.retrieval import hybrid
    ids = [c.chunk_id for c in tiny_chunks]
    FaissIndex.build(ids, np.ones((len(ids), 8), dtype="float32")).save(tmp_path / "faiss_base")
    BM25Index.build(ids, [c.text for c in tiny_chunks]).save(tmp_path / "bm25")
    LegalKG.build(tiny_corpus_path, tiny_chunks).save(tmp_path / "kg")
    monkeypatch.setattr(hybrid, "get_embedder", lambda name: type("StubEmbedder", (), {"dim": 384})())
    with pytest.raises(ValueError, match="8-dimensional vectors"):
        hybrid.HybridRetriever(index_dir=tmp_path, chunks=tiny_chunks, load_reranker=False)
