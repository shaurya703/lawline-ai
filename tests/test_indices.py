import numpy as np
from lawline.index.bm25_index import BM25Index, tokenize
from lawline.index.faiss_index import FaissIndex
from lawline.index.knowledge_graph import LegalKG


def test_tokenizer_keeps_section_codes():
    toks = tokenize("Offence under Section 498A and 304-B of the IPC")
    assert "498a" in toks and "304" in toks and "ipc" in toks and "the" not in toks


def test_bm25_roundtrip(tiny_chunks, tmp_path):
    idx = BM25Index.build([c.chunk_id for c in tiny_chunks], [c.text for c in tiny_chunks])
    top = idx.search("punishment for murder", k=3)
    assert top[0][0].startswith("statute::indian-penal-code-1860::302")
    idx.save(tmp_path); idx2 = BM25Index.load(tmp_path)
    assert idx2.search("punishment for murder", k=1)[0][0] == top[0][0]
    assert idx.search("zzzzqqq", k=3) == []


def test_faiss_roundtrip(tmp_path):
    rng = np.random.default_rng(0)
    vecs = rng.normal(size=(50, 8)).astype("float32"); vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    ids = [f"d{i}#c0" for i in range(50)]
    idx = FaissIndex.build(ids, vecs)
    hits = idx.search(vecs[7], k=3)[0]
    assert hits[0][0] == "d7#c0" and abs(hits[0][1] - 1.0) < 1e-4
    idx.save(tmp_path); idx2 = FaissIndex.load(tmp_path)
    assert len(idx2) == 50 and idx2.search(vecs[7], k=1)[0][0][0] == "d7#c0"


def test_kg_build_and_retrieve(tiny_corpus_path, tiny_chunks):
    kg = LegalKG.build(tiny_corpus_path, tiny_chunks)
    st = kg.stats()
    assert st["nodes"]["section"] == 4 and st["nodes"]["case"] == 1 and st["nodes"]["act"] == 2
    assert st["edges"]["CITES"] == 1 and st["edges"]["REFERS_TO"] == 1       # 420 -> 415
    m = kg.extract_mentions("What is the punishment under section 302 IPC?")
    assert m["sections"] == ["302"] and m["acts"] == ["act:indian-penal-code-1860"]
    hits = kg.retrieve("What is the punishment under section 302 IPC?")
    assert hits[0][0].startswith("statute::indian-penal-code-1860::302") and hits[0][1] == 1.0
    # article mention -> constitution + the case that cites it (one hop)
    hits = dict(kg.retrieve("Explain Article 21"))
    assert any(k.startswith("statute::constitution-of-india-1949::21") for k in hits)
    assert any(k.startswith("case::test::maneka") for k in hits)
    # case-name mention
    hits = kg.retrieve("What did Maneka Gandhi v. Union of India decide?")
    assert hits and hits[0][0].startswith("case::test::maneka")
    # bare section code without act defaults to IPC/BNS family
    assert kg.retrieve("cheating u/s 420 case")[0][0].startswith("statute::indian-penal-code-1860::420")
    assert kg.retrieve("plain 420 case") == []             # bare numbers without a cue are ignored (ambiguous)
    # concept layer bridges vocabulary gaps ("cheating" never needs the section number)
    assert kg.extract_mentions("is cheating punishable?")["concepts"] == ["cheating"]
    assert kg.retrieve("is cheating punishable?")[0][0].startswith("statute::indian-penal-code-1860::4")
    # section 420 expansion reaches 415 via REFERS_TO
    assert any(k.startswith("statute::indian-penal-code-1860::415") for k, _ in kg.retrieve("section 420 IPC"))
