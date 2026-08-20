"""Build the unified legal corpus (data/processed/corpus.jsonl) from raw public datasets.

Sources (all public, see docs/DATA_SOURCES.md):
  * mratanusarkar/Indian-Laws              – 34k sections of 1,021 central bare acts (IPC, CrPC, CPC, Constitution...)
  * GSMS-B/indian-legal-sections-bns-bnss-bsa-2023 – BNS / BNSS / BSA 2023 sections
  * Shreyasrao/Indian-law-supreme-court-judgements-2016 – 589 SC judgments with entity annotations
  * Hanno-Labs/indian-ipc-statute-identification – High Court fact excerpts linked to IPC sections (train split only)
  * 7 landmark judgments processed in Capstone Phase-II
"""
from __future__ import annotations
import hashlib, json, re, glob, random
from pathlib import Path
import pandas as pd
from .schema import Document, write_jsonl
from ..config import DATA_RAW, CORPUS_PATH, DATA_PROCESSED
from .constitution import parse_constitution

ACT_ALIASES = {
    "BNS 2023": "Bharatiya Nyaya Sanhita, 2023",
    "BNSS 2023": "Bharatiya Nagarik Suraksha Sanhita, 2023",
    "BSA 2023": "Bharatiya Sakshya Adhiniyam, 2023",
}
HC_CASES_IN_CORPUS = 6000     # cap to keep the index tractable on a laptop
SEED = 13


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _year(act_title: str) -> int | None:
    m = re.search(r"(1[89]\d\d|20\d\d)", act_title)
    return int(m.group(1)) if m else None


SEC_REF = re.compile(r"\b(?:section|sec\.?|s\.)\s*(\d+[A-Z]{0,2})(?:\s*\(\d+\))?", re.I)
ART_REF = re.compile(r"\barticles?\s*(\d+[A-Z]{0,2})", re.I)


def extract_section_refs(text: str, default_act: str | None) -> list[dict]:
    refs = []
    for m in SEC_REF.finditer(text):
        refs.append({"act": default_act, "section": m.group(1)})
    for m in ART_REF.finditer(text):
        refs.append({"act": "Constitution of India, 1949", "section": m.group(1)})
    seen, out = set(), []
    for r in refs:
        k = (r["act"], r["section"])
        if k not in seen:
            seen.add(k); out.append(r)
    return out[:40]


# ----------------------------------------------------------------------------- statutes
REPLACED_ACTS = {"Indian Penal Code, 1860", "Constitution of India, 1949"}   # incomplete in bare-acts dump


def load_bare_acts() -> list[Document]:
    df = pd.read_parquet(DATA_RAW / "mratanusarkar__Indian-Laws/data/indian_law_bare_acts_dataset.parquet")
    docs = []
    for r in df.itertuples(index=False):
        if r.act_title.strip() in REPLACED_ACTS:
            continue
        text = (r.law or "").strip()
        if len(text) < 40:
            continue
        sec = str(r.section).strip()
        act = r.act_title.strip()
        # chapter line, if present, is the 2nd/3rd line of the text
        lines = text.split("\n")
        chapter = next((l.strip() for l in lines[1:4] if l.lower().startswith("chapter")), None)
        title_line = next((l for l in lines if re.match(rf"^\s*{re.escape(sec)}\.", l)), f"Section {sec}")
        docs.append(Document(
            doc_id=f"statute::{slug(act)}::{sec}", doc_type="statute", source="indiacode/bare-acts",
            title=f"{title_line.strip()[:140]} — {act}", text=text, act=act, section=sec, chapter=chapter,
            year=_year(act), cited_sections=extract_section_refs(text[len(lines[0]):], act),
        ))
    return docs


def load_bns_family() -> list[Document]:
    j = json.load(open(DATA_RAW / "GSMS-B__indian-legal-sections-bns-bnss-bsa-2023/bns_bnss_bsa_sections.json"))
    docs = []
    for r in j:
        act = ACT_ALIASES.get(r["act"], r["act"])
        text = re.sub(r"^\[Context:.*?\]\s*", "", r["text"], flags=re.S).strip()
        docs.append(Document(
            doc_id=f"statute::{slug(act)}::{r['section_number']}", doc_type="statute", source="GSMS-B/bns-bnss-bsa",
            title=f"{r['section_number']}. {r['section_title']} — {act}", text=text, act=act,
            section=str(r["section_number"]), chapter=r.get("chapter"), year=2023,
            cited_sections=extract_section_refs(text, act), extra={"src_chunk_id": r["chunk_id"]},
        ))
    return docs


def load_ipc() -> list[Document]:
    """IPC: operative text from Hanno-Labs (320 sections, verbatim statute) merged with kmeanskaran/ipc-sections
    (444 sections incl. offence / punishment metadata and a plain-English gloss)."""
    act = "Indian Penal Code, 1860"
    k = pd.read_parquet(DATA_RAW / "kmeanskaran__ipc-sections/data/train-00000-of-00001.parquet")
    k["sec"] = k.Section.str.replace("IPC_", "", regex=False).str.upper()
    h = pd.read_parquet(DATA_RAW / "Hanno-Labs__indian-ipc-statute-identification/data/train.parquet")
    h = h.drop_duplicates("ipc_section").set_index(h.drop_duplicates("ipc_section").ipc_section.str.upper())
    docs = []
    for r in k.itertuples(index=False):
        sec = r.sec
        desc = re.sub(r"^Description of IPC Section \S+\s*", "", str(r.Description)).strip()
        if sec in h.index:
            statute = str(h.loc[sec, "statute_text"]).strip()
            gloss = desc.split("in Simple Words", 1)[-1].strip() if "in Simple Words" in desc else ""
            text = statute + (f"\nIn simple words: {gloss}" if gloss else "")
        else:
            text = f"Section {sec} of the Indian Penal Code. {r.Offense}. {desc}"
        text += f"\nOffence: {r.Offense}. Punishment: {r.Punishment}."
        docs.append(Document(
            doc_id=f"statute::{slug(act)}::{sec}", doc_type="statute", source="ipc/kmeanskaran+hanno",
            title=f"Section {sec}. {str(r.Offense)[:120]} — {act}", text=text, act=act, section=sec, year=1860,
            cited_sections=extract_section_refs(text, act), extra={"offence": r.Offense, "punishment": r.Punishment},
        ))
    # any IPC section present only in Hanno
    have = {d.section for d in docs}
    for sec, row in h.iterrows():
        if sec not in have:
            docs.append(Document(doc_id=f"statute::{slug(act)}::{sec}", doc_type="statute", source="ipc/hanno",
                                 title=f"Section {sec} — {act}", text=row.statute_text, act=act, section=sec, year=1860))
    return docs


# ----------------------------------------------------------------------------- cases
def load_sc2016() -> list[Document]:
    docs = []
    for f in sorted(glob.glob(str(DATA_RAW / "Shreyasrao__SC2016/extracted_jsons/*.json"))):
        d = json.load(open(f))
        ent = d.get("entities", {}) or {}
        text = d.get("raw_text_preview", "").strip()
        title = (ent.get("case_title") or {}).get("title")
        if not title:
            hm = re.match(r"#\s*(.+)", text)
            title = hm.group(1).strip().title() if hm else Path(f).stem
        summary = (ent.get("summary") or {}).get("summary", "")
        if len(text) < 200:
            continue
        cited = [{"act": s.get("act"), "section": s.get("section")} for s in ent.get("sections", []) if s.get("section")]
        docs.append(Document(
            doc_id=f"case::sc2016::{Path(f).stem}", doc_type="case", source="SCR-2016",
            title=title, text=text, court="Supreme Court of India", year=2016,
            date=f"2016-{d.get('metadata', {}).get('month', 1):02d}",
            cited_sections=cited + extract_section_refs(text, None),
            topics=[t.get("text") for t in ent.get("topics", []) if t.get("text")],
            extra={"summary": summary, "judges": [j.get("name") for j in ent.get("judges", [])],
                   "parties": [p.get("name") for p in ent.get("parties", [])]},
        ))
    return docs


def hanno_split() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Deterministic case-level split of the Hanno IPC dataset. Train cases may enter the corpus;
    test cases are *only* used as evaluation queries (no leakage)."""
    df = pd.read_parquet(DATA_RAW / "Hanno-Labs__indian-ipc-statute-identification/data/train.parquet")
    df["case_key"] = df.case_facts.map(lambda s: hashlib.md5(s.encode()).hexdigest()[:12])
    keys = sorted(df.case_key.unique())
    rnd = random.Random(SEED); rnd.shuffle(keys)
    test_keys = set(keys[: int(0.1 * len(keys))])
    return df[~df.case_key.isin(test_keys)].copy(), df[df.case_key.isin(test_keys)].copy()


COURT_PAT = re.compile(r"IN THE (HIGH COURT OF [A-Z .]+?)(?=\s+(?:CRIMINAL|CIVIL|WRIT|LETTERS|FIRST|SECOND|MISC|APPEAL|BAIL|C\.R\.|CR\.|CRL|M\.?A\.|W\.P|L\.P|R\.S|F\.A|S\.A|\d|=))", re.I)
PARTY_CLEAN = re.compile(r"\s*(?:S/O|D/O|W/O|SON OF|DAUGHTER OF|WIFE OF|R/O|RESIDENT OF|@|,|\.\.\.\.|\bAND ORS\b|\bAND ANR\b|\bAND OTHERS\b|\bTHROUGH\b).*$", re.I)


def _party(s: str) -> str:
    s = re.sub(r"^\s*\d+\.\s*", "", s.strip())
    s = re.split(r"\s+\d+\.\s+", s)[0]            # keep first of numbered parties
    s = PARTY_CLEAN.sub("", s).strip(" .-")
    return re.sub(r"\s+", " ", s).title()[:60]


def parse_hc_header(facts: str) -> tuple[str, str]:
    m = COURT_PAT.search(facts[:300])
    court = m.group(1).strip().title() if m else "High Court"
    head = facts[:700]
    t = re.search(r"=+\s*(.+?)\s+(?:Versus|Vs\.?|V/S|V\.)\s+(.+?)(?:\.{2,}|\s+Opposite|\s+Respondent|=)", head, re.I | re.S)
    if t:
        a, b = _party(t.group(1)), _party(t.group(2))
        title = f"{a} v. {b}" if a and b else None
    else:
        title = None
    return title or "", court


def load_hc_excerpts(train_df: pd.DataFrame) -> list[Document]:
    grp = train_df.groupby("case_key")
    keys = sorted(grp.groups.keys())
    rnd = random.Random(SEED); rnd.shuffle(keys)
    docs = []
    for k in keys[:HC_CASES_IN_CORPUS]:
        g = grp.get_group(k)
        facts = g.case_facts.iloc[0]
        title, court = parse_hc_header(facts)
        title = title or f"High Court Criminal Matter {k[:6]}"
        ym = re.search(r"\b(?:19|20)\d\d\b", facts[:400])
        docs.append(Document(
            doc_id=f"case::hc::{k}", doc_type="case", source="Hanno-Labs/HC-IPC", title=title, text=facts,
            court=court, year=int(ym.group(0)) if ym else None,
            cited_sections=[{"act": "Indian Penal Code, 1860", "section": s} for s in sorted(set(g.ipc_section))],
        ))
    return docs


def load_capstone_cases() -> list[Document]:
    docs = []
    for f in sorted(glob.glob(str(DATA_RAW / "capstone_cases/*.json"))):
        d = json.load(open(f))
        meta = d.get("metadata", {}) if isinstance(d.get("metadata"), dict) else {}
        parts = []
        for p in d.get("pages", []):
            for s in p.get("sections", []):
                parts.append(s.get("text", ""))
        text = re.sub(r"[ \t]+", " ", "\n".join(parts)).strip()
        if len(text) < 200:
            continue
        stem = re.sub(r"_on_\d+_\w+_\d{4}.*$", "", Path(f).stem).replace("_", " ")
        title = re.sub(r"\bvs\b", "v.", stem, flags=re.I)
        ym = re.search(r"(\d{4})", meta.get("date", "") or Path(f).stem[-4:])
        docs.append(Document(
            doc_id=f"case::landmark::{slug(title)}", doc_type="case", source="capstone-phase2",
            title=title, text=text[:60000], court=(meta.get("court") or "").title() or None,
            date=meta.get("date"), year=int(ym.group(1)) if ym else None,
            cited_sections=extract_section_refs(text, "Indian Penal Code, 1860"),
            cited_cases=[c.get("case_name", "") for c in d.get("global_citations", []) if c.get("case_name")][:50],
        ))
    return docs


def build_corpus(out_path: Path = CORPUS_PATH) -> dict:
    train_df, test_df = hanno_split()
    test_df.to_parquet(DATA_PROCESSED / "hanno_test.parquet")
    train_df.to_parquet(DATA_PROCESSED / "hanno_train.parquet")
    groups = {
        "bare_acts": load_bare_acts(),
        "bns_family": load_bns_family(),
        "ipc": load_ipc(),
        "constitution": parse_constitution(),
        "sc2016": load_sc2016(),
        "hc_excerpts": load_hc_excerpts(train_df),
        "landmark": load_capstone_cases(),
    }
    seen, docs = set(), []
    for name, ds in groups.items():
        for d in ds:
            if d.doc_id in seen:
                continue
            seen.add(d.doc_id); docs.append(d)
    n = write_jsonl(out_path, (d.to_json() for d in docs))
    stats = {k: len(v) for k, v in groups.items()} | {"total": n, "statutes": sum(d.doc_type == "statute" for d in docs),
                                                       "cases": sum(d.doc_type == "case" for d in docs),
                                                       "hanno_train_rows": len(train_df), "hanno_test_rows": len(test_df)}
    json.dump(stats, open(DATA_PROCESSED / "corpus_stats.json", "w"), indent=2)
    return stats


if __name__ == "__main__":
    print(json.dumps(build_corpus(), indent=2))
