"""Statutory text of IPC sections parsed from the public IPC commentary PDF (harshitv804/Indian_Penal_Code).
Used only to back-fill sections absent from the other IPC sources (general part: definitions, general exceptions, abetment…)."""
from __future__ import annotations
import re
from pathlib import Path
from ..config import DATA_RAW

TXT = DATA_RAW / "harshitv804__IPC/ipc.txt"
PAT = re.compile(r"\[\[?s (\d{1,3}[A-Z]{0,2})\]\s*([^\n]{3,160}?)\.\s*\n(.*?)(?=\n\s*COMMENT|\n\s*\d*\.?\s*\[\[?s \d{1,3}[A-Z]{0,2}\]|STATE AMENDMENT|\Z)", re.S)


def ipc_from_book() -> dict[str, tuple[str, str]]:
    if not TXT.exists():
        pdf = TXT.with_name("Indian Penal Code Book.pdf")
        if not pdf.exists():
            return {}
        from pypdf import PdfReader
        TXT.write_text("\n".join((p.extract_text() or "") for p in PdfReader(str(pdf)).pages))
    txt = TXT.read_text(); found = {}
    for m in PAT.finditer(txt):
        sec, title, body = m.group(1).upper(), m.group(2).strip(), m.group(3).strip()
        body = re.sub(r"\s*\n\s*", " ", body); body = re.sub(r"\s\d{1,2}\.\[", " [", body); body = re.sub(r"\s\d{1,2}\s", " ", body)
        if sec not in found and 20 < len(body) < 4000:
            found[sec] = (title, body[:2500])
    return found
