"""BM25 keyword index with a legal-aware tokenizer (keeps section numbers like 498A, 304B intact)."""
from __future__ import annotations
import pickle, re
from pathlib import Path
import numpy as np
from rank_bm25 import BM25Okapi

STOP = set("""a an the of in on at to for and or is are was were be been by with as that this these those it its from
under shall may which who whom whose any such other than not no into upon within without where when what how all
every each said""".split())
_TOK = re.compile(r"[a-z0-9]+")
# "498-A" and "304-B" are as common in Indian legal writing as the bare "498A". Hyphens become
# spaces below, which would strand the one-letter suffix for the len>1 filter to drop — collapsing
# s.498A (cruelty) onto the unrelated s.498, and s.304B (dowry death) onto s.304. Join it first.
_SEC_SUFFIX = re.compile(r"(?<=\d)-(?=[a-z]{1,2}\b)")


def tokenize(text: str) -> list[str]:
    text = _SEC_SUFFIX.sub("", text.lower()).replace("-", " ")
    toks = _TOK.findall(text)
    return [t for t in toks if t not in STOP and len(t) > 1]


class BM25Index:
    """Okapi BM25 over an inverted index.

    rank_bm25 builds the statistics (so idf and its epsilon floor stay exactly as before) but scores a query by
    looping over every document in Python for every query token: about 100 ms per question at 69k chunks, 340 ms at
    203k, and seconds for a narrative fact pattern. The same formula over token postings touches only the documents
    that contain a token and returns bit-identical scores.
    """

    def __init__(self, ids: list[str], vocab: dict[str, int], indptr: np.ndarray, docs: np.ndarray, tfs: np.ndarray,
                 idf: np.ndarray, norm: np.ndarray, k1: float):
        self.ids = ids
        self.vocab, self.indptr, self.docs, self.tfs = vocab, indptr, docs, tfs      # token -> row; CSR postings (doc index, term frequency)
        self.idf, self.norm, self.k1 = idf, norm, k1                                 # norm[d] = k1 * (1 - b + b * len(d) / avgdl)

    @classmethod
    def _from_okapi(cls, ids: list[str], bm: BM25Okapi) -> "BM25Index":
        vocab = {t: i for i, t in enumerate(bm.idf)}
        lengths = np.fromiter((len(f) for f in bm.doc_freqs), dtype=np.int64, count=len(bm.doc_freqs))
        total = int(lengths.sum())
        tok = np.fromiter((vocab[t] for f in bm.doc_freqs for t in f), dtype=np.int32, count=total)
        tfs = np.fromiter((v for f in bm.doc_freqs for v in f.values()), dtype=np.int32, count=total)
        docs = np.repeat(np.arange(len(lengths), dtype=np.int32), lengths)
        order = np.argsort(tok, kind="stable")                                       # stable: postings stay in document order
        indptr = np.zeros(len(vocab) + 1, dtype=np.int64)
        np.cumsum(np.bincount(tok, minlength=len(vocab)), out=indptr[1:])
        idf = np.array([bm.idf[t] or 0 for t in vocab], dtype=np.float64)
        norm = bm.k1 * (1 - bm.b + bm.b * np.array(bm.doc_len) / bm.avgdl)
        return cls(list(ids), vocab, indptr, docs[order], tfs[order], idf, norm, bm.k1)

    @classmethod
    def build(cls, ids: list[str], texts: list[str]) -> "BM25Index":
        return cls._from_okapi(ids, BM25Okapi([tokenize(t) for t in texts], k1=1.5, b=0.75))

    def scores(self, tokens: list[str]) -> np.ndarray:
        score = np.zeros(len(self.ids))
        for t in tokens:                                                             # repeated query tokens count each time, as in rank_bm25
            row = self.vocab.get(t)
            if row is None:
                continue
            lo, hi = self.indptr[row], self.indptr[row + 1]
            d, f = self.docs[lo:hi], self.tfs[lo:hi]
            score[d] += self.idf[row] * (f * (self.k1 + 1) / (f + self.norm[d]))
        return score

    def search(self, query: str, k: int = 10, mask: np.ndarray | None = None) -> list[tuple[str, float]]:
        """mask: optional boolean array over ids; documents with mask==False are excluded before ranking."""
        scores = self.scores(tokenize(query))
        if mask is not None:
            scores = np.where(mask, scores, -1.0)
        if k >= len(scores):
            top = np.argsort(-scores)
        else:
            top = np.argpartition(-scores, k)[:k]
            top = top[np.argsort(-scores[top])]
        return [(self.ids[i], float(scores[i])) for i in top if scores[i] > 0]

    _ARRAYS = ("indptr", "docs", "tfs", "idf", "norm")

    def save(self, path: Path):
        """Format 3: arrays are stored as raw bytes with their dtype, so the file does not depend on the NumPy
        version that wrote it (a pickled NumPy 2 array cannot be read by NumPy 1)."""
        path = Path(path); path.mkdir(parents=True, exist_ok=True)
        d = {"format": 3, "ids": self.ids, "vocab": self.vocab, "k1": float(self.k1)}
        for name in self._ARRAYS:
            a = np.ascontiguousarray(getattr(self, name))
            d[name] = (a.dtype.str, a.tobytes())
        with open(path / "bm25.pkl", "wb") as f:
            pickle.dump(d, f, protocol=4)

    @classmethod
    def load(cls, path: Path) -> "BM25Index":
        with open(Path(path) / "bm25.pkl", "rb") as f:
            d = pickle.load(f)
        if "bm25" in d:                                                              # format 1: a pickled rank_bm25 object
            return cls._from_okapi(d["ids"], d["bm25"])
        if d.get("format") == 3:
            d = {**d, **{name: np.frombuffer(d[name][1], dtype=d[name][0]) for name in cls._ARRAYS}}
        return cls(d["ids"], d["vocab"], d["indptr"], d["docs"], d["tfs"], d["idf"], d["norm"], d["k1"])

    def __len__(self):
        return len(self.ids)
