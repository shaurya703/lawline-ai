"""LawLine AI — multi-page command-center UI. Run: streamlit run app.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import streamlit as st
from lawline.ui import theme
from lawline.ui.pages import home, counsel, retrieval_lab, kg, explorer, analytics, analyzer, drafting, methodology

st.set_page_config(page_title="LawLine AI", page_icon="⚖️", layout="wide", initial_sidebar_state="expanded")
theme.inject()
PAGES = {
    "Command Center": st.Page(home.render, title="Command Center", icon="🛰", url_path="home", default=True),
    "Counsel": st.Page(counsel.render, title="Counsel", icon="⚖️", url_path="counsel"),
    "Retrieval Lab": st.Page(retrieval_lab.render, title="Retrieval Lab", icon="🧪", url_path="lab"),
    "Knowledge Graph": st.Page(kg.render, title="Knowledge Graph", icon="🕸", url_path="graph"),
    "Provision Explorer": st.Page(explorer.render, title="Provision Explorer", icon="📜", url_path="explore"),
    "Document Analyzer": st.Page(analyzer.render, title="Document Analyzer", icon="🔎", url_path="analyze"),
    "Drafting Studio": st.Page(drafting.render, title="Drafting Studio", icon="✍️", url_path="draft"),
    "Analytics": st.Page(analytics.render, title="Analytics", icon="📊", url_path="analytics"),
    "Methodology": st.Page(methodology.render, title="Methodology", icon="📘", url_path="about"),
}
st.session_state["pages"] = PAGES
nav = st.navigation({"LawLine": [PAGES["Command Center"], PAGES["Counsel"]], "Investigate": [PAGES["Retrieval Lab"], PAGES["Knowledge Graph"], PAGES["Provision Explorer"]],
                     "Work": [PAGES["Document Analyzer"], PAGES["Drafting Studio"]], "Evidence": [PAGES["Analytics"], PAGES["Methodology"]]})
with st.sidebar:
    st.markdown('<div style="font-family:Orbitron;font-size:20px;letter-spacing:.12em;color:#00e5ff;text-shadow:0 0 14px rgba(0,229,255,.5)">⚖️ LAWLINE AI</div><div class="ll-mono">v1.0 · hybrid RAG · Indian law</div>', unsafe_allow_html=True)
    st.markdown("---")
nav.run()
with st.sidebar:
    st.markdown("---"); st.markdown('<div class="ll-mono">Legal information, not legal advice.</div>', unsafe_allow_html=True)
