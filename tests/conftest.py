import pytest
from lawline.data.schema import Document, Chunk


@pytest.fixture
def tiny_docs():
    return [
        Document(doc_id="statute::indian-penal-code-1860::302", doc_type="statute", source="t", act="Indian Penal Code, 1860",
                 section="302", title="302. Punishment for murder — Indian Penal Code, 1860",
                 text="Whoever commits murder shall be punished with death, or imprisonment for life, and shall also be liable to fine."),
        Document(doc_id="statute::indian-penal-code-1860::420", doc_type="statute", source="t", act="Indian Penal Code, 1860",
                 section="420", title="420. Cheating — Indian Penal Code, 1860",
                 text="Whoever cheats and thereby dishonestly induces the person deceived to deliver any property shall be punished with imprisonment up to seven years. See section 415.",
                 cited_sections=[{"act": "Indian Penal Code, 1860", "section": "415"}]),
        Document(doc_id="statute::indian-penal-code-1860::415", doc_type="statute", source="t", act="Indian Penal Code, 1860",
                 section="415", title="415. Cheating defined — Indian Penal Code, 1860",
                 text="Whoever, by deceiving any person, fraudulently or dishonestly induces the person so deceived to deliver any property is said to cheat."),
        Document(doc_id="statute::constitution-of-india-1949::21", doc_type="statute", source="t", act="Constitution of India, 1949",
                 section="21", title="Article 21 — Constitution of India, 1949",
                 text="No person shall be deprived of his life or personal liberty except according to procedure established by law."),
        Document(doc_id="case::test::maneka", doc_type="case", source="t", title="Maneka Gandhi v. Union of India",
                 court="Supreme Court of India", year=1978, topics=["Personal Liberty"],
                 text="The passport of the petitioner was impounded. The court held that the procedure under Article 21 must be fair, just and reasonable. " * 5,
                 cited_sections=[{"act": "Constitution of India, 1949", "section": "21"}]),
    ]


@pytest.fixture
def tiny_chunks(tiny_docs):
    from lawline.data.chunking import chunk_document
    return [c for d in tiny_docs for c in chunk_document(d, size=60, overlap=10)]


@pytest.fixture
def tiny_corpus_path(tmp_path, tiny_docs):
    p = tmp_path / "corpus.jsonl"
    p.write_text("\n".join(d.to_json() for d in tiny_docs) + "\n")
    return p
