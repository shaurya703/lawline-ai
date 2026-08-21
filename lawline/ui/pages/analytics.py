import streamlit as st, plotly.graph_objects as go, plotly.express as px, pandas as pd, json
from ..theme import hero, kpi, gauge, ACCENT, ACCENT2, GOLD, GREEN, RED, MUTED
from ..state import results, train_meta

ROUTED = "routed: dense (narrative) | faiss+bm25+kg+rerank (question)"
TASK = {"bns_qa": "BNS-QA", "ipc_facts": "IPC facts→section", "const_qa": "Constitution-QA", "sc_case": "SC case", "macro": "Macro"}


def render():
    hero("ANALYTICS", "Every number from the evaluation harness, interactive. 1,810 held-out queries · four tasks · ablations, fine-tuning, fusion, chunking, latency and answer quality.", "BENCHMARK TELEMETRY")
    base, ft = results("ablation_base/metrics.csv"), results("ablation_ft/metrics.csv")
    tabs = st.tabs(["Retrieval ablation", "Fine-tuning", "Reranking & routing", "Fusion sweep", "Chunking", "Latency", "Answer quality", "Raw tables"])
    with tabs[0]:
        if ft is not None:
            metric = st.selectbox("Metric", ["R@5", "R@1", "R@10", "MRR@10", "nDCG@10"], key="m0")
            order = ["bm25", "faiss", "kg", "faiss+bm25", "faiss+kg", "bm25+kg", "faiss+bm25+kg", "faiss+rerank", "bm25+rerank", "faiss+bm25+rerank", "faiss+bm25+kg+rerank", ROUTED]
            fig = go.Figure()
            for df, name, col in [(base, "base encoder", MUTED), (ft, "legal fine-tuned", ACCENT)]:
                m = df[df.task == "macro"].set_index("config").reindex(order)
                fig.add_trace(go.Bar(name=name, x=[c.replace(ROUTED, "LawLine (routed)") for c in m.index], y=m[metric], marker_color=col))
            fig.update_layout(barmode="group", height=400, title=f"Macro {metric} by retriever configuration", yaxis=dict(range=[0, 1]))
            st.plotly_chart(fig, use_container_width=True)
            tasks = ["bns_qa", "ipc_facts", "const_qa", "sc_case"]; cfgs = ["bm25", "faiss", "kg", "faiss+bm25+kg", "faiss+bm25+kg+rerank", ROUTED]
            z = [[float(ft[(ft.task == t) & (ft.config == c)][metric].iloc[0]) for t in tasks] for c in cfgs]
            fig = go.Figure(go.Heatmap(z=z, x=[TASK[t] for t in tasks], y=[c.replace(ROUTED, "LawLine (routed)") for c in cfgs], colorscale=[[0, "#0e1628"], [0.5, ACCENT2], [1, ACCENT]], text=[[f"{v:.2f}" for v in r] for r in z], texttemplate="%{text}", zmin=0, zmax=1))
            fig.update_layout(height=380, title=f"{metric} per task (fine-tuned encoder)"); st.plotly_chart(fig, use_container_width=True)
    with tabs[1]:
        c = st.columns(2)
        for col, (name, lab) in zip(c, [("lawline-bge-small-legal", "Bi-encoder · MultipleNegativesRankingLoss"), ("lawline-reranker-legal", "Cross-encoder · BCE")]):
            tm = train_meta(name)
            with col:
                if tm:
                    h = pd.DataFrame(tm["loss_history"])
                    fig = px.line(h, x="step", y="loss", title=lab); fig.update_traces(line_color=ACCENT); fig.update_layout(height=300)
                    st.plotly_chart(fig, use_container_width=True)
                    st.markdown(f'<div class="ll-mono">examples {tm.get("examples", tm.get("pairs"))} · steps {tm.get("steps")} · batch {tm.get("batch")} · lr {tm.get("lr")} · {tm.get("train_seconds", 0)/60:.0f} min on {tm.get("device")} · frozen layers {tm.get("freeze_layers")}</div>', unsafe_allow_html=True)
        if base is not None and ft is not None:
            rows = []
            for t in ["bns_qa", "ipc_facts", "const_qa", "sc_case", "macro"]:
                rows.append({"task": TASK[t], "base": float(base[(base.task == t) & (base.config == "faiss")]["R@5"].iloc[0]), "fine-tuned": float(ft[(ft.task == t) & (ft.config == "faiss")]["R@5"].iloc[0])})
            d = pd.DataFrame(rows); fig = go.Figure([go.Bar(name="base", x=d.task, y=d.base, marker_color=MUTED), go.Bar(name="fine-tuned", x=d.task, y=d["fine-tuned"], marker_color=ACCENT)])
            fig.update_layout(barmode="group", title="Dense retriever R@5 before / after legal fine-tuning", height=340, yaxis=dict(range=[0, 1])); st.plotly_chart(fig, use_container_width=True)
    with tabs[2]:
        lc = results("ablation_ft_legalce/metrics.csv")
        if ft is not None:
            variants = [("no reranker", ft, "faiss+bm25+kg"), ("generic cross-encoder", ft, "faiss+bm25+kg+rerank"), ("legal cross-encoder (1 epoch)", lc, "faiss+bm25+kg+rerank"), ("dense only", ft, "faiss"), ("LawLine routed", ft, ROUTED)]
            tasks = ["bns_qa", "ipc_facts", "const_qa", "sc_case", "macro"]; fig = go.Figure()
            for lab, src, cfg in variants:
                if src is None: continue
                fig.add_trace(go.Bar(name=lab, x=[TASK[t] for t in tasks], y=[float(src[(src.task == t) & (src.config == cfg)]["R@5"].iloc[0]) for t in tasks]))
            fig.update_layout(barmode="group", height=400, title="Recall@5 by reranking strategy", yaxis=dict(range=[0, 1])); st.plotly_chart(fig, use_container_width=True)
            st.info("A generic web-trained reranker collapses narrative fact-pattern queries (0.325 → 0.023); a one-epoch legal reranker fixes that task but forgets general relevance. "
                    "Routing long queries to the fine-tuned dense retriever keeps the best of both.")
    with tabs[3]:
        if ft is not None:
            sw = ft[(ft.task == "macro") & ft.config.str.contains(r"\[")]
            fig = go.Figure([go.Bar(name=m, x=sw.config, y=sw[m]) for m in ["R@1", "R@5", "nDCG@10"]]); fig.update_layout(barmode="group", height=380, title="RRF weight / k sensitivity (full hybrid, no reranker)")
            st.plotly_chart(fig, use_container_width=True); st.caption("Boosting exact KG hits hurts R@1 because one concept maps to several sibling provisions. Equal weights, k=60 shipped.")
    with tabs[4]:
        cs = results("chunk_sweep.csv")
        if cs is not None:
            fig = px.line(cs, x="chunk_words", y="R@5", color="retriever", markers=True, title="Chunk-size sweep (core sub-corpus)"); fig.update_layout(height=360)
            st.plotly_chart(fig, use_container_width=True)
            fig = px.line(cs, x="chunk_words", y=["bns_qa_R@5", "ipc_facts_R@5", "const_qa_R@5", "sc_case_R@5"], facet_col="retriever", markers=True); fig.update_layout(height=320)
            st.plotly_chart(fig, use_container_width=True)
    with tabs[5]:
        lat = results("ablation_ft/latency.json") or {}
        if lat:
            c = st.columns(5)
            for col, (k, lab, mx) in zip(c, [("embed_single", "query embed", 60), ("faiss", "FAISS", 10), ("bm25", "BM25", 3000), ("kg", "KG", 200), ("rerank_per_pair", "rerank / pair", 20)]):
                with col: st.plotly_chart(gauge(lat[k]["p50_ms"], f"{lab} p50 ms", mx, "", ACCENT, 170), use_container_width=True, config={"displayModeBar": False})
            d = pd.DataFrame([{"stage": k, "p50": v["p50_ms"], "p95": v["p95_ms"], "mean": v["mean_ms"]} for k, v in lat.items() if k != "embed_batch_total_ms"])
            fig = go.Figure([go.Bar(name="p50", x=d.stage, y=d.p50, marker_color=ACCENT), go.Bar(name="p95", x=d.stage, y=d.p95, marker_color=ACCENT2)]); fig.update_layout(barmode="group", height=320, yaxis_type="log", title="Per-stage latency (ms, log)")
            st.plotly_chart(fig, use_container_width=True)
    with tabs[6]:
        ae = results("answer_eval/summary.json")
        if ae:
            c = st.columns(4)
            with c[0]: kpi("AIBE closed-book", f"{ae['aibe']['closed_book_acc']*100:.1f}%", f"n={ae['aibe']['n']}")
            with c[1]: kpi("AIBE with LawLine", f"{ae['aibe']['rag_acc']*100:.1f}%", "same generator")
            with c[2]: kpi("Faithfulness", f"{ae['rag']['faithfulness_mean(0-2)']:.2f}/2", f"closed-book {ae['closed']['faithfulness_mean(0-2)']:.2f}")
            with c[3]: kpi("Gold provision cited", f"{ae['rag']['gold_cited_rate']*100:.0f}%", f"retrieved {ae['rag']['retrieval_hit_rate']*100:.0f}%")
            labels = ["correctness", "faithfulness", "fully correct", "fabricated citation"]
            cb = [ae["closed"]["correctness_mean(0-2)"] / 2, ae["closed"]["faithfulness_mean(0-2)"] / 2, ae["closed"]["fully_correct_rate"], ae["closed"]["fabricated_citation_rate"]]
            rg = [ae["rag"]["correctness_mean(0-2)"] / 2, ae["rag"]["faithfulness_mean(0-2)"] / 2, ae["rag"]["fully_correct_rate"], ae["rag"]["fabricated_citation_rate"]]
            fig = go.Figure([go.Bar(name="closed-book", x=labels, y=cb, marker_color=MUTED), go.Bar(name="LawLine RAG", x=labels, y=rg, marker_color=GREEN)]); fig.update_layout(barmode="group", height=340, title=f"Judged answer quality (judge: {ae.get('judge')})")
            st.plotly_chart(fig, use_container_width=True)
            g = results("answer_eval/grounded.csv")
            if g is not None:
                with st.expander("Judged examples"):
                    st.dataframe(g[["question", "closed_correct", "rag_correct", "rag_faithful", "retrieval_hit", "gold_cited", "rag_reason"]].dropna(subset=["rag_correct"]), use_container_width=True, hide_index=True)
    with tabs[7]:
        for name in ["ablation_ft/metrics.csv", "ablation_base/metrics.csv", "chunk_sweep.csv"]:
            d = results(name)
            if d is not None:
                st.markdown(f"**{name}**"); st.dataframe(d, use_container_width=True, hide_index=True, height=260)
