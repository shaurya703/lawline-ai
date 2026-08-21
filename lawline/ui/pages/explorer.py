import streamlit as st, pandas as pd, plotly.express as px
from ..theme import hero, kpi, ACCENT, ACCENT2
from ..state import engine, statute_index, case_index


def render():
    hero("PROVISION EXPLORER", "Browse 1,000+ central Acts section by section, read the text, and see which judgments cite a provision.", "CORPUS BROWSER")
    idx = statute_index(); eng = engine(); G = eng.retriever.kg.g
    acts = sorted(idx, key=lambda a: -len(idx[a]))
    c1, c2 = st.columns([1, 2])
    with c1:
        fav = ["Indian Penal Code, 1860", "Bharatiya Nyaya Sanhita, 2023", "Constitution of India, 1949", "Code of Criminal Procedure Act, 1973", "Bharatiya Nagarik Suraksha Sanhita, 2023", "Indian Evidence Act, 1872", "Indian Contract Act, 1872", "Negotiable Instruments Act, 1881"]
        act = st.selectbox("Act", fav + [a for a in acts if a not in fav])
        df = idx[act]; q = st.text_input("Search within act", "")
        view = df[df.title.str.contains(q, case=False) | df.text.str.contains(q, case=False)] if q else df
        st.caption(f"{len(view)} of {len(df)} provisions")
        sel = st.selectbox("Provision", view.index, format_func=lambda i: f"{'Art.' if act.startswith('Constitution') else 's.'} {view.loc[i,'section']} — {view.loc[i,'title'][:60]}") if len(view) else None
    with c2:
        if sel is not None:
            row = view.loc[sel]
            st.markdown(f"### {'Article' if act.startswith('Constitution') else 'Section'} {row.section} · {act}")
            st.markdown(f'<div class="ll-card" style="white-space:pre-wrap;font-size:14px;line-height:1.6">{row.text}</div>', unsafe_allow_html=True)
            from ...data.ingest import slug
            node = f"sec:{slug(act)}:{str(row.section).upper()}"
            if node in G:
                cites = [u for u, _, d in G.in_edges(node, data=True) if d.get("rel") == "CITES"]
                refs = [v for _, v, d in G.out_edges(node, data=True) if d.get("rel") == "REFERS_TO"]
                gov = [u for u, _, d in G.in_edges(node, data=True) if d.get("rel") == "GOVERNED_BY"]
                a, b, c = st.columns(3)
                with a: kpi("Citing judgments", len(cites))
                with b: kpi("Cross-references", len(refs))
                with c: kpi("Concepts", len(gov))
                if gov: st.markdown("**Concepts:** " + ", ".join(G.nodes[u]["label"] for u in gov))
                if refs: st.markdown("**Refers to:** " + ", ".join(G.nodes[v]["label"] for v in refs[:12]))
                if cites:
                    with st.expander(f"Judgments citing this provision ({len(cites)})"):
                        st.dataframe(pd.DataFrame([{"case": G.nodes[u]["label"], "court": G.nodes[u].get("court"), "year": G.nodes[u].get("year")} for u in cites[:200]]), use_container_width=True, hide_index=True)
            if st.button("💬 Ask Counsel about this provision"):
                st.session_state["pending_query"] = f"Explain {'Article' if act.startswith('Constitution') else 'Section'} {row.section} of the {act} in plain English, with its punishment or effect."
                st.switch_page(st.session_state["pages"]["Counsel"])
    st.markdown("#### 📊 Corpus overview")
    sizes = pd.DataFrame({"act": acts[:40], "sections": [len(idx[a]) for a in acts[:40]]})
    fig = px.bar(sizes, x="sections", y="act", orientation="h", color="sections", color_continuous_scale=[[0, ACCENT2], [1, ACCENT]]); fig.update_layout(height=700, yaxis=dict(autorange="reversed"), coloraxis_showscale=False)
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
    cs = case_index()
    fig = px.histogram(cs.dropna(subset=["year"]), x="year", color="source", nbins=60, title="Judgments by year and source"); fig.update_layout(height=280)
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
