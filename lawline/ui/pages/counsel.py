import re, json, time
import streamlit as st, plotly.graph_objects as go
from ..theme import hero, badges, gauge, GREEN, ACCENT, MUTED
from ..state import engine, history, llm_text
from ...config import RetrievalConfig

MODES = {"Plain English": "Explain in plain, simple English for a non-lawyer, as if talking to a friend. Short sentences. Keep citations.",
         "Formal legal memo": "Write as a formal legal memorandum: Issue, Rule (with citations), Application, Conclusion.",
         "Law student": "Explain like a law professor: define terms, give the statutory text, note leading cases if present in passages.",
         "One-line answer": "Answer in at most two sentences with citations."}


def render():
    eng = engine()
    hero("COUNSEL", "Conversational legal research. Answers are generated only from the retrieved passages shown beneath each reply, with bracketed citations you can verify.", "GROUNDED GENERATION · CITATION GUARD ON")
    with st.sidebar:
        st.markdown("### ⚙️ Retrieval")
        scope = st.radio("Scope", ["All sources", "Statutes only", "Case law only"], horizontal=False)
        use_faiss = st.toggle("Dense (FAISS)", True); use_bm25 = st.toggle("Lexical (BM25)", True); use_kg = st.toggle("Knowledge graph", True); use_rer = st.toggle("Reranker", True)
        final_k = st.slider("Passages to model", 3, 10, 5)
        st.markdown("### 🗣 Style")
        mode = st.selectbox("Answer style", list(MODES))
        translate = st.selectbox("Also translate to", ["—", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi", "Bengali"])
        if st.button("🧹 Clear conversation", use_container_width=True):
            st.session_state.chat = []; st.rerun()
    cfg = RetrievalConfig(use_faiss=use_faiss, use_bm25=use_bm25, use_kg=use_kg, use_reranker=use_rer, final_k=final_k,
                          doc_types={"All sources": (), "Statutes only": ("statute",), "Case law only": ("case",)}[scope])
    chat = history()
    for i, m in enumerate(chat):
        with st.chat_message(m["role"], avatar="⚖️" if m["role"] == "assistant" else "🧑"):
            st.markdown(m["content"])
            if m.get("sources"):
                _sources(m, f"h{i}")
    q = st.chat_input("Ask a legal question…") or st.session_state.pop("pending_query", None)
    if q:
        chat.append({"role": "user", "content": q})
        with st.chat_message("user", avatar="🧑"):
            st.markdown(q)
        with st.chat_message("assistant", avatar="⚖️"):
            ph = st.empty(); ph.markdown('<div class="ll-mono"><span class="ll-pulse"></span>retrieving provisions · fusing · reranking…</div>', unsafe_allow_html=True)
            t = time.time()
            prior = [m for m in chat[:-1] if m["role"] in ("user", "assistant")][-6:]
            convo = "\n".join(f"{'User' if m['role']=='user' else 'LawLine'}: {m['content'][:700]}" for m in prior)
            search_q = q
            if prior:   # rewrite follow-ups into a standalone search query so retrieval keeps the thread
                rw = llm_text("Rewrite the user's latest message as ONE standalone legal research question about Indian law, resolving pronouns and references "
                              "using the conversation. Output only the question.", f"Conversation:\n{convo}\n\nLatest message: {q}", 120)
                if rw and len(rw) < 400 and "error" not in rw.lower()[:20]:
                    search_q = rw.strip().strip('"')
            rr = eng.retriever.retrieve(search_q, cfg)
            ph.markdown('<div class="ll-mono"><span class="ll-pulse"></span>drafting answer…</div>', unsafe_allow_html=True)
            from ...generation.prompts import format_context
            eng_sys = ("You are LawLine AI, a friendly legal research assistant for Indian law talking to an ordinary person.\n"
                       "1. Answer the user's ACTUAL question directly in the first sentence (yes/no/it depends + why), then explain simply.\n"
                       "2. Base legal claims on the numbered passages and cite them like [2]. If the passages only partly cover it, answer the rest from "
                       "well-established general knowledge of Indian law and mark that part '(general note)'. Never refuse just because a passage is missing.\n"
                       "3. If the user says they did not understand, re-explain the same point with a concrete everyday example; do not repeat the earlier wording.\n"
                       "4. Use the conversation so far to understand what 'this', 'it', 'that' refer to.\n"
                       "5. Plain words, short paragraphs or bullets, no legalese unless asked. End with one short line: 'This is information, not legal advice.'\n"
                       "Style instruction: " + MODES[mode])
            user_msg = (f"Conversation so far:\n{convo}\n\n" if convo else "") + f"Passages:\n{format_context(rr.passages)}\n\nUser's latest question: {q}\n(Search query used: {search_q})\n\nAnswer:"
            text = llm_text(eng_sys, user_msg, 900) if rr.passages else llm_text(eng_sys, (f"Conversation so far:\n{convo}\n\n" if convo else "") + f"No passages were retrieved. User's question: {q}", 700)
            cited = sorted({int(n) for grp in re.findall(r"\[((?:\d+\s*,\s*)*\d+)\]", text) for n in re.split(r"\s*,\s*", grp)})
            ph.markdown(text)
            extra = ""
            if translate != "—":
                extra = llm_text(f"Translate the following legal answer faithfully into {translate}. Keep citation markers like [1].", text, 900)
                st.markdown(f"**{translate}:**  \n{extra}")
            msg = {"role": "assistant", "content": text + (f"\n\n**{translate}:**  \n{extra}" if extra else ""),
                   "sources": [{"n": p.rank, "citation": p.chunk.citation, "text": p.chunk.text, "sources": p.sources, "score": p.score, "used": p.rank in cited, "doc_id": p.chunk.doc_id} for p in rr.passages],
                   "timings": {**rr.timings_ms, "total": (time.time() - t) * 1000}, "query": q, "search_query": search_q}
            chat.append(msg); _sources(msg, f"n{len(chat)}")
            fu = llm_text("Suggest three short follow-up questions a user might ask next about Indian law given this exchange. Return them as a JSON list of strings only.",
                          f"Q: {q}\nA: {text[:1200]}", 200)
            try:
                sug = json.loads(re.search(r"\[.*\]", fu, re.S).group(0))[:3]
            except Exception:
                sug = []
            if sug:
                st.markdown("**Follow-ups**"); cols = st.columns(len(sug))
                for i, s in enumerate(sug):
                    if cols[i].button(s, key=f"fu_{len(chat)}_{i}"):
                        st.session_state["pending_query"] = s; st.rerun()
    if chat:
        transcript = "\n\n".join(f"**{m['role'].upper()}**: {m['content']}" for m in chat)
        st.download_button("⬇️ Download transcript", transcript.encode(), "lawline_transcript.md", use_container_width=False)


def _sources(m, key="k"):
    srcs = m["sources"]; t = m.get("timings", {})
    c1, c2 = st.columns([2, 1])
    with c1:
        with st.expander(f"📚 {len(srcs)} retrieved passages · {sum(s['used'] for s in srcs)} cited" + (f" · searched: “{m['search_query'][:80]}”" if m.get("search_query") and m.get("search_query") != m.get("query") else ""), expanded=False):
            for s in srcs:
                st.markdown(f'<div class="ll-src {"used" if s["used"] else ""}"><b>[{s["n"]}] {s["citation"]}</b> {"✅" if s["used"] else ""} &nbsp;{badges(s["sources"])}'
                            f'<div class="ll-mono">relevance {s["score"]:.3f} · {s["doc_id"]}</div><div style="margin-top:6px">{s["text"][:700]}{"…" if len(s["text"]) > 700 else ""}</div></div>', unsafe_allow_html=True)
    with c2:
        conf = min(1.0, 0.35 + 0.13 * sum(s["used"] for s in srcs) + (0.2 if any(s["sources"] and "kg" in s["sources"] for s in srcs if s["used"]) else 0))
        st.plotly_chart(gauge(conf, "Grounding confidence", 1.0, "", GREEN if conf > .7 else ACCENT, 150), use_container_width=True, config={"displayModeBar": False}, key=f"gauge_{key}")
        if t:
            stages = [(k, v) for k, v in t.items() if k in ("embed", "faiss", "bm25", "kg", "rerank") and v]
            fig = go.Figure(go.Bar(x=[v for _, v in stages], y=[k for k, _ in stages], orientation="h", marker_color=ACCENT))
            fig.update_layout(height=150, margin=dict(l=0, r=0, t=0, b=0), xaxis_title="ms"); st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False}, key=f"lat_{key}")
