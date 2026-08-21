import re, io
import streamlit as st, pandas as pd
from ..theme import hero, kpi, badges
from ..state import engine, llm_text
from ...config import RetrievalConfig


def render():
    eng = engine(); kg = eng.retriever.kg
    hero("DOCUMENT ANALYZER", "Paste an FIR, notice, contract clause or judgment extract. LawLine extracts the provisions it mentions, pulls their text, retrieves related law and writes a grounded brief.", "ENTITY EXTRACTION · GROUNDED SUMMARY")
    up = st.file_uploader("Upload PDF / TXT", type=["pdf", "txt", "md"]); text = ""
    if up is not None:
        if up.name.lower().endswith(".pdf"):
            try:
                from pypdf import PdfReader
                text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(up.getvalue())).pages[:30])
            except Exception as e:
                st.error(f"PDF read failed: {e}")
        else:
            text = up.getvalue().decode(errors="ignore")
    text = st.text_area("Document text", text or "", height=220, placeholder="Paste text here… e.g. 'The accused is charged under Sections 420 and 120B IPC and Section 66D of the IT Act…'")
    if not text.strip():
        return
    m = kg.extract_mentions(text); G = kg.g
    c = st.columns(5)
    with c[0]: kpi("Words", f"{len(text.split()):,}")
    with c[1]: kpi("Acts", len(m["acts"]))
    with c[2]: kpi("Sections", len(set(m["sections"] + m["bare"])))
    with c[3]: kpi("Articles", len(set(m["articles"])))
    with c[4]: kpi("Concepts", len(m["concepts"]))
    hits = kg.retrieve(text, 25); by = eng.retriever.by_id
    prov = []
    seen = set()
    for cid, s in hits:
        if cid in by and by[cid].doc_type == "statute" and by[cid].doc_id not in seen:
            seen.add(by[cid].doc_id); prov.append(by[cid])
    st.markdown("#### 📜 Provisions referenced")
    if m["acts"]: st.markdown("**Acts detected:** " + ", ".join(G.nodes[a]["label"] for a in m["acts"] if a in G))
    if m["concepts"]: st.markdown("**Concepts:** " + ", ".join(m["concepts"]))
    for p in prov[:12]:
        with st.expander(p.citation):
            st.write(p.text[:1500])
    st.markdown("#### 🔎 Related law (hybrid retrieval on the document)")
    rr = eng.retriever.retrieve(text[:1500], RetrievalConfig(final_k=6))
    for p in rr.passages:
        st.markdown(f'<div class="ll-src"><b>{p.chunk.citation}</b> {badges(p.sources)}<div style="margin-top:4px">{p.chunk.text[:400]}…</div></div>', unsafe_allow_html=True)
    if st.button("🧠 Generate grounded brief", type="primary"):
        ctx = "\n\n".join(f"[{i+1}] ({p.citation})\n{p.text[:900]}" for i, p in enumerate(prov[:8])) + "\n\n" + "\n\n".join(f"[R{i+1}] ({p.chunk.citation})\n{p.chunk.text[:700]}" for i, p in enumerate(rr.passages))
        brief = llm_text("You are a legal analyst for Indian law. Using ONLY the provisions and passages given, write a brief with sections: Summary of the document; Provisions invoked (with what each provides, citing [n]); "
                         "Key legal issues; Possible defences / next steps; Missing information. Cite passages in brackets. End with a one-line disclaimer.", f"DOCUMENT:\n{text[:6000]}\n\nPROVISIONS AND PASSAGES:\n{ctx}", 1400)
        st.markdown(brief); st.download_button("⬇️ Download brief", brief.encode(), "lawline_brief.md")
