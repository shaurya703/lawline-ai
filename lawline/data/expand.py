"""Corpus expansion (v2): widen the case law and complete the key Acts.

The v1 corpus is strong on statutes but thin on cases: 5,975 of its 6,596 cases are Patna High Court criminal
excerpts, the Supreme Court is covered for 2016 only, and several central Acts are missing sections (the Indian
Evidence Act had 50 of 184). This module appends three groups to the existing corpus:

  sc_reports   Supreme Court Reports 1950-2025 (2016 excluded): named landmark judgments plus a per-year sample
  hc_judgments substantive judgments of the High Courts other than Patna
  key_acts     sections of central Acts that the bare-acts dump lacks, and whole Acts it lacks entirely

Nothing in v1 is replaced or duplicated, so every frozen gold query keeps exactly the target documents it had:
a statute section is added only when v1 has neither that section number nor that text under the same Act;
Supreme Court judgments of 2016 and every judgment already in v1's SCR-2016 set are skipped, because that set is
both in the corpus and the `sc_case` evaluation set; the v1 landmark judgments are skipped by name.

Run:  python -m lawline.data.expand        (see docs/DATA_SOURCES.md for the downloads it expects in data/raw)
"""
from __future__ import annotations
import glob, hashlib, json, os, random, re, shutil, subprocess, tempfile, zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pandas as pd
from .schema import Document, read_jsonl, write_jsonl, corpus_group, CORPUS_GROUPS
from .ingest import slug, extract_section_refs, SEED
from ..config import DATA_RAW, DATA_PROCESSED, CORPUS_PATH

SC_TEXT_OLD = DATA_RAW / "therajasekhar__india-public-supreme-court-judgments/data/supreme_court_judgments.parquet"
SC_MIRROR = DATA_RAW / "labofsahil__Indian-Supreme-Court-Judgments"          # mirror of the AWS Open Data bucket
HC_PARQUET = DATA_RAW / "overthelex__indian-court-decisions/high_courts/test.parquet"
ACTS_DIR = DATA_RAW / "GSMS-B__indian-legal-knowledge-base-json/raw_acts"

SRC_SC, SRC_HC, SRC_ACTS = "SCR/aws-open-data", "ecourts/high-courts", "GSMS-B/knowledge-base"
NEW_SOURCES = {SRC_SC, SRC_HC, SRC_ACTS}

# Budget. Chunks grow from ~69k to ~200k, which a 16 GB laptop can still build and serve.
# The first sizing (80/130 per year, 30k characters) produced ~285k chunks and was cut back.
SC_PER_YEAR_OLD = 60          # 1950-1999
SC_PER_YEAR_NEW = 100         # 2000-2025
SC_SKIP_YEARS = {2016}
HC_PER_COURT = 100
HEAD_CHARS, TAIL_CHARS = 16_000, 4_000     # a long judgment keeps its headnote and opening, and its final order
MIN_JUDGMENT_CHARS = 4_000

# ----------------------------------------------------------------------------------------------- text helpers
_SMALL = {"of", "the", "and", "in", "on", "for", "by", "at", "to", "through", "with", "an", "etc", "etc."}
_INITIALS = re.compile(r"^(?:[A-Za-z]\.){1,5}[A-Za-z]?$|^M/S\.?$", re.I)
_VS_WORD = re.compile(r"\s+(?:versus|vs\.?|v/s\.?)(?:\s+|$)", re.I)     # the separator spelled out
_VS_ABBR = re.compile(r"\s+v\.\s+", re.I)                              # bare "v.": also a party's initial, so a fallback only
_WORD = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*")
_EMPTY_SIDE = re.compile(r"^[\s.,;:\-–—]*$")
_ONLY_VS = re.compile(r"^\W*(?:versus|vs|v/s|v)\W*$", re.I)


def split_parties(title: str) -> list[str]:
    """Both sides of a cause title. Titles with one side ("In re ...", a trailing "versus") give one element."""
    s = re.sub(r"\s+", " ", title or "").strip()
    m = _VS_WORD.search(s) or _VS_ABBR.search(s)
    parts = [s[:m.start()], s[m.end():]] if m else [s]
    return [p.strip(" .,;:-–—") for p in parts if not _EMPTY_SIDE.match(p) and not _ONLY_VS.match(p)]


def smart_title(s: str) -> str:
    """'ARNESH KUMAR versus STATE OF BIHAR & ANR.' -> 'Arnesh Kumar v. State of Bihar & Anr'"""
    def side(t: str) -> str:
        out = []
        for i, w in enumerate(t.split(" ")):
            if _INITIALS.match(w):
                out.append(w.upper())
            elif w.lower() in _SMALL and i > 0:
                out.append(w.lower())
            else:
                out.append(_WORD.sub(lambda m: m.group(0)[0].upper() + m.group(0)[1:].lower(), w))
        return " ".join(out)
    return " v. ".join(side(p) for p in split_parties(s))


def cap_text(text: str, head: int = HEAD_CHARS, tail: int = TAIL_CHARS) -> tuple[str, bool]:
    """Keep the opening (headnote, issues, facts) and the closing (holding, order) of a long judgment."""
    text = re.sub(r"[ \t]+", " ", text).strip()
    if len(text) <= head + tail:
        return text, False
    h = text[:head]
    cut = max(h.rfind(". "), h.rfind("\n"))
    if cut >= head - 400:                           # end on a sentence only if one ends near the limit
        h = h[:cut + 1]
    t = text[-tail:]
    cut = t.find(". ")
    if 0 <= cut < 400:
        t = t[cut + 2:]
    return f"{h.strip()}\n[…]\n{t.strip()}", True


_FUNCTION_WORDS = {"the", "of", "and", "to", "in", "that", "is", "was", "by", "for", "on", "be", "as", "it", "this", "with", "not", "or"}


def looks_english(text: str) -> bool:
    """Readable English prose. Rejects other scripts, Hindi typed in legacy ASCII fonts, broken PDF font maps
    (control characters) and letter-spaced OCR, all of which occur in the court dumps. Three windows are read
    (opening, middle, close) and two must read as prose, so a judgment that opens with pages of party names passes."""
    n = len(text)
    windows = [text[:3000], text[n // 2:n // 2 + 3000], text[-3000:]]
    sample = "".join(windows)
    letters = sum(c.isalpha() for c in sample)
    if letters < 200 or sum(c.isascii() and c.isalpha() for c in sample) / letters < 0.95:
        return False
    if sum(ord(c) < 32 and c not in "\n\r\t\f" for c in sample) / len(sample) > 0.01:
        return False
    tokens = [re.findall(r"[A-Za-z]+", w.lower()) for w in windows]
    flat = [t for ts in tokens for t in ts]
    if len(flat) < 80 or sum(len(t) == 1 for t in flat) / len(flat) >= 0.3:
        return False
    prose = sum(1 for ts in tokens if len(ts) >= 20 and sum(t in _FUNCTION_WORDS for t in ts) / len(ts) >= 0.08)
    return prose >= 2


def iso_date(s: str | None) -> str | None:
    m = re.match(r"(\d{2})-(\d{2})-(\d{4})$", (s or "").strip()) or None
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", (s or "").strip())
    return m.group(0) if m else None


def case_key(title: str) -> str:
    """First party, normalised, for spotting the same case under two titles."""
    first = (split_parties(title) or [""])[0]
    words = [w for w in re.findall(r"[a-z]+", first.lower()) if w not in {"justice", "retd", "smt", "shri", "sri", "dr", "the", "his", "holiness", "ors", "anr", "and", "etc"}]
    return " ".join(words[:3])


def text_key(text: str) -> str:
    """Fingerprint of a judgment's wording, for spotting the same judgment filed under two case numbers."""
    t = re.sub(r"\W+", " ", text.lower()).strip()
    return hashlib.md5((t[:600] + "|" + t[-1500:]).encode()).hexdigest()


# ----------------------------------------------------------------------------------------------- Supreme Court
# (title fragment, year of decision[, SCR citation]). The fragment is matched as whole words against the official SCR
# metadata ("^" anchors it to the start of the title, "|" separates spellings). Where a party has several reported
# judgments in the year, the citation picks the one meant. One judgment is taken per entry; an entry that matches
# nothing is reported by the loader, not guessed at.
LANDMARKS: list[tuple] = [
    # constitutional
    ("A.K. GOPALAN", 1950), ("ROMESH THAPPAR", 1950), ("CHAMPAKAM DORAIRAJAN", 1951), ("SANKARI PRASAD", 1951),
    ("ANWAR ALI SARKAR", 1952), ("M.P. SHARMA", 1954), ("BENGAL IMMUNITY", 1955), ("EXPRESS NEWSPAPERS", 1958),
    ("KHARAK SINGH", 1962), ("SAJJAN SINGH", 1964), ("GOLAK NATH", 1967), ("RUSTOM CAVASJEE COOPER", 1970),
    ("MADHAV RAO", 1970), ("KESAVANANDA", 1973), ("INDIRA NEHRU GANDHI", 1975), ("DISTRICT MAGISTRATE JABALPUR", 1976),
    ("SUNIL BATRA", 1978), ("HUSSAINARA KHATOON", 1979), ("RAMANA DAYARAM SHETTY", 1979), ("MINERVA MILLS", 1980),
    ("BACHAN SINGH", 1980), ("WAMAN RAO", 1980), ("S.P. GUPTA", 1981), ("FRANCIS CORALIE", 1981),
    ("NERGESH MEERZA", 1981), ("PEOPLE'S UNION FOR DEMOCRATIC RIGHTS", 1982), ("BANDHUA MUKTI MORCHA", 1983),
    ("MITHU", 1983), ("SHEELA BARSE", 1986), ("AHMED KHAN", 1985), ("CENTRAL INLAND WATER", 1986),
    ("A.R. ANTULAY", 1988), ("KIHOTO HOLLOHAN", 1992), ("INDRA SAWHNEY", 1992), ("MOHINI JAIN", 1992),
    ("UNNI KRISHNAN", 1993), ("SUPREME COURT ADVOCATES-ON-RECORD", 1993, "[1993] SUPP. 2 S.C.R. 659"), ("S.R. BOMMAI", 1994), ("R.R. GOPAL", 1994),
    ("SARLA MUDGAL", 1995), ("L. CHANDRA KUMAR", 1997), ("VISHAKA", 1997), ("D.K. BASU", 1996), ("VINEET NARAIN", 1997),
    ("SAMATHA", 1997), ("VELLORE CITIZENS", 1996), ("T.N. GODAVARMAN", 1996), ("PEOPLE'S UNION FOR CIVIL LIBERTIES", 1996),
    ("GITHA HARIHARAN", 1999), ("LILY THOMAS", 2000), ("DANIAL LATIFI", 2001), ("PAI FOUNDATION", 2002),
    ("PEOPLE'S UNION FOR CIVIL LIBERTIES", 2003), ("P.A. INAMDAR", 2005), ("RAMESHWAR PRASAD", 2006), ("M. NAGARAJ", 2006), ("JARNAIL SINGH", 2018),
    ("^PRAKASH SINGH", 2006), ("LATA SINGH", 2006), ("I.R. COELHO", 2007), ("ASHOKA KUMAR THAKUR", 2008), ("SELVI", 2010),
    ("ARUNA RAMCHANDRA SHANBAUG", 2011, "[2011] 4 S.C.R. 1057"), ("RAM JETHMALANI", 2011), ("NOVARTIS", 2013), ("LILY THOMAS", 2013),
    ("SURESH KUMAR KOUSHAL", 2013), ("PEOPLE'S UNION FOR CIVIL LIBERTIES", 2013), ("NATIONAL LEGAL SERVICES AUTHORITY", 2014),
    ("SHABNAM HASHMI", 2014), ("SHREYA SINGHAL", 2015), ("SUPREME COURT ADVOCATES-ON-RECORD", 2015, "[2015] 13 S.C.R. 1"),
    ("SHAYARA BANO", 2017), ("PUTTASWAMY", 2018), ("COMMON CAUSE", 2018, "[2018] 6 S.C.R. 1"), ("NAVTEJ SINGH JOHAR", 2018),
    ("JOSEPH SHINE", 2018), ("INDIAN YOUNG LAWYERS", 2018), ("SHAFIN JAHAN", 2018), ("SHAKTI VAHINI", 2018),
    ("TEHSEEN", 2018, "[2018] 9 S.C.R. 291"), ("M. SIDDIQ", 2019), ("ANURADHA BHASIN", 2020), ("INTERNET AND MOBILE ASSOCIATION", 2020),
    ("AMISH DEVGAN", 2020), ("JANHIT ABHIYAN", 2022), ("VIVEK NARAYAN SHARMA", 2023), ("ANOOP BARANWAL", 2023),
    ("KAUSHAL KISHOR", 2023), ("SUPRIYO", 2023), ("ASSOCIATION FOR DEMOCRATIC REFORMS", 2024, "[2024] 2 S.C.R. 420"), ("DAVINDER SINGH", 2024),
    # criminal law and procedure
    ("VIRSA SINGH", 1958), ("NANAVATI", 1961), ("BALIAY", 1977), ("MOTI RAM", 1978),
    ("GURBAKSH SINGH SIBBIA", 1980), ("SARDA", 1984), ("BHAJAN LAL", 1990), ("JOGINDER KUMAR", 1994),
    ("SAKSHI", 2004), ("ZAHIRA HABIBULLA", 2004), ("SANJAY CHANDRA", 2011), ("LALITA KUMARI", 2013), ("ARNESH KUMAR", 2014),
    ("ANVAR P.V.", 2014), ("DASHRATH RUPSINGH RATHOD", 2014), ("^MUKESH & ANR", 2017), ("INDEPENDENT THOUGHT", 2017),
    ("RAJESH SHARMA", 2017), ("NIKESH TARACHAND SHAH", 2017), ("DATARAM SINGH", 2018), ("P. CHIDAMBARAM", 2019),
    ("SUSHILA AGGARWAL", 2020), ("ARNAB MANORANJAN GOSWAMI", 2020), ("ARJUN PANDITRAO KHOTKAR", 2020), ("TOFAN SINGH", 2020),
    ("SATENDER KUMAR ANTIL", 2022), ("VIJAY MADANLAL CHOUDHARY", 2022), ("MOHAMMED ZUBAIR", 2022),
    # civil, commercial, family, consumer, environment
    ("MUGNEERAM", 1954), ("RURAL LITIGATION", 1985), ("M.C. MEHTA", 1986, "[1987] 1 S.C.R. 819"), ("SUBHASH KUMAR", 1991),
    ("LUCKNOW DEVELOPMENT AUTHORITY", 1993), ("INDIAN MEDICAL ASSOCIATION", 1995), ("SHAMIM ARA", 2002),
    ("JACOB MATHEW", 2005), ("SALEM ADVOCATE BAR ASSOCIATION", 2005), ("D. VELUSAMY", 2010), ("BHARAT ALUMINIUM", 2012),
    ("VODAFONE INTERNATIONAL", 2012), ("INDRA SARMA", 2013), ("INNOVENTIVE INDUSTRIES|INNOVENTIVE INDUSTRLES", 2017), ("SWISS RIBBONS", 2019),
    ("ESSAR STEEL", 2019), ("VINEETA SHARMA", 2020), ("VIDYA DROLIA", 2020),
]
LANDMARK_MAX_MATCHES = 1


def _norm_title(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[.,'’`]", " ", (s or "").upper())).strip()


def _norm_citation(s: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def landmark_label(entry: tuple) -> str:
    return f"{entry[0].lstrip('^').split('|')[0]} ({entry[1]})"


def find_landmark(md: pd.DataFrame, entry: tuple) -> pd.DataFrame:
    """Rows of the metadata an entry names, best first. With a citation: that report. Otherwise the title fragment in
    the year of decision, then in the SCR volume of that year, then one year either side (a judgment delivered in
    December is often reported in the next year's volume, and a few decision dates in the metadata are misprints)."""
    frag, year = entry[0], entry[1]
    if len(entry) > 2:
        return md[md.citation.map(_norm_citation) == _norm_citation(entry[2])]
    anchor = "^" if frag.startswith("^") else r"\b"
    pattern = anchor + "(?:" + "|".join(re.escape(_norm_title(f)) for f in frag.lstrip("^").split("|")) + r")\b"
    hit = md[md.title.map(_norm_title).str.contains(pattern, regex=True)]
    for mask in (hit.dec_year == year, hit.vol_year == year, hit.dec_year.between(year - 1, year + 1) | hit.vol_year.between(year - 1, year + 1)):
        if mask.any():
            return hit[mask].sort_values(["pages", "path"], ascending=[False, True])
    return hit.iloc[0:0]


def sc_metadata() -> pd.DataFrame:
    cols = ["title", "judge", "citation", "case_id", "decision_date", "disposal_nature", "path", "year"]
    md = pd.concat([pd.read_parquet(f, columns=cols) for f in sorted(glob.glob(str(SC_MIRROR / "metadata/parquet/year=*/metadata.parquet")))], ignore_index=True)
    md = md.dropna(subset=["path", "title"]).drop_duplicates("path").copy()
    md["vol_year"] = md.year.astype(int)
    d = md.decision_date.map(iso_date)
    md["date"] = d
    md["dec_year"] = d.str[:4].astype("Int64").fillna(md.vol_year).astype(int)
    # A decision year far from the volume year is a misprint in the source (a 2010 report "decided" in 2007).
    md.loc[(md.dec_year - md.vol_year).abs() > 2, "dec_year"] = md.vol_year
    # path = [S_]<volume year>_<volume>_<first page>_<last page>. Some rows give a last page that runs into the
    # judgments that follow, so the span is clamped to the next judgment's first page in the same volume.
    parts = md.path.str.extract(r"^(?P<vol>(?:S_)?\d{4}_\d+)_(?P<start>\d+)_(?P<end>\d+)$")
    md["vol"] = parts.vol
    md["start"] = pd.to_numeric(parts.start, errors="coerce")
    md["end"] = pd.to_numeric(parts.end, errors="coerce")
    md = md.sort_values(["vol", "start", "path"])
    nxt = md.groupby("vol").start.shift(-1)
    overlap = nxt.notna() & (nxt > md.start) & (nxt <= md.end)
    md["runs_on"] = overlap                                   # the file also holds the start of the next judgment
    md["pages"] = (md.end.where(~overlap, nxt - 1) - md.start + 1).clip(lower=1).fillna(1)
    return md[md.title.str.len() > 5]


def select_sc(md: pd.DataFrame, available: set[str], skip_keys: set[tuple[str, int]], skip_paths: frozenset[str] = frozenset()) -> tuple[pd.DataFrame, list[str]]:
    """Landmarks first, then per reporting year: the longest reported judgments (a proxy for weight) and a seeded
    random sample, half and half. `available` is the set of paths whose English text we actually hold."""
    md = md[md.path.isin(available) & ~md.path.isin(skip_paths) & ~md.vol_year.isin(SC_SKIP_YEARS) & ~md.dec_year.isin(SC_SKIP_YEARS)]
    md = md[[(case_key(t), y) not in skip_keys for t, y in zip(md.title, md.dec_year)]]
    md = md.sort_values("path").drop_duplicates(["title", "decision_date", "pages"])       # one report filed under two volumes
    picked: dict[str, str] = {}
    labels: dict[str, str] = {}
    missing = []
    for entry in LANDMARKS:
        hit = find_landmark(md, entry)
        if hit.empty:
            missing.append(landmark_label(entry)); continue
        for p in hit.path.head(LANDMARK_MAX_MATCHES):
            if p not in picked:
                picked[p] = "landmark"; labels[p] = landmark_label(entry)
    rnd = random.Random(SEED)
    for year, grp in md.groupby("vol_year"):
        quota = SC_PER_YEAR_NEW if year >= 2000 else SC_PER_YEAR_OLD
        have = sum(1 for p in grp.path if p in picked)
        pool = grp[~grp.path.isin(picked.keys()) & (grp.pages >= 3)].sort_values(["pages", "path"], ascending=[False, True])
        need = max(0, quota - have)
        for p in pool.path.head(need // 2):
            picked[p] = "long"
        rest = [p for p in pool.path if p not in picked]
        for p in rnd.sample(rest, min(len(rest), need - need // 2)):
            picked[p] = "sample"
    out = md[md.path.isin(picked.keys())].copy()
    out["why"] = out.path.map(picked)
    out["landmark"] = out.path.map(labels)
    return out, missing


def _pdf_text(zf_path: str, member: str) -> str:
    with zipfile.ZipFile(zf_path) as zf, tempfile.TemporaryDirectory() as td:
        pdf = zf.extract(member, td)
        return subprocess.run(["pdftotext", "-enc", "UTF-8", "-nopgbrk", pdf, "-"], capture_output=True, text=True, timeout=120, check=True).stdout


def _sc_texts(sel: pd.DataFrame, old_text: dict[str, str], zip_of: dict[str, str]) -> tuple[dict[str, str], int]:
    """Text for every selected path: 1950-1997 from the pre-extracted parquet, later years from the SCR PDFs. PDF text
    is cached next to the archives so a rebuild does not need pdftotext or the archives again. Returns the texts
    and the number of PDFs that could not be read (never cached, so they are retried on the next run)."""
    cache_path = SC_MIRROR / "selected_text.jsonl"
    cache = {r["path"]: r["text"] for r in read_jsonl(cache_path) if r["text"]} if cache_path.exists() else {}
    texts = {p: old_text[p] for p in sel.path if p in old_text}
    jobs = [p for p in sel.path if p not in texts and p not in cache and p in zip_of]
    failed = 0
    if jobs:
        if not shutil.which("pdftotext"):
            raise RuntimeError("pdftotext (poppler) is needed to read the Supreme Court Reports PDFs; install poppler and re-run")
        def run(p):
            try:
                return p, _pdf_text(zip_of[p], f"{p}_EN.pdf")
            except Exception:
                return p, ""
        with ThreadPoolExecutor(8) as ex:
            for p, t in ex.map(run, jobs):
                if t.strip():
                    cache[p] = t
                else:
                    failed += 1
        write_jsonl(cache_path, (json.dumps({"path": p, "text": t}, ensure_ascii=False) for p, t in cache.items()))
    texts.update({p: cache[p] for p in sel.path if p in cache})
    return texts, failed


def load_sc_reports(skip_keys: set[tuple[str, int]], skip_paths: frozenset[str] = frozenset()) -> tuple[list[Document], dict]:
    md = sc_metadata()
    old = pd.read_parquet(SC_TEXT_OLD, columns=["cnr", "full_text", "text_length"])
    old = old[old.cnr.str.endswith("_EN") & (old.text_length >= MIN_JUDGMENT_CHARS)]
    old_text = dict(zip(old.cnr.str[:-3], old.full_text))
    zip_of: dict[str, str] = {}                               # path -> archive; a report is not always in its own year's archive
    for z in sorted(glob.glob(str(SC_MIRROR / "data/zip/year=*/english.zip"))):
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                if n.endswith("_EN.pdf"):
                    zip_of.setdefault(n[:-7], z)
    sel, missing = select_sc(md, set(old_text) | set(zip_of), skip_keys, skip_paths)
    texts, unreadable = _sc_texts(sel, old_text, zip_of)
    docs, dropped = [], 0
    for r in sel.itertuples(index=False):
        raw = texts.get(r.path, "")
        if len(raw) < MIN_JUDGMENT_CHARS or not looks_english(raw):
            dropped += 1; continue
        text, truncated = cap_text(raw)
        judges = [j.strip() for j in re.split(r",|;", r.judge or "") if j.strip()]
        extra = {"citation": r.citation, "neutral_citation": r.case_id or None, "judges": judges, "disposal": r.disposal_nature or None,
                 "selected_as": r.why, "truncated": truncated, "full_chars": len(raw)}
        if isinstance(r.landmark, str):
            extra["landmark"] = r.landmark                    # the LANDMARKS entry this judgment was picked for
        if r.runs_on:
            extra["runs_on"] = True                           # the source PDF continues into the next reported judgment
        docs.append(Document(
            doc_id=f"case::sc::{r.path.lower()}", doc_type="case", source=SRC_SC, title=smart_title(r.title), text=text,
            court="Supreme Court of India", year=int(r.dec_year), date=r.date, cited_sections=extract_section_refs(text, None), extra=extra,
        ))
    by_year, kept = Counter(), {d.doc_id for d in docs}
    for r in sel.itertuples(index=False):
        if f"case::sc::{r.path.lower()}" in kept:
            by_year[int(r.vol_year)] += 1
    quota = lambda y: SC_PER_YEAR_NEW if y >= 2000 else SC_PER_YEAR_OLD
    years = [y for y in range(int(md.vol_year.min()), int(md.vol_year.max()) + 1) if y not in SC_SKIP_YEARS]
    info = {"selected": len(sel), "kept": len(docs), "dropped_short_or_non_english": dropped, "pdfs_unreadable": unreadable,
            "by_reason": dict(Counter(d.extra["selected_as"] for d in docs)),
            "landmark_entries": len(LANDMARKS), "landmark_entries_found": len(LANDMARKS) - len(missing), "landmarks_not_found": missing,
            "years_under_half_quota": {str(y): by_year.get(y, 0) for y in years if by_year.get(y, 0) < quota(y) / 2}}
    return docs, info


# ----------------------------------------------------------------------------------------------- High Courts
# CNR prefix -> court. Madras has two registries (the principal seat and the Madurai Bench); they are one High Court
# and share one quota. Patna (BRHC) is left out: v1 already has 5,975 Patna matters.
HC_COURTS = {
    "KAHC": "High Court of Karnataka", "HCBM": "Bombay High Court", "HBHC": "High Court for the State of Telangana",
    "PHHC": "High Court of Punjab and Haryana", "KLHC": "High Court of Kerala", "HCMA": "Madras High Court",
    "HCMD": "Madras High Court", "RJHC": "Rajasthan High Court", "GJHC": "High Court of Gujarat",
    "DLHC": "High Court of Delhi", "CGHC": "High Court of Chhattisgarh", "HPHC": "High Court of Himachal Pradesh",
    "APHC": "High Court of Andhra Pradesh", "UPHC": "Allahabad High Court", "GAHC": "Gauhati High Court",
    "MPHC": "High Court of Madhya Pradesh", "JHHC": "High Court of Jharkhand", "ODHC": "Orissa High Court",
    "WBCH": "Calcutta High Court", "UKHC": "High Court of Uttarakhand", "JKHC": "High Court of Jammu & Kashmir and Ladakh",
    "TRHC": "High Court of Tripura", "MNHC": "High Court of Manipur", "MLHC": "High Court of Meghalaya", "SKHC": "High Court of Sikkim",
}
HC_MIN_CHARS, HC_MAX_CHARS = 8_000, 150_000                           # skips the routine one-page orders that make up most of the dump
HC_OVERSAMPLE = 3                                                    # candidates read per kept judgment, to replace rejects


def hc_court(prefix: str, date: str | None) -> str:
    """The court as it was named on the day. The Hyderabad registry (HBHC) was the High Court of Andhra Pradesh
    until 1 June 2014 and the common High Court at Hyderabad until 31 December 2018."""
    if prefix == "HBHC" and date:
        if date < "2014-06-02":
            return "High Court of Andhra Pradesh"
        if date < "2019-01-01":
            return "High Court of Judicature at Hyderabad"
    return HC_COURTS[prefix]


def hc_title(raw: str, petitioner: str = "", respondent: str = "") -> str:
    """'CR. APP (DB)/296/2021 of RAMJEET YADAV Vs THE STATE OF BIHAR' -> 'Ramjeet Yadav v. The State of Bihar'"""
    head, sep, tail = (raw or "").partition(" of ")
    title = smart_title(tail if sep and "/" in head else raw)
    if " v. " not in title and petitioner and respondent:     # one side missing in the title: use the party columns
        title = smart_title(f"{petitioner} versus {respondent}")
    return title or (head.strip() if sep else "") or "Untitled matter"


def hc_date(cnr: str, decision_date: str | None) -> str | None:
    """The CNR ends in the date of the order; where the separate date column disagrees, the text sides with the CNR."""
    m = re.search(r"_(\d{4}-\d{2}-\d{2})$", cnr or "")
    return m.group(1) if m else iso_date(decision_date)


def load_hc_judgments() -> tuple[list[Document], dict]:
    import pyarrow.parquet as pq
    pf = pq.ParquetFile(HC_PARQUET)
    meta = pf.read(columns=["cnr", "text_length", "title", "disposal_nature_normalized"]).to_pandas()
    meta = meta[meta.cnr.str[:4].isin(list(HC_COURTS)) & meta.text_length.between(HC_MIN_CHARS, HC_MAX_CHARS) & (meta.title.str.len() > 8)
                & ~meta.disposal_nature_normalized.isin(["withdrawn", "closed"])].drop_duplicates("cnr")
    meta["court"] = meta.cnr.str[:4].map(HC_COURTS)
    rnd = random.Random(SEED)
    order: dict[str, list[str]] = {}                          # court -> candidate CNRs in a seeded random order
    for court, grp in meta.sort_values("cnr").groupby("court"):
        ids = list(grp.cnr); rnd.shuffle(ids)
        order[court] = ids[:HC_PER_COURT * HC_OVERSAMPLE]
    want = {c for ids in order.values() for c in ids}
    rows = []
    for i in range(pf.metadata.num_row_groups):
        t = pf.read_row_group(i, columns=["cnr", "full_text", "title", "judge", "petitioner", "respondent", "decision_date", "disposal_nature_normalized"]).to_pandas()
        rows.append(t[t.cnr.isin(want)])
    got = pd.concat(rows, ignore_index=True).drop_duplicates("cnr").set_index("cnr")
    docs, seen_text, rejected, short = [], set(), Counter(), {}
    for court, ids in order.items():
        kept = 0
        for cnr in ids:
            if kept >= HC_PER_COURT:
                break
            if cnr not in got.index:
                continue
            r = got.loc[cnr]
            if not looks_english(r.full_text):
                rejected["unreadable"] += 1; continue
            key = text_key(r.full_text)
            if key in seen_text:                              # the same judgment under another case number
                rejected["duplicate"] += 1; continue
            seen_text.add(key)
            text, truncated = cap_text(r.full_text)
            date = hc_date(cnr, r.decision_date)
            docs.append(Document(
                doc_id=f"case::hcj::{slug(cnr)}", doc_type="case", source=SRC_HC, title=hc_title(r.title, r.petitioner or "", r.respondent or ""), text=text,
                court=hc_court(cnr[:4], date), year=int(date[:4]) if date else None, date=date, cited_sections=extract_section_refs(text, None),
                extra={"cnr": cnr, "judges": [j.strip() for j in re.split(r",|;", r.judge or "") if j.strip()],
                       "disposal": r.disposal_nature_normalized or None, "truncated": truncated},
            ))
            kept += 1
        if kept < HC_PER_COURT:
            short[court] = kept
    return docs, {"kept": len(docs), "high_courts": len(order), "registries": len(HC_COURTS), "rejected": dict(rejected), "courts_under_quota": short}


# ----------------------------------------------------------------------------------------------- key Acts
# Not Acts: the old-code/new-code mapping tables. Codes that v1 already curates section by section are left alone.
ACT_SKIP = re.compile(r"^(?:bns|bnss|bsa|ipc|crpc|iea)_to_(?:bns|bnss|bsa|ipc|crpc|iea)$|constitution|^bharatiya_|^indian_penal_code", re.I)
ACT_ALIASES = {                                                                    # same Act, different name in the v1 corpus
    "customs_act_1962": "Custom Act, 1962",
    "recovery_of_debts_and_bankruptcy_act_1993": "Recovery of Debts Due to Banks and Financial Institutions Act, 1993",
    "van_sanrakshan_evam_samvardhan_adhiniyam_1980": "Forest (Conservation) Act, 1980",
    "wildlife_protection_act_1972": "Wild Life (Protection) Act, 1972",
}
ACT_NAMES = {                                                                      # Acts new to the corpus
    "income_tax_act_2025": "Income-tax Act, 2025", "indian_partnership_act_1932": "Indian Partnership Act, 1932",
    "limited_liability_partnership_act_2008": "Limited Liability Partnership Act, 2008",
    "occupational_safety_health_and_working_conditions_code_2020": "Occupational Safety, Health and Working Conditions Code, 2020",
    "telecommunications_act_2023": "Telecommunications Act, 2023",
    "the_digital_personal_data_protection_act_2023": "Digital Personal Data Protection Act, 2023",
    "the_industrial_relations_code_2020": "Industrial Relations Code, 2020",
}
_ACT_STOP = {"the", "act", "of", "and", "indian", "code", "for", "in", "to", "on"}
_ACT_DISTINCT = {"amendment", "repeal", "repealing", "validation", "second", "third", "central", "integrated", "union", "state", "supplementary", "miscellaneous", "special"}
_REPEALED = re.compile(r"^\W*(?:\d+\[)?\W*(?:repealed|omitted|rep\.)", re.I)
MIN_SECTION_WORDS = 12


def _act_tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z]+", s.lower()) if t not in _ACT_STOP}


def norm_section(s) -> str:
    return re.sub(r"[\s.\-]", "", str(s)).upper()


def match_act(stem: str, existing_acts: list[str]) -> str | None:
    """The v1 name of the Act a knowledge-base file describes, or None if v1 does not have it. Two names are the
    same Act when they share a year and most words, and differ by no word that marks a different statute."""
    if stem in ACT_ALIASES:
        return ACT_ALIASES[stem] if ACT_ALIASES[stem] in existing_acts else None
    year = stem[-4:]
    want = _act_tokens(stem[:-5].replace("_", " "))
    best, score = None, 0.0
    for a in existing_acts:
        if not a.endswith(year):
            continue
        have = _act_tokens(a)
        if (want ^ have) & _ACT_DISTINCT:
            continue
        s = len(want & have) / max(1, len(want | have))
        if s > score:
            best, score = a, s
    return best if score >= 0.6 else None


def _words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", s.lower())


def text_in(body: str, act_words: str, k: int = 8) -> bool:
    """Is this section's wording already in the Act's existing text? Three eight-word runs are looked up; two must be
    found. This catches an Act that v1 stores under other numbers (the Indian Succession Act is held as 48 chapters
    labelled Section 1 to 48), where comparing section numbers alone would add every section a second time."""
    w = _words(body)
    if len(w) < k + 4:
        return False
    starts = sorted({min(max(0, int(len(w) * f)), len(w) - k) for f in (0.15, 0.5, 0.8)})
    hits = sum((" " + " ".join(w[s:s + k]) + " ") in act_words for s in starts)
    return hits >= max(1, len(starts) - 1)


def trim_run_on(sec: str, body: str) -> str:
    """A few knowledge-base records run on into the sections that follow. Cut at the next section's lead-in when the
    one after it is there too (two consecutive later numbers at line starts are not a coincidence)."""
    if not sec.isdigit():
        return body
    n = int(sec)
    a = re.search(rf"\n\s*(?:\d+\[)?{n + 1}\.\s+[A-Z]", body)
    if a and re.search(rf"\n\s*(?:\d+\[)?{n + 2}\.\s+[A-Z]", body[a.end():]):
        return body[:a.start()].rstrip()
    return body


def _act_records(path: str) -> list[tuple[str, str, str, str | None]]:
    """(section, title, text, chapter) from any of the knowledge base's file shapes."""
    d = json.load(open(path, encoding="utf-8"))
    out = []
    for r in (d["sections"] if isinstance(d, dict) else d):
        sec = r.get("section_number", r.get("section", r.get("Section")))
        title = (r.get("section_title") or r.get("title") or "").strip().rstrip(".")
        body = (r.get("text") or r.get("section_desc") or r.get("description") or "").strip()
        if sec is None or not body:
            continue
        sec = str(sec).strip().rstrip(".")
        bare = "text" not in r
        if bare and _REPEALED.match(body):
            continue
        if bare and not re.match(rf"^\W*(?:\d+\[)?\s*{re.escape(sec)}\.", body):
            body = f"{sec}. {title}.—{body}" if title else f"{sec}. {body}"      # bare description: restore the "12. Heading.—" lead-in
        chapter = r.get("chapter_title") or (f"Chapter {r['chapter']}" if r.get("chapter") else None)
        out.append((sec, title, trim_run_on(sec, body), chapter))
    return out


def _substance(sec: str, title: str, body: str) -> str:
    """The section's text without its number and heading, to tell a provision from a heading-only stub."""
    t = re.sub(rf"^\W*(?:\d+\[)?\s*{re.escape(sec)}\.\s*", "", body)
    if title and t.lower().startswith(title.lower()):
        t = t[len(title):]
    return t.lstrip(" .—-–:")


def load_key_acts(have: dict[str, set[str]], act_text: dict[str, str] | None = None) -> tuple[list[Document], dict]:
    """`have`: Act -> normalised section numbers already in the corpus. `act_text`: Act -> all of its existing text as
    space-separated lower-case words (padded with a space each side), for the wording check."""
    act_text = act_text or {}
    existing = list(have)
    docs, filled, new_acts, skipped = [], {}, {}, Counter()
    for f in sorted(glob.glob(str(ACTS_DIR / "*.json"))):
        stem = Path(f).stem
        if ACT_SKIP.search(stem):
            continue
        act = match_act(stem, existing)
        is_new = act is None
        if is_new:
            act = ACT_NAMES.get(stem) or ACT_ALIASES.get(stem) or f"{stem[:-5].replace('_', ' ').title().replace(' Of ', ' of ').replace(' And ', ' and ')}, {stem[-4:]}"
        seen = set(have.get(act, ()))
        words = act_text.get(act, "")
        n = 0
        for sec, title, body, chapter in _act_records(f):
            key = norm_section(sec)
            sub = _substance(sec, title, body)
            if len(sub.split()) < MIN_SECTION_WORDS or _REPEALED.match(sub):
                skipped["stub_or_repealed"] += 1; continue
            if key in seen:
                skipped["number_present"] += 1; continue
            if words and text_in(sub, words):
                skipped["text_present"] += 1; continue
            seen.add(key); n += 1
            docs.append(Document(
                doc_id=f"statute::{slug(act)}::{sec}", doc_type="statute", source=SRC_ACTS, title=f"{sec}. {title[:140]} — {act}" if title else f"Section {sec} — {act}",
                text=body, act=act, section=sec, chapter=chapter, year=int(stem[-4:]), cited_sections=extract_section_refs(body, act),
            ))
        if n:
            (new_acts if is_new else filled)[act] = n
    return docs, {"sections": len(docs), "acts_completed": len(filled), "acts_added": len(new_acts), "new_acts": new_acts, "skipped": dict(skipped)}


# ----------------------------------------------------------------------------------------------- driver
def expand_corpus(corpus_path: Path = CORPUS_PATH) -> dict:
    base = [d for d in read_jsonl(corpus_path) if d["source"] not in NEW_SOURCES]          # re-running replaces, never stacks
    have: dict[str, set[str]] = defaultdict(set)
    words: dict[str, list[str]] = defaultdict(list)
    skip_keys: set[tuple[str, int]] = set()
    skip_paths: set[str] = set()
    for d in base:
        if d["doc_type"] == "statute":
            have[d["act"]].add(norm_section(d["section"]))
            words[d["act"]].extend(_words(d["text"]))
        elif d["source"] == "SCR-2016":                       # case::sc2016::2017-5-160-276-en -> 2017_5_160_276
            path = re.sub(r"-en$", "", d["doc_id"].split("::")[-1]).replace("-", "_")
            skip_paths.add("S_" + path[2:] if path.startswith("s_") else path)
        elif d["source"] == "capstone-phase2" and d.get("year"):
            for y in range(d["year"] - 2, d["year"] + 3):     # v1 dates some of these by filing year
                skip_keys.add((case_key(d["title"]), y))
    act_text = {a: " " + " ".join(w) + " " for a, w in words.items()}
    acts, acts_info = load_key_acts(have, act_text)
    sc, sc_info = load_sc_reports(skip_keys, frozenset(skip_paths))
    hc, hc_info = load_hc_judgments()
    seen = {d["doc_id"] for d in base}
    added = []
    for doc in acts + sc + hc:
        if doc.doc_id not in seen:
            seen.add(doc.doc_id); added.append(doc)
    tmp = Path(str(corpus_path) + ".tmp")
    rows = [json.dumps(d, ensure_ascii=False) for d in base] + [d.to_json() for d in added]
    n = write_jsonl(tmp, rows)
    os.replace(tmp, corpus_path)
    stats_path = DATA_PROCESSED / "corpus_stats.json"
    old = json.load(open(stats_path)) if stats_path.exists() else {}
    parsed = [json.loads(r) for r in rows]
    counts = Counter(corpus_group(d["source"], d.get("act")) for d in parsed)     # counted from the file written, so the rows add up to the total
    stats = {k: counts.get(k, 0) for k in CORPUS_GROUPS}
    stats.update({"total": n, "statutes": sum(d["doc_type"] == "statute" for d in parsed), "cases": sum(d["doc_type"] == "case" for d in parsed)})
    stats.update({k: old[k] for k in ("hanno_train_rows", "hanno_test_rows") if k in old})
    json.dump(stats, open(stats_path, "w"), indent=2)            # stays flat: the API and the Methodology page list its keys
    detail = {"v1_total": len(base), "key_acts": acts_info, "sc_reports": sc_info, "hc_judgments": hc_info}
    json.dump(detail, open(DATA_PROCESSED / "corpus_expansion.json", "w"), indent=2)
    return stats | {"expansion": detail}


if __name__ == "__main__":
    print(json.dumps(expand_corpus(), indent=2))
