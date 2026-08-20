"""Offline indexing pipeline: corpus -> chunks -> embeddings/FAISS, BM25, knowledge graph."""
from __future__ import annotations
import argparse, json, time
from pathlib import Path
from lawline.config import CORPUS_PATH, CHUNKS_PATH, INDEX_DIR, BASE_EMBEDDING_MODEL, CHUNK_WORDS, CHUNK_OVERLAP
from lawline.data.chunking import build_chunks, load_chunks
from lawline.index.embedder import Embedder
from lawline.index.faiss_index import FaissIndex
from lawline.index.bm25_index import BM25Index
from lawline.index.knowledge_graph import LegalKG


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed-model", default=BASE_EMBEDDING_MODEL)
    ap.add_argument("--tag", default="base", help="sub-directory name for the FAISS index")
    ap.add_argument("--chunk-words", type=int, default=CHUNK_WORDS)
    ap.add_argument("--overlap", type=int, default=CHUNK_OVERLAP)
    ap.add_argument("--skip-chunks", action="store_true")
    ap.add_argument("--only", choices=["faiss", "bm25", "kg"], default=None)
    a = ap.parse_args()
    t0 = time.time(); timings = {}
    if not a.skip_chunks:
        n = build_chunks(size=a.chunk_words, overlap=a.overlap); timings["chunking_s"] = time.time() - t0
        print(f"chunks: {n}")
    chunks = load_chunks()
    ids = [c.chunk_id for c in chunks]
    if a.only in (None, "bm25"):
        t = time.time(); BM25Index.build(ids, [c.text for c in chunks]).save(INDEX_DIR / "bm25")
        timings["bm25_s"] = time.time() - t; print("bm25 done")
    if a.only in (None, "kg"):
        t = time.time(); kg = LegalKG.build(CORPUS_PATH, chunks); kg.save(INDEX_DIR / "kg")
        timings["kg_s"] = time.time() - t; print("kg:", kg.stats())
    if a.only in (None, "faiss"):
        t = time.time(); emb = Embedder(a.embed_model)
        vecs = emb.encode_passages([c.text for c in chunks], show_progress=True)
        FaissIndex.build(ids, vecs).save(INDEX_DIR / f"faiss_{a.tag}")
        timings["embed_s"] = time.time() - t; print("faiss done", vecs.shape, emb.device)
    timings["total_s"] = time.time() - t0
    json.dump(timings, open(INDEX_DIR / f"build_timings_{a.tag}.json", "w"), indent=2)
    print(json.dumps(timings, indent=2))


if __name__ == "__main__":
    main()
