"""Unified document / chunk schema shared by every module."""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any
import json


@dataclass
class Document:
    doc_id: str
    doc_type: str                 # "statute" | "case"
    source: str                   # dataset / provenance label
    title: str
    text: str
    act: str | None = None        # statute: act name; case: None
    section: str | None = None    # statute section / article number
    chapter: str | None = None
    court: str | None = None
    date: str | None = None
    year: int | None = None
    cited_sections: list[dict] = field(default_factory=list)   # [{"act":..., "section":...}]
    cited_cases: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    @staticmethod
    def from_dict(d: dict) -> "Document":
        return Document(**d)


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    doc_type: str
    title: str
    text: str
    position: int
    act: str | None = None
    section: str | None = None
    court: str | None = None
    year: int | None = None
    source: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    @staticmethod
    def from_dict(d: dict) -> "Chunk":
        return Chunk(**d)

    @property
    def citation(self) -> str:
        """Human readable citation string used in answers."""
        if self.doc_type == "statute":
            return f"Section {self.section}, {self.act}"
        bits = [self.title]
        if self.court:
            bits.append(self.court)
        if self.year:
            bits.append(str(self.year))
        return ", ".join(bits)


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def write_jsonl(path, rows) -> int:
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(r if isinstance(r, str) else json.dumps(r, ensure_ascii=False))
            f.write("\n")
            n += 1
    return n
