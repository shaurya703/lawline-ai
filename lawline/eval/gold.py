"""Gold evaluation sets (document-level relevance) and training pairs.

Tasks
  bns_qa        : natural-language question  -> BNS/BNSS/BSA section   (GSMS-B QA, held-out 10 %)
  ipc_facts     : masked High-Court fact pattern -> IPC section(s)     (Hanno-Labs, case-level held-out 10 %, NOT in corpus)
  const_qa      : question about the Constitution -> article(s)        (nisaar QA; labels mined from answers)
  sc_case       : one-paragraph case description -> SC judgment       (SCR 2016 summaries)
All query sets are frozen to data/processed/gold_*.jsonl so every experiment sees identical queries.
"""
from __future__ import annotations
import json, random, re
from collections import defaultdict
import pandas as pd
from ..config import DATA_RAW, DATA_PROCESSED, CORPUS_PATH
from ..data.schema import read_jsonl, write_jsonl
from ..data.ingest import ACT_ALIASES, slug

SEED = 13
CONST = "Constitution of India, 1949"
IPC = "Indian Penal Code, 1860"


def _corpus_ids() -> set[str]:
    return {d["doc_id"] for d in read_jsonl(CORPUS_PATH)}


def build_bns_qa(ids: set[str], test_frac=0.1, max_test=600):
    df = pd.read_json(DATA_RAW / "GSMS-B__Indian-Legal-QA-BNS-BNSS-BSA/bns_bnss_bsa_combined_legal_qa.jsonl", lines=True)
    df["act_full"] = df.act.map(lambda a: ACT_ALIASES.get(a, a))
    df["doc_id"] = [f"statute::{slug(a)}::{s}" for a, s in zip(df.act_full, df.section_number.astype(str))]
    df = df[df.doc_id.isin(ids) & (df.question.str.len() > 15)]
    secs = sorted(df.doc_id.unique()); rnd = random.Random(SEED); rnd.shuffle(secs)
    test_secs = set(secs[: int(test_frac * len(secs))])
    test = df[df.doc_id.isin(test_secs)].sample(frac=1, random_state=SEED).head(max_test)
    train = df[~df.doc_id.isin(test_secs)]
    gold = [{"qid": f"bns_{i}", "task": "bns_qa", "query": r.question, "relevant": [r.doc_id],
             "meta": {"qtype": r.question_type, "act": r.act_full}} for i, r in enumerate(test.itertuples())]
    pairs = [{"query": r.question, "pos_doc": r.doc_id} for r in train.itertuples()]
    return gold, pairs


HEADER_TAIL = re.compile(r"^.*?CORAM\s*:.*?(?:ORDER|JUDGMENT|JUDGEMENT)\s*\d*\s*(?:Date\s*:)?\s*[\d./-]*\s*-*\s*", re.S | re.I)


def strip_hc_header(facts: str) -> str:
    """Drop the cause-title boilerplate (court, case number, parties, counsel, coram, date) that precedes the facts."""
    body = facts.rsplit("=====", 1)[-1] if "=====" in facts else facts
    body = HEADER_TAIL.sub("", body, count=1) if "CORAM" in body.upper() else body
    body = re.sub(r"^\s*(?:CAV\s+)?(?:ORAL\s+)?(?:ORDER|JUDGMENT)\s*\d*\s*[\d./-]*\s*", "", body, flags=re.I)
    return body.strip() if len(body.strip()) > 80 else facts


def build_ipc_facts(ids: set[str], max_test=500, max_train=12000, max_chars=1800):
    test = pd.read_parquet(DATA_PROCESSED / "hanno_test.parquet")
    train = pd.read_parquet(DATA_PROCESSED / "hanno_train.parquet")
    def to_doc(s): return f"statute::{slug(IPC)}::{str(s).upper()}"
    gold = []
    g = test.groupby("case_key")
    keys = sorted(g.groups); random.Random(SEED).shuffle(keys)
    for k in keys[:max_test]:
        grp = g.get_group(k)
        rel = sorted({to_doc(s) for s in grp.ipc_section if to_doc(s) in ids})
        if rel:
            gold.append({"qid": f"ipc_{k}", "task": "ipc_facts", "query": strip_hc_header(grp.case_facts.iloc[0])[:max_chars],
                         "relevant": rel, "meta": {"n_sections": len(rel), "doc_types": ["statute"]}})
    tr = train.drop_duplicates("case_key").sample(frac=1, random_state=SEED).head(max_train)
    pairs = [{"query": strip_hc_header(r.case_facts)[:max_chars], "pos_doc": to_doc(r.ipc_section)} for r in tr.itertuples() if to_doc(r.ipc_section) in ids]
    return gold, pairs


def build_const_qa(ids: set[str], test_frac=0.3):
    df = pd.read_json(DATA_RAW / "nisaar__Constitution_of_India/constitution_train.jsonl", lines=True)
    rows = []
    for r in df.itertuples():
        arts = list(dict.fromkeys(re.findall(r"[Aa]rticle\s+(\d+[A-Z]?)", str(r.answer))))
        docs = [f"statute::{slug(CONST)}::{a}" for a in arts if f"statute::{slug(CONST)}::{a}" in ids]
        if 1 <= len(docs) <= 3:
            rows.append((r.question, docs))
    rnd = random.Random(SEED); rnd.shuffle(rows)
    n_test = int(test_frac * len(rows))
    gold = [{"qid": f"const_{i}", "task": "const_qa", "query": q, "relevant": d, "meta": {}} for i, (q, d) in enumerate(rows[:n_test])]
    pairs = [{"query": q, "pos_doc": d[0]} for q, d in rows[n_test:]]
    return gold, pairs


def build_sc_case(ids: set[str]):
    gold = []
    for d in read_jsonl(CORPUS_PATH):
        if d["doc_id"].startswith("case::sc2016::"):
            s = (d.get("extra") or {}).get("summary", "")
            if len(s) > 80:
                gold.append({"qid": f"sc_{d['doc_id'].split('::')[-1]}", "task": "sc_case", "query": s,
                             "relevant": [d["doc_id"]], "meta": {"topics": d.get("topics", [])[:3]}})
    return gold, []


def build_all() -> dict:
    ids = _corpus_ids()
    stats, all_gold, all_pairs = {}, [], []
    for name, fn in (("bns_qa", build_bns_qa), ("ipc_facts", build_ipc_facts), ("const_qa", build_const_qa), ("sc_case", build_sc_case)):
        gold, pairs = fn(ids)
        write_jsonl(DATA_PROCESSED / f"gold_{name}.jsonl", gold)
        all_gold += gold; all_pairs += [p | {"task": name} for p in pairs]
        stats[name] = {"queries": len(gold), "train_pairs": len(pairs)}
    write_jsonl(DATA_PROCESSED / "gold_all.jsonl", all_gold)
    write_jsonl(DATA_PROCESSED / "train_pairs.jsonl", all_pairs)
    json.dump(stats, open(DATA_PROCESSED / "gold_stats.json", "w"), indent=2)
    return stats


def load_gold(task: str | None = None) -> list[dict]:
    return list(read_jsonl(DATA_PROCESSED / (f"gold_{task}.jsonl" if task else "gold_all.jsonl")))


if __name__ == "__main__":
    print(json.dumps(build_all(), indent=2))
