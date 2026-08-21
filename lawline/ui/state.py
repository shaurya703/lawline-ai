"""Cached engine + data loaders shared by all pages."""
from __future__ import annotations
import json, os
from pathlib import Path
import pandas as pd
import streamlit as st
from ..config import ROOT, RESULTS_DIR, FIG_DIR, DATA_PROCESSED, MODEL_DIR, INDEX_DIR, BASE_EMBEDDING_MODEL

FT_MODEL = str(MODEL_DIR / "lawline-bge-small-legal")


def embed_choice():
    tag = os.environ.get("LAWLINE_FAISS_TAG", "ft" if (INDEX_DIR / "faiss_ft").exists() else "base")
    model = os.environ.get("LAWLINE_EMBED_MODEL", FT_MODEL if tag == "ft" and Path(FT_MODEL).exists() else BASE_EMBEDDING_MODEL)
    return tag, model


@st.cache_resource(show_spinner="Spinning up retrieval cores…")
def engine():
    from ..engine import QueryEngine
    tag, model = embed_choice()
    return QueryEngine(faiss_tag=tag, embed_model=model)


@st.cache_data
def results(name: str):
    p = RESULTS_DIR / name
    if p.suffix == ".csv" and p.exists():
        return pd.read_csv(p)
    if p.suffix == ".json" and p.exists():
        return json.load(open(p))
    return None


@st.cache_data
def corpus_stats():
    p = DATA_PROCESSED / "corpus_stats.json"
    return json.load(open(p)) if p.exists() else {}


@st.cache_data
def gold_stats():
    p = DATA_PROCESSED / "gold_stats.json"
    return json.load(open(p)) if p.exists() else {}


@st.cache_data
def train_meta(name: str):
    p = MODEL_DIR / name / "train_meta.json"
    return json.load(open(p)) if p.exists() else None


def history():
    if "chat" not in st.session_state:
        st.session_state.chat = []
    return st.session_state.chat


@st.cache_resource
def statute_index():
    """act -> DataFrame(section, title, doc_id, text) built from the chunk store (first chunk of each statute doc)."""
    eng = engine()
    rows = {}
    for c in eng.retriever.chunks:
        if c.doc_type == "statute" and c.position == 0:
            rows[c.doc_id] = {"act": c.act, "section": c.section, "title": c.title.split(" — ")[0][:120], "doc_id": c.doc_id, "text": c.text, "year": c.year}
    df = pd.DataFrame(rows.values())
    return {a: g.sort_values("section", key=lambda s: s.map(_sec_key)).reset_index(drop=True) for a, g in df.groupby("act")}


def _sec_key(s):
    import re
    m = re.match(r"(\d+)([A-Za-z]*)", str(s))
    return (int(m.group(1)), m.group(2)) if m else (10**6, str(s))


@st.cache_resource
def case_index():
    eng = engine(); rows = {}
    for c in eng.retriever.chunks:
        if c.doc_type == "case" and c.position == 0:
            rows[c.doc_id] = {"title": c.title, "court": c.court, "year": c.year, "doc_id": c.doc_id, "source": c.source}
    return pd.DataFrame(rows.values())


def llm_text(system: str, user: str, max_tokens: int = 900) -> str:
    eng = engine()
    if not eng.llm or not eng.llm.available:
        return "LLM backend not configured (set GEMINI_API_KEY)."
    try:
        eng.llm.max_tokens = max_tokens
        return eng.llm.complete(system, user).text
    except Exception as e:
        return f"LLM error: {e}"
