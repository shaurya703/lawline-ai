"""Streamlit chat UI for LawLine AI. Run: streamlit run lawline/app.py"""
from __future__ import annotations
import os, time
import streamlit as st
from lawline.config import RetrievalConfig, BASE_EMBEDDING_MODEL

st.set_page_config(page_title="LawLine AI", page_icon="⚖️", layout="wide")


@st.cache_resource(show_spinner="Loading indices and models…")
def load_engine():
    from lawline.engine import QueryEngine
    return QueryEngine(faiss_tag=os.environ.get("LAWLINE_FAISS_TAG", "base"),
                       embed_model=os.environ.get("LAWLINE_EMBED_MODEL", BASE_EMBEDDING_MODEL))


st.title("⚖️ LawLine AI — Conversational Assistant for Legal Support")
st.caption("Hybrid RAG over Indian statutes (IPC, BNS/BNSS/BSA, Constitution, 1,000+ central acts) and case law. "
           "Answers are grounded in retrieved passages with citations. Information only — not legal advice.")

with st.sidebar:
    st.header("Retrieval settings")
    use_faiss = st.checkbox("Semantic (FAISS)", True)
    use_bm25 = st.checkbox("Keyword (BM25)", True)
    use_kg = st.checkbox("Knowledge graph", True)
    use_rer = st.checkbox("Cross-encoder reranker", True)
    final_k = st.slider("Passages to LLM", 1, 10, 5)
    use_llm = st.checkbox("Generate answer with LLM", True)
    st.divider()
    st.markdown("**Examples**")
    examples = ["What is the punishment for cheating under Section 420 IPC?",
                "Which BNS section replaces IPC 302 for murder?",
                "What does Article 21 of the Constitution guarantee?",
                "A husband and in-laws harass a woman for dowry. Which IPC sections apply?",
                "What did Maneka Gandhi v. Union of India decide?"]
    for e in examples:
        if st.button(e, use_container_width=True):
            st.session_state["q"] = e

if "history" not in st.session_state:
    st.session_state["history"] = []

q = st.chat_input("Ask a legal question…") or st.session_state.pop("q", None)
for role, text in st.session_state["history"]:
    with st.chat_message(role):
        st.markdown(text)

if q:
    st.session_state["history"].append(("user", q))
    with st.chat_message("user"):
        st.markdown(q)
    eng = load_engine()
    cfg = RetrievalConfig(use_faiss=use_faiss, use_bm25=use_bm25, use_kg=use_kg, use_reranker=use_rer, final_k=final_k)
    if not (use_faiss or use_bm25 or use_kg):
        st.error("Enable at least one retriever."); st.stop()
    with st.chat_message("assistant"):
        with st.spinner("Retrieving and generating…"):
            ans = eng.ask(q, cfg, use_llm=use_llm)
        st.markdown(ans.answer)
        st.session_state["history"].append(("assistant", ans.answer))
        t = ans.timings_ms
        st.caption(f"backend: {ans.backend} ({ans.model}) · retrieval {t.get('retrieval_total', 0):.0f} ms · "
                   f"generation {t.get('generation', 0):.0f} ms · total {t.get('total', 0):.0f} ms")
        with st.expander("Sources and retrieved passages", expanded=False):
            for p in ans.retrieval.passages:
                used = "✅" if any(c["n"] == p.rank and c["used"] for c in ans.citations) else "▫️"
                st.markdown(f"**[{p.rank}] {p.chunk.citation}** {used} · score {p.score:.3f} · via {', '.join(p.sources)}")
                st.text(p.chunk.text[:900] + ("…" if len(p.chunk.text) > 900 else ""))
        with st.expander("Stage latency (ms)"):
            st.json({k: round(v, 1) for k, v in t.items()})
