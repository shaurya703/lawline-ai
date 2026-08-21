import streamlit as st, plotly.graph_objects as go, networkx as nx, pandas as pd, numpy as np
from ..theme import hero, kpi, ACCENT, ACCENT2, GOLD, GREEN, RED, MUTED
from ..state import engine
from ...index.concepts import CONCEPTS

KIND_COLOR = {"act": GOLD, "section": ACCENT, "case": ACCENT2, "topic": MUTED, "concept": GREEN}


def render():
    eng = engine(); kg = eng.retriever.kg; G = kg.g
    hero("KNOWLEDGE GRAPH", "Acts, provisions, judgments, topics and curated legal concepts, linked by cross-references and citations. Explore a neighbourhood or search a concept.", "GRAPH ENGINE · NETWORKX")
    st_ = kg.stats(); c = st.columns(6)
    for col, (k, v) in zip(c, list(st_["nodes"].items()) + [("edges", sum(st_["edges"].values()))]):
        with col: kpi(k, f"{v:,}")
    st.write("")
    left, right = st.columns([1, 2.2])
    with left:
        mode = st.radio("Start from", ["Concept", "Section / Article", "Case"], horizontal=True)
        if mode == "Concept":
            opts = sorted(kg.concept_index); phrase = st.selectbox("Legal concept", opts, index=opts.index("anticipatory bail") if "anticipatory bail" in opts else 0); start = kg.concept_index[phrase]
        elif mode == "Section / Article":
            acts = sorted({G.nodes[n]["label"] for n in G if G.nodes[n].get("kind") == "act"})
            act = st.selectbox("Act", acts, index=acts.index("Indian Penal Code, 1860") if "Indian Penal Code, 1860" in acts else 0)
            from ...data.ingest import slug
            secs = sorted([n for n in G.successors(f"act:{slug(act)}")], key=lambda n: (len(n.split(":")[-1]), n))
            sec = st.selectbox("Section", secs, format_func=lambda n: G.nodes[n].get("title", n)[:80]); start = sec
        else:
            cases = [n for n in G if G.nodes[n].get("kind") == "case" and G.in_degree(n) + G.out_degree(n) > 2]
            start = st.selectbox("Case", cases[:3000], format_func=lambda n: G.nodes[n]["label"][:70])
        hops = st.slider("Hops", 1, 2, 2); max_nodes = st.slider("Max nodes", 20, 150, 60)
        st.markdown("**Edge legend** · HAS_SECTION · REFERS_TO · CITES · ABOUT · GOVERNED_BY")
        st.markdown("".join(f'<span class="ll-badge" style="border-color:{c};color:{c}">{k}</span>' for k, c in KIND_COLOR.items()), unsafe_allow_html=True)
    with right:
        nodes = {start}; frontier = {start}
        for _ in range(hops):
            nxt = set()
            for n in frontier:
                nxt |= set(G.successors(n)) | set(G.predecessors(n))
            nodes |= nxt; frontier = nxt
            if len(nodes) > max_nodes: break
        nodes = list(nodes)[:max_nodes]; H = G.subgraph(nodes)
        pos = nx.spring_layout(H, seed=3, k=0.9 / max(1, np.sqrt(len(nodes))))
        ex, ey, etext = [], [], []
        for u, v, d in H.edges(data=True):
            ex += [pos[u][0], pos[v][0], None]; ey += [pos[u][1], pos[v][1], None]
        fig = go.Figure(go.Scatter(x=ex, y=ey, mode="lines", line=dict(width=0.8, color="rgba(139,155,180,.35)"), hoverinfo="none", showlegend=False))
        for kind, color in KIND_COLOR.items():
            ns = [n for n in H if H.nodes[n].get("kind") == kind]
            if not ns: continue
            fig.add_trace(go.Scatter(x=[pos[n][0] for n in ns], y=[pos[n][1] for n in ns], mode="markers+text", name=kind,
                                     text=[(H.nodes[n].get("label", n)[:26] if (n == start or len(ns) < 25) else "") for n in ns], textposition="top center", textfont=dict(size=9, color="#dfe7f5"),
                                     marker=dict(size=[22 if n == start else 9 + min(12, H.degree(n)) for n in ns], color=color, line=dict(width=1, color="rgba(255,255,255,.4)"), opacity=.9),
                                     hovertext=[f"{H.nodes[n].get('label', n)}<br>{n}<br>degree {G.degree(n)}" for n in ns], hoverinfo="text"))
        fig.update_layout(height=560, showlegend=True, xaxis=dict(visible=False), yaxis=dict(visible=False), margin=dict(l=0, r=0, t=10, b=0), dragmode="pan")
        st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": True, "displayModeBar": False})
        edges = pd.DataFrame([{"from": G.nodes[u].get("label", u)[:50], "relation": d.get("rel"), "to": G.nodes[v].get("label", v)[:50]} for u, v, d in H.edges(data=True)])
        with st.expander(f"Edges in view ({len(edges)})"):
            st.dataframe(edges, use_container_width=True, hide_index=True)
    st.markdown("#### 🧭 Concept map & IPC → BNS transition")
    rows = []
    for phrase, provs in CONCEPTS.items():
        ipc = [s for a, s in provs if a.startswith("Indian Penal")]; bns = [s for a, s in provs if a.startswith("Bharatiya Nyaya")]
        rows.append({"concept": phrase, "provisions": "; ".join(f"{a.split(',')[0]} s.{s}" for a, s in provs), "IPC": ", ".join(ipc), "BNS 2023": ", ".join(bns)})
    df = pd.DataFrame(rows); f = st.text_input("Filter concepts", "")
    st.dataframe(df[df.concept.str.contains(f, case=False)] if f else df, use_container_width=True, hide_index=True, height=320)
    deg = pd.Series(dict(G.degree())); kinds = pd.Series({n: G.nodes[n].get("kind") for n in G})
    fig = go.Figure()
    for kind, color in KIND_COLOR.items():
        d = deg[kinds == kind]
        if len(d): fig.add_trace(go.Histogram(x=np.log10(d + 1), name=kind, marker_color=color, opacity=.7, nbinsx=40))
    fig.update_layout(barmode="overlay", height=260, title="Degree distribution (log10)", xaxis_title="log10(degree+1)")
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
