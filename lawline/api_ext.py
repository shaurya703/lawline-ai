"""Extra API routes for the React front-end (stats, conversational chat, retrieval trace, knowledge graph, provisions,
analytics data, document analysis, drafting). Mounted onto lawline.api.app."""
from __future__ import annotations
import json, re, time, io
from functools import lru_cache
from pathlib import Path
import numpy as np, pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from .config import RetrievalConfig, RESULTS_DIR, DATA_PROCESSED, MODEL_DIR
from .generation.prompts import format_context
from .index.concepts import CONCEPTS
from .data.ingest import slug

router = APIRouter()


def eng():
    from .api import get_engine
    return get_engine()


def llm(system: str, user: str, max_tokens: int = 900) -> str:
    e = eng()
    if not e.llm or not e.llm.available:
        return "LLM backend not configured."
    e.llm.max_tokens = max_tokens
    return e.llm.complete(system, user).text


def _json(p: Path):
    return json.load(open(p)) if p.exists() else None


def _csv(p: Path):
    return pd.read_csv(p).replace({np.nan: None}).to_dict(orient="records") if p.exists() else []


# ----------------------------------------------------------------------------------------------- stats
@router.get("/stats")
def stats():
    kg = eng().retriever.kg
    return {"corpus": _json(DATA_PROCESSED / "corpus_stats.json"), "gold": _json(DATA_PROCESSED / "gold_stats.json"), "kg": kg.stats(),
            "answer_eval": _json(RESULTS_DIR / "answer_eval/summary.json"), "chunks": len(eng().retriever.chunks)}


# ----------------------------------------------------------------------------------------------- chat
class Turn(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    message: str = Field(..., min_length=2, max_length=4000)
    history: list[Turn] = []
    style: str = "Plain English"
    translate: str | None = None
    doc_types: list[str] = []
    final_k: int = Field(5, ge=1, le=10)
    use_reranker: bool = True


STYLES = {"Plain English": "Explain in plain, simple English for a non-lawyer. Short sentences.",
          "Formal legal memo": "Write as a formal memorandum: Issue, Rule (with citations), Application, Conclusion.",
          "Law student": "Explain like a law professor: define terms, quote the provision, note cases if present.",
          "One-line answer": "Answer in at most two sentences with citations."}
CHAT_SYS = ("You are LawLine AI, a friendly legal research assistant for Indian law talking to an ordinary person.\n"
            "1. Answer the user's ACTUAL question directly in the first sentence (yes/no/it depends + why), then explain simply.\n"
            "2. Base legal claims on the numbered passages and cite them like [2]. If the passages only partly cover it, answer the rest from "
            "well-established general knowledge of Indian law and mark that part '(general note)'. Never refuse just because a passage is missing.\n"
            "3. If the user says they did not understand, re-explain with a concrete everyday example; do not repeat the earlier wording.\n"
            "4. Use the conversation so far to resolve 'this', 'it', 'that'.\n"
            "5. Plain words, short paragraphs or bullets. End with one short line: 'This is information, not legal advice.'\n")


@router.post("/chat")
def chat(q: ChatIn):
    e = eng(); t0 = time.perf_counter()
    prior = q.history[-6:]
    convo = "\n".join(f"{'User' if m.role == 'user' else 'LawLine'}: {m.content[:700]}" for m in prior)
    search_q = q.message
    if prior:
        rw = llm("Rewrite the user's latest message as ONE standalone legal research question about Indian law, resolving pronouns and references using the conversation. Output only the question.",
                 f"Conversation:\n{convo}\n\nLatest message: {q.message}", 120)
        if rw and len(rw) < 400:
            search_q = rw.strip().strip('"')
    cfg = RetrievalConfig(final_k=q.final_k, use_reranker=q.use_reranker, doc_types=tuple(q.doc_types))
    rr = e.retriever.retrieve(search_q, cfg)
    sys_ = CHAT_SYS + "Style instruction: " + STYLES.get(q.style, STYLES["Plain English"])
    user = (f"Conversation so far:\n{convo}\n\n" if convo else "") + f"Passages:\n{format_context(rr.passages)}\n\nUser's latest question: {q.message}\n(Search query used: {search_q})\n\nAnswer:"
    text = llm(sys_, user, 900) if rr.passages else llm(sys_, f"No passages were retrieved. User's question: {q.message}", 600)
    cited = sorted({int(n) for grp in re.findall(r"\[((?:\d+\s*,\s*)*\d+)\]", text) for n in re.split(r"\s*,\s*", grp)})
    translated = llm(f"Translate the following legal answer faithfully into {q.translate}. Keep citation markers like [1].", text, 900) if q.translate else None
    fu = llm("Suggest three short follow-up questions a user might ask next about Indian law given this exchange. Return a JSON list of strings only.", f"Q: {q.message}\nA: {text[:1200]}", 200)
    try:
        followups = json.loads(re.search(r"\[.*\]", fu, re.S).group(0))[:3]
    except Exception:
        followups = []
    return {"answer": text, "translated": translated, "search_query": search_q, "followups": followups,
            "passages": [{"rank": p.rank, "citation": p.chunk.citation, "text": p.chunk.text, "sources": p.sources, "score": p.score, "doc_id": p.chunk.doc_id, "used": p.rank in cited} for p in rr.passages],
            "timings_ms": {**rr.timings_ms, "total": (time.perf_counter() - t0) * 1000}, "model": e.llm.gemini_model if e.llm else None}


# ----------------------------------------------------------------------------------------------- retrieval trace
class TraceIn(BaseModel):
    question: str = Field(..., min_length=2)
    top_k_each: int = Field(30, ge=5, le=50)
    final_k: int = Field(5, ge=1, le=10)
    doc_types: list[str] = []
    auto_route: bool = True


@router.post("/retrieve/trace")
def trace(q: TraceIn):
    e = eng(); by = e.retriever.by_id
    rr = e.retriever.retrieve(q.question, RetrievalConfig(top_k_each=q.top_k_each, final_k=q.final_k, doc_types=tuple(q.doc_types), auto_route=q.auto_route))
    def lst(ids):
        return [{"chunk_id": c, "citation": by[c].citation, "doc_type": by[c].doc_type} for c in ids if c in by]
    return {"route": "narrative" if rr.timings_ms.get("route") else "question", "mentions": e.retriever.kg.extract_mentions(q.question),
            "per_retriever": {k: lst(v[:15]) for k, v in rr.per_retriever.items()}, "fused": lst(rr.fused[:15]),
            "final": [{"rank": p.rank, "chunk_id": p.chunk.chunk_id, "citation": p.chunk.citation, "score": p.score, "sources": p.sources, "text": p.chunk.text[:600]} for p in rr.passages],
            "timings_ms": rr.timings_ms}


# ----------------------------------------------------------------------------------------------- knowledge graph
@router.get("/kg/concepts")
def kg_concepts():
    rows = []
    for phrase, provs in CONCEPTS.items():
        rows.append({"concept": phrase, "provisions": [{"act": a, "section": s} for a, s in provs],
                     "ipc": [s for a, s in provs if a.startswith("Indian Penal")], "bns": [s for a, s in provs if a.startswith("Bharatiya Nyaya")]})
    return rows


@router.get("/kg/search")
def kg_search(q: str, limit: int = 20):
    G = eng().retriever.kg.g; ql = q.lower(); out = []
    for n, d in G.nodes(data=True):
        lab = d.get("label", "")
        if ql in lab.lower():
            out.append({"id": n, "label": lab, "kind": d.get("kind"), "degree": G.degree(n)})
            if len(out) >= limit:
                break
    return out


@router.get("/kg/neighborhood")
def kg_neighborhood(node: str, hops: int = 1, max_nodes: int = 60):
    import networkx as nx
    G = eng().retriever.kg.g
    if node not in G:
        raise HTTPException(404, "node not found")
    nodes = {node}; frontier = {node}
    for _ in range(max(1, min(hops, 2))):
        nxt = set()
        for n in frontier:
            nxt |= set(G.successors(n)) | set(G.predecessors(n))
        nodes |= nxt; frontier = nxt
        if len(nodes) > max_nodes:
            break
    nodes = [node] + [n for n in nodes if n != node][: max_nodes - 1]
    H = G.subgraph(nodes); pos = nx.spring_layout(H, seed=3, k=0.9 / max(1, np.sqrt(len(nodes))))
    return {"nodes": [{"id": n, "label": H.nodes[n].get("label", n), "kind": H.nodes[n].get("kind"), "degree": G.degree(n), "x": float(pos[n][0]), "y": float(pos[n][1]), "doc_id": H.nodes[n].get("doc_id")} for n in H],
            "edges": [{"source": u, "target": v, "rel": d.get("rel")} for u, v, d in H.edges(data=True)]}


# ----------------------------------------------------------------------------------------------- provisions
@lru_cache(maxsize=1)
def _statutes():
    rows = {}
    for c in eng().retriever.chunks:
        if c.doc_type == "statute" and c.position == 0:
            rows[c.doc_id] = {"act": c.act, "section": c.section, "title": c.title.split(" — ")[0][:120], "doc_id": c.doc_id, "text": c.text, "year": c.year}
    df = pd.DataFrame(rows.values())
    def key(s):
        m = re.match(r"(\d+)([A-Za-z]*)", str(s)); return (int(m.group(1)), m.group(2)) if m else (10**6, str(s))
    return {a: g.assign(_k=g.section.map(key)).sort_values("_k").drop(columns="_k").reset_index(drop=True) for a, g in df.groupby("act")}


@router.get("/acts")
def acts():
    return [{"act": a, "sections": int(len(df)), "year": (int(df.year.iloc[0]) if pd.notna(df.year.iloc[0]) else None)} for a, df in sorted(_statutes().items(), key=lambda kv: -len(kv[1]))]


@router.get("/acts/sections")
def sections(act: str, q: str = ""):
    df = _statutes().get(act)
    if df is None:
        raise HTTPException(404, "unknown act")
    if q:
        df = df[df.title.str.contains(q, case=False, regex=False) | df.text.str.contains(q, case=False, regex=False)]
    return df[["section", "title", "doc_id"]].to_dict(orient="records")


@router.get("/provision")
def provision(doc_id: str):
    e = eng(); G = e.retriever.kg.g
    chunks = sorted([c for c in e.retriever.chunks if c.doc_id == doc_id], key=lambda c: c.position)
    if not chunks:
        raise HTTPException(404, "not found")
    c0 = chunks[0]; node = f"sec:{slug(c0.act)}:{str(c0.section).upper()}" if c0.act else None
    rel = {"cites": [], "refers_to": [], "concepts": []}
    if node and node in G:
        rel["cites"] = [{"id": u, "label": G.nodes[u]["label"], "court": G.nodes[u].get("court"), "year": G.nodes[u].get("year")} for u, _, d in G.in_edges(node, data=True) if d.get("rel") == "CITES"][:100]
        rel["refers_to"] = [G.nodes[v]["label"] for _, v, d in G.out_edges(node, data=True) if d.get("rel") == "REFERS_TO"][:20]
        rel["concepts"] = [G.nodes[u]["label"] for u, _, d in G.in_edges(node, data=True) if d.get("rel") == "GOVERNED_BY"]
    return {"doc_id": doc_id, "act": c0.act, "section": c0.section, "title": c0.title, "citation": c0.citation, "text": " ".join(c.text for c in chunks), **rel}


# ----------------------------------------------------------------------------------------------- analytics
@router.get("/analytics")
def analytics():
    def tm(name):
        return _json(MODEL_DIR / name / "train_meta.json")
    return {"ablation_base": _csv(RESULTS_DIR / "ablation_base/metrics.csv"), "ablation_ft": _csv(RESULTS_DIR / "ablation_ft/metrics.csv"),
            "ablation_ft_legalce": _csv(RESULTS_DIR / "ablation_ft_legalce/metrics.csv"), "chunk_sweep": _csv(RESULTS_DIR / "chunk_sweep.csv"),
            "latency": _json(RESULTS_DIR / "ablation_ft/latency.json"), "answer_eval": _json(RESULTS_DIR / "answer_eval/summary.json"),
            "grounded": _csv(RESULTS_DIR / "answer_eval/grounded.csv"), "train_biencoder": tm("lawline-bge-small-legal"), "train_reranker": tm("lawline-reranker-legal")}


# ----------------------------------------------------------------------------------------------- analyzer / drafting
class TextIn(BaseModel):
    text: str = Field(..., min_length=20, max_length=60000)
    brief: bool = False


@router.post("/analyze")
def analyze(q: TextIn):
    e = eng(); kg = e.retriever.kg; by = e.retriever.by_id; G = kg.g
    m = kg.extract_mentions(q.text)
    prov, seen = [], set()
    for cid, s in kg.retrieve(q.text, 25):
        if cid in by and by[cid].doc_type == "statute" and by[cid].doc_id not in seen:
            seen.add(by[cid].doc_id); prov.append(by[cid])
    rr = e.retriever.retrieve(q.text[:1500], RetrievalConfig(final_k=6))
    out = {"mentions": {**m, "acts": [G.nodes[a]["label"] for a in m["acts"] if a in G]}, "words": len(q.text.split()),
           "provisions": [{"citation": p.citation, "doc_id": p.doc_id, "text": p.text[:1500]} for p in prov[:12]],
           "related": [{"citation": p.chunk.citation, "sources": p.sources, "text": p.chunk.text[:500]} for p in rr.passages]}
    if q.brief:
        ctx = "\n\n".join(f"[{i+1}] ({p.citation})\n{p.text[:900]}" for i, p in enumerate(prov[:8])) + "\n\n" + "\n\n".join(f"[R{i+1}] ({p.chunk.citation})\n{p.chunk.text[:700]}" for i, p in enumerate(rr.passages))
        out["brief"] = llm("You are a legal analyst for Indian law. Using ONLY the provisions and passages given, write a brief with sections: Summary of the document; Provisions invoked (citing [n]); Key legal issues; Possible defences / next steps; Missing information. End with a one-line disclaimer.",
                           f"DOCUMENT:\n{q.text[:6000]}\n\nPROVISIONS AND PASSAGES:\n{ctx}", 1400)
    return out


@router.post("/analyze/upload")
async def analyze_upload(file: UploadFile = File(...), brief: bool = False):
    data = await file.read()
    if file.filename.lower().endswith(".pdf"):
        from pypdf import PdfReader
        text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages[:30])
    else:
        text = data.decode(errors="ignore")
    return analyze(TextIn(text=text[:60000] or "x" * 20, brief=brief))


TEMPLATES = {
    "legal_notice": ("Legal notice (demand / breach)", ["Sender name", "Recipient name", "Subject matter / facts", "Relief demanded", "Deadline (days)"]),
    "fir": ("Police complaint / FIR request", ["Complainant name", "Police station", "Incident facts (who, what, when, where)", "Accused (if known)", "Losses / injuries"]),
    "rti": ("RTI application", ["Applicant name & address", "Public authority", "Information sought", "Period"]),
    "consumer": ("Consumer complaint", ["Consumer name", "Opposite party", "Product / service & date", "Deficiency / defect", "Relief sought"]),
    "bail": ("Anticipatory bail application (outline)", ["Applicant name", "Court", "FIR / case details", "Sections alleged", "Grounds for bail"]),
    "memo": ("Legal research memo", ["Client / matter", "Question presented", "Facts", "Jurisdiction notes"]),
    "cheque": ("Cheque dishonour notice (s.138 NI Act)", ["Payee name", "Drawer name", "Cheque no., date, amount, bank", "Date of return memo & reason", "Demand period"]),
}


@router.get("/draft/templates")
def templates():
    return [{"id": k, "name": v[0], "fields": v[1]} for k, v in TEMPLATES.items()]


class DraftIn(BaseModel):
    template: str
    fields: dict[str, str]
    tone: str = "Standard"
    language: str = "English"


@router.post("/draft")
def draft(q: DraftIn):
    if q.template not in TEMPLATES:
        raise HTTPException(404, "unknown template")
    name = TEMPLATES[q.template][0]; e = eng()
    facts = " ".join(v for v in q.fields.values() if v)
    rr = e.retriever.retrieve(f"{name}: {facts}"[:1500], RetrievalConfig(final_k=6, doc_types=("statute",)))
    ctx = "\n\n".join(f"[{p.rank}] ({p.chunk.citation})\n{p.chunk.text[:800]}" for p in rr.passages)
    text = llm(f"You are an Indian legal drafter. Draft a {name} in {q.language}, tone: {q.tone}. Use ONLY the statutory passages provided for legal references and cite them in brackets [n]. "
               "Use placeholders like [DATE] where facts are missing. Structure with headings; end with a disclaimer that this is a template requiring review by a licensed advocate.",
               "FIELDS:\n" + "\n".join(f"- {k}: {v}" for k, v in q.fields.items()) + f"\n\nSTATUTORY PASSAGES:\n{ctx}", 1600)
    return {"draft": text, "passages": [{"rank": p.rank, "citation": p.chunk.citation, "sources": p.sources, "text": p.chunk.text[:500]} for p in rr.passages]}
