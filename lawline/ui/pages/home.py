import streamlit as st, plotly.graph_objects as go, pandas as pd
from ..theme import hero, kpi, ACCENT, ACCENT2, GOLD, GREEN, MUTED
from ..state import corpus_stats, gold_stats, results, engine


def render():
    cs, gs = corpus_stats(), gold_stats()
    hero("LAWLINE AI · COMMAND CENTER", "Knowledge-graph-augmented hybrid retrieval for Indian law. Every answer is grounded in retrieved statutes and judgments, "
         "cited passage by passage, and scored against a 1,810-query benchmark.", "RETRIEVAL CORES ONLINE · GEMINI LINK ACTIVE")
    st.write("")
    c = st.columns(6)
    with c[0]: kpi("Documents", f"{cs.get('total', 0):,}", f"{cs.get('statutes', 0):,} provisions · {cs.get('cases', 0):,} judgments")
    with c[1]: kpi("Benchmark", f"{sum(v['queries'] for v in gs.values()) if gs else 0:,}", "held-out queries · 4 tasks")
    df = results("ablation_ft/metrics.csv")
    routed = df[(df.task == "macro") & df.config.str.startswith("routed")] if df is not None else None
    r5 = float(routed["R@5"].iloc[0]) if routed is not None and len(routed) else float("nan")
    nd = float(routed["nDCG@10"].iloc[0]) if routed is not None and len(routed) else float("nan")
    with c[2]: kpi("Recall@5", f"{r5:.3f}", "macro · routed system")
    with c[3]: kpi("nDCG@10", f"{nd:.3f}", "BM25 baseline 0.525")
    ae = results("answer_eval/summary.json") or {}
    with c[4]: kpi("AIBE", f"{ae.get('aibe', {}).get('rag_acc', 0) * 100:.1f}%", f"closed-book {ae.get('aibe', {}).get('closed_book_acc', 0) * 100:.1f}%")
    with c[5]: kpi("Faithfulness", f"{ae.get('rag', {}).get('faithfulness_mean(0-2)', 0):.2f}/2", "LLM-judged, grounded answers")
    st.write("")
    left, right = st.columns([1.25, 1])
    with left:
        st.markdown("#### ⚡ Quick consult")
        q = st.text_input("Ask anything about Indian law", placeholder="e.g. What is the punishment for cheating under Section 420 IPC?", label_visibility="collapsed")
        cols = st.columns(4)
        for i, ex in enumerate(["Anticipatory bail under BNSS?", "Article 21 scope", "Cheque bounce — which section?", "IPC 302 → BNS?"]):
            if cols[i].button(ex, use_container_width=True):
                q = {"Anticipatory bail under BNSS?": "What is anticipatory bail under BNSS?", "Article 21 scope": "What does Article 21 of the Constitution guarantee?",
                     "Cheque bounce — which section?": "Which section governs dishonour of a cheque and what is the punishment?", "IPC 302 → BNS?": "Which BNS section replaces IPC Section 302 and what is the punishment?"}[ex]
        if q:
            st.session_state["pending_query"] = q
            st.switch_page(st.session_state["pages"]["Counsel"])
        st.markdown("#### 🛰 Pipeline")
        fig = go.Figure(go.Sankey(arrangement="snap", node=dict(pad=18, thickness=16, color=[ACCENT, ACCENT, ACCENT2, GOLD, ACCENT2, "#c8d6e5", GREEN, GREEN],
                                                              label=["Query", "Dense (FAISS · fine-tuned)", "Lexical (BM25)", "Knowledge graph", "Reciprocal rank fusion", "Cross-encoder rerank", "Gemini · cited answer", "You"],
                                                              line=dict(width=0)),
                                   link=dict(source=[0, 0, 0, 1, 2, 3, 4, 5, 6], target=[1, 2, 3, 4, 4, 4, 5, 6, 7], value=[3, 3, 2, 3, 3, 2, 6, 5, 5],
                                             color=["rgba(0,229,255,.25)"] * 3 + ["rgba(124,77,255,.25)"] * 3 + ["rgba(255,209,102,.25)", "rgba(46,230,166,.25)", "rgba(46,230,166,.25)"])))
        fig.update_layout(height=260, margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
    with right:
        st.markdown("#### 🎯 Performance radar")
        if df is not None:
            tasks = ["bns_qa", "ipc_facts", "const_qa", "sc_case"]; lab = ["BNS-QA", "IPC facts→section", "Constitution-QA", "SC case"]
            fig = go.Figure()
            for cfg, name, col in [("bm25", "BM25", MUTED), ("faiss", "Dense (fine-tuned)", ACCENT2), ("routed: dense (narrative) | faiss+bm25+kg+rerank (question)", "LawLine (routed)", ACCENT)]:
                v = [float(df[(df.task == t) & (df.config == cfg)]["R@5"].iloc[0]) for t in tasks]
                fig.add_trace(go.Scatterpolar(r=v + v[:1], theta=lab + lab[:1], fill="toself", name=name, line=dict(color=col), opacity=.85))
            fig.update_layout(polar=dict(bgcolor="rgba(255,255,255,.02)", radialaxis=dict(range=[0, 1], gridcolor="rgba(139,155,180,.2)"), angularaxis=dict(gridcolor="rgba(139,155,180,.2)")),
                              height=330, legend=dict(orientation="h", y=-0.15), margin=dict(l=40, r=40, t=20, b=10))
            st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
        st.markdown("#### 🧩 Modules")
        mods = [("Dense retriever", "bge-small · legal fine-tuned", GREEN), ("BM25", "legal tokenizer · 69k chunks", GREEN), ("Knowledge graph", "46k nodes · 81k edges · 214 concepts", GREEN),
                ("Cross-encoder", "ms-marco MiniLM-L6", GREEN), ("Generator", "Gemini flash-lite · auto fallback", GREEN), ("Router", "length-based query routing", GREEN)]
        for n, d, col in mods:
            st.markdown(f'<div class="ll-mono"><span class="ll-pulse"></span><b style="color:#dfe7f5">{n}</b> · {d}</div>', unsafe_allow_html=True)
