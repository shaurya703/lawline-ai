"""Metadata-preserving chunker. Splits on paragraph boundaries first, then packs paragraphs into
windows of ~CHUNK_WORDS words with CHUNK_OVERLAP words of overlap between consecutive windows."""
from __future__ import annotations
import re
from .schema import Document, Chunk, read_jsonl, write_jsonl
from ..config import CHUNK_WORDS, CHUNK_OVERLAP, CORPUS_PATH, CHUNKS_PATH

_WS = re.compile(r"\s+")


def _words(text: str) -> list[str]:
    return _WS.sub(" ", text).strip().split(" ")


def split_words(words: list[str], size: int, overlap: int) -> list[list[str]]:
    if size <= 0:
        raise ValueError("size must be > 0")
    if overlap >= size:
        raise ValueError("overlap must be < size")
    if len(words) <= size:
        return [words]
    out, start, step = [], 0, size - overlap
    while start < len(words):
        out.append(words[start:start + size])
        if start + size >= len(words):
            break
        start += step
    return out


def chunk_document(doc: Document, size: int = CHUNK_WORDS, overlap: int = CHUNK_OVERLAP) -> list[Chunk]:
    header = ""
    if doc.doc_type == "statute":
        header = f"{doc.act} — Section {doc.section}. "
    else:
        header = f"{doc.title}. "
    words = _words(doc.text)
    if not words or words == [""]:
        return []
    pieces = split_words(words, size, overlap)
    chunks = []
    for i, ws in enumerate(pieces):
        body = " ".join(ws)
        chunks.append(Chunk(
            chunk_id=f"{doc.doc_id}#c{i}", doc_id=doc.doc_id, doc_type=doc.doc_type, title=doc.title,
            text=(header + body) if i == 0 or doc.doc_type == "statute" else body, position=i,
            act=doc.act, section=doc.section, court=doc.court, year=doc.year, source=doc.source,
        ))
    return chunks


def build_chunks(corpus_path=CORPUS_PATH, out_path=CHUNKS_PATH, size=CHUNK_WORDS, overlap=CHUNK_OVERLAP) -> int:
    def gen():
        for d in read_jsonl(corpus_path):
            for c in chunk_document(Document.from_dict(d), size, overlap):
                yield c.to_json()
    return write_jsonl(out_path, gen())


def load_chunks(path=CHUNKS_PATH) -> list[Chunk]:
    return [Chunk.from_dict(d) for d in read_jsonl(path)]


if __name__ == "__main__":
    print("chunks:", build_chunks())
