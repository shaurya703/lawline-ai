import pytest
from lawline.data.chunking import split_words, chunk_document
from lawline.data.schema import Document


def test_split_words_overlap():
    words = [str(i) for i in range(100)]
    parts = split_words(words, 30, 10)
    assert parts[0] == words[:30]
    assert parts[1][:10] == parts[0][-10:]          # overlap preserved
    assert [w for p in parts for w in p][-1] == "99"  # nothing lost
    assert all(len(p) <= 30 for p in parts)


def test_split_words_short_and_errors():
    assert split_words(["a", "b"], 10, 2) == [["a", "b"]]
    with pytest.raises(ValueError):
        split_words(["a"], 5, 5)
    with pytest.raises(ValueError):
        split_words(["a"], 0, 0)


def test_chunk_document_metadata(tiny_docs):
    case = tiny_docs[-1]
    chunks = chunk_document(case, size=40, overlap=5)
    assert len(chunks) > 1
    assert chunks[0].chunk_id == f"{case.doc_id}#c0"
    assert all(c.doc_id == case.doc_id and c.court == case.court and c.year == 1978 for c in chunks)
    assert chunks[0].text.startswith(case.title)
    assert [c.position for c in chunks] == list(range(len(chunks)))


def test_statute_chunk_header_and_citation(tiny_docs):
    c = chunk_document(tiny_docs[0])[0]
    assert "Indian Penal Code, 1860 — Section 302." in c.text
    assert c.citation == "Section 302, Indian Penal Code, 1860"


def test_empty_doc():
    d = Document(doc_id="x", doc_type="statute", source="t", title="t", text="   ", act="A", section="1")
    assert chunk_document(d) == []
