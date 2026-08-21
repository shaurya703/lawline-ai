"""Shared visual theme: dark glass / neon 'command center' look, Plotly template, helpers."""
from __future__ import annotations
import streamlit as st
import plotly.io as pio
import plotly.graph_objects as go

ACCENT = "#00e5ff"; ACCENT2 = "#7c4dff"; GOLD = "#ffd166"; GREEN = "#2ee6a6"; RED = "#ff4d6d"; MUTED = "#8b9bb4"
BG = "#070b14"; PANEL = "rgba(14, 22, 40, 0.72)"; BORDER = "rgba(0, 229, 255, 0.18)"
PALETTE = [ACCENT, ACCENT2, GOLD, GREEN, RED, "#ff9f43", "#48dbfb", "#c8d6e5"]

pio.templates["lawline"] = go.layout.Template(layout=go.Layout(
    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", font=dict(family="Inter, Segoe UI, sans-serif", color="#dfe7f5", size=12),
    colorway=PALETTE, xaxis=dict(gridcolor="rgba(139,155,180,0.12)", zerolinecolor="rgba(139,155,180,0.2)"),
    yaxis=dict(gridcolor="rgba(139,155,180,0.12)", zerolinecolor="rgba(139,155,180,0.2)"), legend=dict(bgcolor="rgba(0,0,0,0)"),
    margin=dict(l=30, r=20, t=50, b=30), hoverlabel=dict(bgcolor="#0e1628", bordercolor=ACCENT, font_color="#dfe7f5")))
pio.templates.default = "lawline"

CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=JetBrains+Mono:wght@400;600&family=Orbitron:wght@500;700&display=swap');
:root {{ --accent:{ACCENT}; --accent2:{ACCENT2}; --gold:{GOLD}; --green:{GREEN}; --red:{RED}; --muted:{MUTED}; }}
.stApp {{ background: radial-gradient(1200px 600px at 10% -10%, rgba(124,77,255,.18), transparent 60%),
                      radial-gradient(900px 500px at 100% 0%, rgba(0,229,255,.14), transparent 55%), {BG}; color:#dfe7f5; font-family:Inter, sans-serif; }}
.stApp::before {{ content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
  background-image: linear-gradient(rgba(0,229,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,.035) 1px, transparent 1px);
  background-size: 42px 42px; mask-image: radial-gradient(ellipse at center, black 40%, transparent 85%); }}
section[data-testid="stSidebar"] {{ background: rgba(8,13,26,.92); border-right:1px solid {BORDER}; }}
section[data-testid="stSidebar"] * {{ color:#dfe7f5; }}
h1,h2,h3 {{ font-family:Orbitron, Inter, sans-serif; letter-spacing:.04em; }}
h1 {{ background:linear-gradient(90deg,{ACCENT},{ACCENT2}); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }}
.ll-hero {{ padding:28px 32px; border-radius:18px; background:{PANEL}; border:1px solid {BORDER}; backdrop-filter: blur(14px);
  box-shadow: 0 0 0 1px rgba(0,229,255,.05), 0 20px 60px rgba(0,0,0,.45), inset 0 0 60px rgba(0,229,255,.04); position:relative; overflow:hidden; }}
.ll-hero::after {{ content:""; position:absolute; top:-40%; right:-10%; width:380px; height:380px; border-radius:50%;
  background: conic-gradient(from 0deg, transparent 0 70%, rgba(0,229,255,.25) 85%, transparent 100%); animation: spin 12s linear infinite; }}
@keyframes spin {{ to {{ transform: rotate(360deg); }} }}
.ll-card {{ padding:18px 20px; border-radius:14px; background:{PANEL}; border:1px solid {BORDER}; backdrop-filter: blur(10px); height:100%; transition: transform .2s, box-shadow .2s; }}
.ll-card:hover {{ transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,229,255,.12); }}
.ll-kpi {{ font-family:Orbitron; font-size:20px; white-space:nowrap; letter-spacing:0; font-weight:700; color:{ACCENT}; text-shadow:0 0 18px rgba(0,229,255,.45); }}
.ll-kpi-label {{ color:{MUTED}; font-size:12px; letter-spacing:.12em; text-transform:uppercase; }}
.ll-badge {{ display:inline-block; padding:2px 10px; border-radius:999px; font-size:11px; font-family:'JetBrains Mono', monospace; margin:2px 3px;
  border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); }}
.ll-badge.faiss {{ border-color:{ACCENT}; color:{ACCENT}; }} .ll-badge.bm25 {{ border-color:{GOLD}; color:{GOLD}; }}
.ll-badge.kg {{ border-color:{ACCENT2}; color:#b39dff; }} .ll-badge.kg-slot {{ border-color:{GREEN}; color:{GREEN}; }}
.ll-src {{ border-left:3px solid {ACCENT}; padding:10px 14px; margin:8px 0; border-radius:8px; background:rgba(0,229,255,.05); font-size:13px; }}
.ll-src.used {{ border-left-color:{GREEN}; background:rgba(46,230,166,.06); }}
.ll-mono {{ font-family:'JetBrains Mono', monospace; font-size:12px; color:{MUTED}; }}
.ll-pulse {{ display:inline-block; width:9px; height:9px; border-radius:50%; background:{GREEN}; box-shadow:0 0 0 0 rgba(46,230,166,.7); animation:pulse 1.6s infinite; margin-right:8px; }}
@keyframes pulse {{ 0%{{box-shadow:0 0 0 0 rgba(46,230,166,.7)}} 70%{{box-shadow:0 0 0 10px rgba(46,230,166,0)}} 100%{{box-shadow:0 0 0 0 rgba(46,230,166,0)}} }}
div[data-testid="stMetric"] {{ background:{PANEL}; border:1px solid {BORDER}; border-radius:12px; padding:12px 16px; }}
div[data-testid="stMetricValue"] {{ font-family:Orbitron; color:{ACCENT}; }}
.stButton>button {{ border-radius:10px; border:1px solid {BORDER}; background:linear-gradient(135deg, rgba(0,229,255,.12), rgba(124,77,255,.12)); color:#dfe7f5; transition:all .2s; }}
.stButton>button:hover {{ border-color:{ACCENT}; box-shadow:0 0 18px rgba(0,229,255,.35); color:white; }}
.stChatMessage {{ background:{PANEL}; border:1px solid {BORDER}; border-radius:14px; }}
div[data-testid="stExpander"] {{ background:{PANEL}; border:1px solid {BORDER}; border-radius:12px; }}
.stTabs [data-baseweb="tab"] {{ font-family:Orbitron; letter-spacing:.05em; }}
code {{ color:{GOLD} !important; }}
#MainMenu, footer {{ visibility:hidden; }}
</style>
"""


def inject():
    st.markdown(CSS, unsafe_allow_html=True)


def hero(title: str, subtitle: str, status: str = "ALL SYSTEMS NOMINAL"):
    st.markdown(f"""<div class="ll-hero"><div class="ll-mono"><span class="ll-pulse"></span>{status}</div>
    <h1 style="margin:6px 0 4px 0;font-size:34px">{title}</h1><div style="color:{MUTED};font-size:15px;max-width:900px">{subtitle}</div></div>""", unsafe_allow_html=True)


def kpi(label: str, value, sub: str = ""):
    st.markdown(f"""<div class="ll-card"><div class="ll-kpi-label">{label}</div><div class="ll-kpi">{value}</div>
    <div class="ll-mono">{sub}</div></div>""", unsafe_allow_html=True)


def badges(sources):
    return "".join(f'<span class="ll-badge {s}">{s.upper()}</span>' for s in sources)


def gauge(value, title, max_value=1.0, suffix="", color=ACCENT, height=180):
    fig = go.Figure(go.Indicator(mode="gauge+number", value=value, number={"suffix": suffix, "font": {"family": "Orbitron", "color": color}},
                                 title={"text": title, "font": {"size": 12, "color": MUTED}},
                                 gauge={"axis": {"range": [0, max_value], "tickcolor": MUTED}, "bar": {"color": color, "thickness": .28},
                                        "bgcolor": "rgba(255,255,255,.03)", "borderwidth": 0,
                                        "steps": [{"range": [0, max_value * .5], "color": "rgba(255,77,109,.08)"}, {"range": [max_value * .5, max_value * .75], "color": "rgba(255,209,102,.08)"},
                                                  {"range": [max_value * .75, max_value], "color": "rgba(46,230,166,.10)"}]}))
    fig.update_layout(height=height, margin=dict(l=10, r=10, t=40, b=0))
    return fig
