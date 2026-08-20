"""Parse the official India Code text dump of the Constitution of India into article-level documents."""
from __future__ import annotations
import re
from pathlib import Path
from .schema import Document
from ..config import DATA_RAW

SRC = DATA_RAW / "123Divyansh__Constitution/Indian Constitution.txt"
ACT = "Constitution of India, 1949"
HEAD = re.compile(r"^\s*\[?(\d{1,3}[A-Z]{0,2})\.\s+(.+?)\.\s*[—–]", re.M | re.S)


def _art_key(n: str) -> tuple[int, str]:
    m = re.match(r"(\d+)([A-Z]*)", n)
    return int(m.group(1)), m.group(2)


def clean_pages(raw: str) -> tuple[str, dict[str, str]]:
    """Remove footnote blocks, page headers/numbers; track the current PART for each article."""
    out, skipping = [], False
    for line in raw.split("\n"):
        if "\x0c" in line:                       # new page: header line like "7   THE CONSTITUTION OF INDIA"
            skipping = False
            continue
        if re.match(r"^\s*_{10,}\s*$", line):    # footnote separator -> skip until next page
            skipping = True
            continue
        if skipping:
            continue
        if re.match(r"^\s*\(Part [IVXLC]+[^)]*\)\s*$", line) or re.match(r"^\s*\d{1,3}\s*$", line):
            continue
        out.append(line)
    txt = "\n".join(out)
    txt = re.sub(r"\b\d\[", "[", txt)            # footnote markers like 1[
    txt = re.sub(r"\]\s*\d(?=\s)", "]", txt)
    return txt, {}


def parse_constitution(path: Path = SRC) -> list[Document]:
    raw = open(path, encoding="utf-8", errors="ignore").read()
    start = re.search(r"\n\s*1\.\s*Name and territory of the Union\.\s*[—–]", raw)
    end = re.search(r"\n\s*FIRST SCHEDULE", raw[start.start():])
    body = raw[start.start(): start.start() + (end.start() if end else len(raw))]
    body, _ = clean_pages(body)
    # track parts
    part_pos = [(m.start(), m.group(1).strip()) for m in re.finditer(r"^\s*(PART [IVXLC]+[A-Z]?)\b.*$", body, re.M)]
    heads = []
    last = (0, "")
    for m in HEAD.finditer(body):
        num, title = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
        key = _art_key(num)
        if key <= last or key[0] - last[0] > 15 or len(title) > 200:
            continue
        heads.append((m.start(), m.end(), num, title)); last = key
    docs = []
    for i, (s, e, num, title) in enumerate(heads):
        nxt = heads[i + 1][0] if i + 1 < len(heads) else len(body)
        text = re.sub(r"[ \t]+", " ", body[e:nxt]).strip()
        text = re.sub(r"\n\s*\n+", "\n", text)
        part = next((p for pos, p in reversed(part_pos) if pos < s), None)
        docs.append(Document(
            doc_id=f"statute::constitution-of-india-1949::{num}", doc_type="statute", source="indiacode/constitution",
            title=f"Article {num}. {title} — {ACT}", act=ACT, section=num, chapter=part, year=1949,
            text=f"Article {num}. {title}.— {text}",
            cited_sections=[{"act": ACT, "section": a} for a in dict.fromkeys(re.findall(r"\barticles?\s+(\d+[A-Z]?)", text))][:30],
        ))
    return docs


if __name__ == "__main__":
    ds = parse_constitution()
    print(len(ds), [d.section for d in ds][:20], [d.section for d in ds][-10:])
    d = next(x for x in ds if x.section == "21"); print(d.title, d.chapter); print(d.text[:400])
