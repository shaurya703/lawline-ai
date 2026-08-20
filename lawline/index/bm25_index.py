"""BM25 keyword index with a legal-aware tokenizer (keeps section numbers like 498A, 304B intact)."""
from __future__ import annotations
import pickle, re
from pathlib import Path
import numpy as np
from rank_bm25 import BM25Okapi

STOP = set("""a an the of in on at to for and or is are was were be been by with as that this these those it its from
under shall may which who whom whose any such other than not no into upon within without where when what how all
every each said""".split())
_TOK = re.compile(r"[a-z0-9]+(?:[a-z0-9]+)?")


def tokenize(text: str) -> list[str]:
    text = text.lower().replace("-", " ")
    toks = _TOK.findall(text)
    return [t for t in toks if t not in STOP and len(t) > 1]


class BM25Index:
    def __init__(self, ids: list[str], bm25: BM25Okapi):
        self.ids = ids
        self.bm25 = bm25

    @classmethod
    def build(cls, ids: list[str], texts: list[str]) -> "BM25Index":
        return cls(list(ids), BM25Okapi([tokenize(t) for t in texts], k1=1.5, b=0.75))

    def search(self, query: str, k: int = 10) -> list[tuple[str, float]]:
        scores = self.bm25.get_scores(tokenize(query))
        if k >= len(scores):
            top = np.argsort(-scores)
        else:
            top = np.argpartition(-scores, k)[:k]
            top = top[np.argsort(-scores[top])]
        return [(self.ids[i], float(scores[i])) for i in top if scores[i] > 0]

    def save(self, path: Path):
        path = Path(path); path.mkdir(parents=True, exist_ok=True)
        with open(path / "bm25.pkl", "wb") as f:
            pickle.dump({"ids": self.ids, "bm25": self.bm25}, f, protocol=pickle.HIGHEST_PROTOCOL)

    @classmethod
    def load(cls, path: Path) -> "BM25Index":
        with open(Path(path) / "bm25.pkl", "rb") as f:
            d = pickle.load(f)
        return cls(d["ids"], d["bm25"])

    def __len__(self):
        return len(self.ids)
