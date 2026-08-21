import streamlit as st, plotly.graph_objects as go, pandas as pd, numpy as np
from ..theme import hero, ACCENT, ACCENT2, GOLD, GREEN, MUTED, gauge, badges
from ..state import engine
from ...config import RetrievalConfig


def render():
    eng = engine()
    hero("RETRIEVAL LAB", "Look inside the retrieval stack: each retriever's ranking, how reciprocal-rank fusion merges them, what the cross-encoder promotes, and where the milliseconds go.", "DIAGNOSTICS MODE")
    q = st.text_input("Query", "Which IPC sections apply when a husband harasses his wife for dowry?")
    c = st.columns(4); k = c[0].slider("Candidates per retriever", 10, 50, 30); final_k = c[1].slider("Final passages", 3, 10, 5)
    scope = c[2].selectbox("Scope", ["All", "Statutes", "Cases"]); route = c[3].toggle("Auto-route long queries", True)
    if not q:
        return
    cfg = RetrievalConfig(top_k_each=k, final_k=final_k, doc_types={"All": (), "Statutes": ("statute",), "Cases": ("case",)}[scope], auto_route=route)
    rr = eng.retriever.retrieve(q, cfg); by = eng.retriever.by_id
    t = rr.timings_ms
    st.markdown(f'<div class="ll-mono">route: <b>{"NARRATIVE → dense only" if t.get("route") else "QUESTION → full hybrid + rerank"}</b> · {len(q.split())} words · KG mentions: {eng.retriever.kg.extract_mentions(q)}</div>', unsafe_allow_html=True)
    g = st.columns(5)
    for i, (name, key) in enumerate([("embed", "embed"), ("FAISS", "faiss"), ("BM25", "bm25"), ("KG", "kg"), ("rerank", "rerank")]):
        with g[i]: st.plotly_chart(gauge(t.get(key, 0), f"{name} ms", max(50, max(t.get(key, 0) * 1.3, 50)), "", [ACCENT, ACCENT, GOLD, ACCENT2, GREEN][i], 140), use_container_width=True, config={"displayModeBar": False})
    cols = st.columns(3)
    for col, name, color in zip(cols, ["faiss", "bm25", "kg"], [ACCENT, GOLD, ACCENT2]):
        with col:
            lst = rr.per_retriever.get(name, [])
            st.markdown(f"**{name.upper()}** · {len(lst)} candidates")
            for i, cid in enumerate(lst[:8]):
                if cid in by:
                    st.markdown(f'<div class="ll-src" style="border-left-color:{color}"><b>{i+1}.</b> {by[cid].citation[:70]}</div>', unsafe_allow_html=True)
    st.markdown("#### 🔀 Fusion → reranking")
    fused = [c for c in rr.fused[:k] if c in by]; final = [p.chunk.chunk_id for p in rr.passages]
    ranks = {name: {cid: i for i, cid in enumerate(lst)} for name, lst in rr.per_retriever.items()}
    rows = []
    for i, cid in enumerate(fused[:15]):
        rows.append({"fused rank": i + 1, "passage": by[cid].citation[:60], **{f"{n} rank": (ranks[n].get(cid, None) + 1 if cid in ranks[n] else None) for n in ranks},
                     "final rank": (final.index(cid) + 1) if cid in final else None})
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
    if rr.passages:
        fig = go.Figure(go.Bar(x=[p.score for p in rr.passages], y=[f"[{p.rank}] {p.chunk.citation[:45]}" for p in rr.passages][::1], orientation="h",
                               marker=dict(color=[p.score for p in rr.passages], colorscale=[[0, ACCENT2], [1, ACCENT]]), text=[badges(p.sources) for p in rr.passages]))
        fig.update_layout(height=60 + 40 * len(rr.passages), title="Final passages · reranker score", yaxis=dict(autorange="reversed"))
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
        # sankey retriever -> final passage
        src, dst, val = [], [], []
        labels = ["FAISS", "BM25", "KG"] + [f"[{p.rank}] {p.chunk.citation[:28]}" for p in rr.passages]
        for j, p in enumerate(rr.passages):
            for s in p.sources:
                if s in ("faiss", "bm25", "kg"):
                    src.append(["faiss", "bm25", "kg"].index(s)); dst.append(3 + j); val.append(1)
        if src:
            fig = go.Figure(go.Sankey(node=dict(label=labels, pad=14, thickness=14, color=[ACCENT, GOLD, ACCENT2] + [GREEN] * len(rr.passages), line=dict(width=0)),
                                      link=dict(source=src, target=dst, value=val, color="rgba(0,229,255,.18)")))
            fig.update_layout(height=320, title="Which retriever surfaced each final passage"); st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
