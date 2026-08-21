import streamlit as st
from ..theme import hero, badges
from ..state import engine, llm_text
from ...config import RetrievalConfig

TEMPLATES = {
    "Legal notice (demand / breach)": ["Sender name", "Recipient name", "Subject matter / facts", "Relief demanded", "Deadline (days)"],
    "Police complaint / FIR request": ["Complainant name", "Police station", "Incident facts (who, what, when, where)", "Accused (if known)", "Losses / injuries"],
    "RTI application": ["Applicant name & address", "Public authority", "Information sought", "Period"],
    "Consumer complaint": ["Consumer name", "Opposite party (seller/service provider)", "Product / service & date", "Deficiency / defect", "Relief sought"],
    "Anticipatory bail application (outline)": ["Applicant name", "Court", "FIR / case details", "Sections alleged", "Grounds for bail"],
    "Legal research memo": ["Client / matter", "Question presented", "Facts", "Jurisdiction notes"],
    "Cheque dishonour notice (s.138 NI Act)": ["Payee name", "Drawer name", "Cheque no., date, amount, bank", "Date of return memo & reason", "Demand period"],
}


def render():
    eng = engine()
    hero("DRAFTING STUDIO", "Generate first drafts of notices, complaints, applications and memos, grounded in the provisions LawLine retrieves for your facts. Always review with a lawyer before use.", "GROUNDED DRAFTING")
    kind = st.selectbox("Document type", list(TEMPLATES)); fields = {}
    cols = st.columns(2)
    for i, f in enumerate(TEMPLATES[kind]):
        fields[f] = cols[i % 2].text_area(f, height=70) if "facts" in f.lower() or "grounds" in f.lower() or "information" in f.lower() else cols[i % 2].text_input(f)
    tone = st.select_slider("Tone", ["Plain", "Standard", "Formal / legalese"], "Standard"); lang = st.selectbox("Language", ["English", "Hindi", "English + Hindi"])
    if st.button("✍️ Draft it", type="primary"):
        facts = " ".join(str(v) for v in fields.values() if v)
        rr = eng.retriever.retrieve(f"{kind}: {facts}"[:1500], RetrievalConfig(final_k=6, doc_types=("statute",)))
        ctx = "\n\n".join(f"[{p.rank}] ({p.chunk.citation})\n{p.chunk.text[:800]}" for p in rr.passages)
        st.markdown("**Provisions used:** " + " · ".join(f"[{p.rank}] {p.chunk.citation}" for p in rr.passages))
        draft = llm_text(f"You are an Indian legal drafter. Draft a {kind} in {lang}, tone: {tone}. Use ONLY the statutory passages provided for legal references and cite them in brackets [n]. "
                         "Use placeholders like [DATE] where facts are missing. Structure with headings; end with a disclaimer that this is a template requiring review by a licensed advocate.",
                         f"FIELDS:\n" + "\n".join(f"- {k}: {v}" for k, v in fields.items()) + f"\n\nSTATUTORY PASSAGES:\n{ctx}", 1600)
        st.markdown(draft); st.download_button("⬇️ Download draft", draft.encode(), f"{kind.split(' (')[0].replace(' ', '_').lower()}.md")
        with st.expander("Passages"):
            for p in rr.passages: st.markdown(f'<div class="ll-src"><b>[{p.rank}] {p.chunk.citation}</b> {badges(p.sources)}<div>{p.chunk.text[:500]}…</div></div>', unsafe_allow_html=True)
