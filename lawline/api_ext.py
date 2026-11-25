"""Extra API routes for the React front-end (stats, conversational chat, retrieval trace, knowledge graph, provisions,
analytics data, document analysis, drafting). Mounted onto lawline.api.app."""
from __future__ import annotations
import json, logging, re, time, io
from typing import Literal
from functools import lru_cache
from pathlib import Path
import numpy as np, pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel, Field, field_validator
from .config import RetrievalConfig, RESULTS_DIR, DATA_PROCESSED, MODEL_DIR, CORPUS_VERSION
from .generation.prompts import format_context
from .index.concepts import CONCEPTS
from .data.ingest import slug
from .data.schema import corpus_group, CORPUS_GROUPS
from .ratelimit import llm_budget

router = APIRouter()
LIMITED = [Depends(llm_budget)]
NO_LLM = "LLM backend not configured."
DocType = Literal["statute", "case"]


def eng():
    from .api import get_engine
    return get_engine()


def llm_full(system: str, user: str, max_tokens: int = 900, json_mode: str | dict | None = None) -> tuple[str, str | None]:
    """(text, model that produced it); the model is None when no backend is configured."""
    e = eng()
    if not e.llm or not e.llm.available:
        return NO_LLM, None
    try:
        r = e.llm.complete(system, user, max_tokens=max_tokens, json_mode=json_mode)
    except RuntimeError as err:
        logging.getLogger("lawline").warning("language model call failed: %.400s", err)
        raise HTTPException(503, "The language model is temporarily unavailable. Please try again shortly.")
    return r.text, r.model


def llm(system: str, user: str, max_tokens: int = 900, json_mode: str | dict | None = None) -> str:
    return llm_full(system, user, max_tokens, json_mode)[0]


def _json(p: Path):
    return json.load(open(p)) if p.exists() else None


def _csv(p: Path):
    return pd.read_csv(p).replace({np.nan: None}).to_dict(orient="records") if p.exists() else []


# ----------------------------------------------------------------------------------------------- stats
@lru_cache(maxsize=1)
def _corpus_counts() -> dict:
    """Document counts taken from the chunks in memory, so the numbers shown always describe the corpus being
    served (a host can hold older assets than the repository's corpus_stats.json describes)."""
    groups, types = {}, {}
    for c in eng().retriever.chunks:
        if c.doc_id not in types:
            types[c.doc_id] = c.doc_type
            g = corpus_group(c.source, c.act); groups[g] = groups.get(g, 0) + 1
    out = {g: groups[g] for g in CORPUS_GROUPS if groups.get(g)}
    out.update({"total": len(types), "statutes": sum(t == "statute" for t in types.values()), "cases": sum(t == "case" for t in types.values())})
    built = _json(DATA_PROCESSED / "corpus_stats.json") or {}
    out.update({k: built[k] for k in ("hanno_train_rows", "hanno_test_rows") if k in built})
    return out


@router.get("/stats")
def stats():
    r = eng().retriever
    return {"corpus": _corpus_counts(), "gold": _json(DATA_PROCESSED / "gold_stats.json"), "kg": r.kg.stats(),
            "answer_eval": _json(RESULTS_DIR / "answer_eval/summary.json"), "chunks": len(r.chunks), "index_sizes": getattr(r, "index_sizes", None), "corpus_version": CORPUS_VERSION}


# ----------------------------------------------------------------------------------------------- chat
class Turn(BaseModel):
    role: str = Field(..., max_length=20)
    content: str = Field(..., max_length=20000)


class ChatIn(BaseModel):
    message: str = Field(..., min_length=2, max_length=4000)
    history: list[Turn] = []
    style: str = Field("Plain English", max_length=40)
    # a language name goes into the system prompt, so only letters, spaces and ( ) + - are allowed
    translate: str | None = Field(None, max_length=40, pattern=r"^[A-Za-z][A-Za-z ()+-]*$")
    doc_types: list[DocType] = Field([], max_length=2)
    final_k: int = Field(5, ge=1, le=10)
    use_reranker: bool = True

    @field_validator("history", mode="before")
    @classmethod
    def _last_turns(cls, v):                 # only the last six turns are used, so only those are validated
        return v[-6:] if isinstance(v, list) else v


STYLES = {"Plain English": "Explain in plain, simple English for a non-lawyer. Short sentences.",
          "Formal legal memo": "Write as a formal memorandum: Issue, Rule (with citations), Application, Conclusion.",
          "Law student": "Explain like a law professor: define terms, quote the provision, note cases if present.",
          "One-line answer": "Answer in at most two sentences with citations."}
CHAT_SYS = ("You are LawLine AI, a friendly legal research assistant for Indian law talking to an ordinary person.\n"
            "1. Answer the user's ACTUAL question directly in the first sentence (yes/no/it depends + why), then explain simply.\n"
            "2. Base legal claims on the numbered passages and cite them like [2]. If the passages only partly cover it, answer the rest from "
            "well-established general knowledge of Indian law and mark that part '(general note)'. Never refuse just because a passage is missing.\n"
            "   When a passage is a court judgment, name the case the first time you rely on it, for example 'the Supreme Court held in Lalita Kumari [2] that ...'.\n"
            "3. If the user says they did not understand, re-explain with a concrete everyday example; do not repeat the earlier wording.\n"
            "4. Use the conversation so far to resolve 'this', 'it', 'that'.\n"
            "5. Plain words, short paragraphs or bullets. End with one short line: 'This is information, not legal advice.'\n")


@router.post("/chat", dependencies=LIMITED)
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
    cfg = RetrievalConfig(final_k=q.final_k, use_reranker=q.use_reranker, doc_types=tuple(sorted(set(q.doc_types))))
    rr = e.retriever.retrieve(search_q, cfg)
    sys_ = CHAT_SYS + "Style instruction: " + STYLES.get(q.style, STYLES["Plain English"])
    user = (f"Conversation so far:\n{convo}\n\n" if convo else "") + f"Passages:\n{format_context(rr.passages)}\n\nUser's latest question: {q.message}\n(Search query used: {search_q})\n\nAnswer:"
    text, model = llm_full(sys_, user, 900) if rr.passages else llm_full(sys_, f"No passages were retrieved. User's question: {q.message}", 600)
    cited = sorted({int(n) for grp in re.findall(r"\[((?:\d+\s*,\s*)*\d+)\]", text) for n in re.split(r"\s*,\s*", grp)})
    try:                                     # the answer is already written; a failed extra step should not discard it
        translated = llm(f"Translate the following legal answer faithfully into {q.translate}. Keep citation markers like [1].", text, 900) if q.translate else None
    except HTTPException:
        translated = None
    try:
        fu = llm("Suggest three short follow-up questions a user might ask next about Indian law given this exchange. Return a JSON list of strings only.", f"Q: {q.message}\nA: {text[:1200]}", 200)
        followups = json.loads(re.search(r"\[.*\]", fu, re.S).group(0))[:3]
    except Exception:
        followups = []
    return {"answer": text, "translated": translated, "search_query": search_q, "followups": followups,
            "passages": [{"rank": p.rank, "citation": p.chunk.citation, "text": p.chunk.text, "sources": p.sources, "score": p.score, "doc_id": p.chunk.doc_id, "used": p.rank in cited} for p in rr.passages],
            "timings_ms": {**rr.timings_ms, "total": (time.perf_counter() - t0) * 1000}, "model": model}


# ----------------------------------------------------------------------------------------------- retrieval trace
class TraceIn(BaseModel):
    question: str = Field(..., min_length=2, max_length=4000)
    top_k_each: int = Field(30, ge=5, le=50)
    final_k: int = Field(5, ge=1, le=10)
    doc_types: list[DocType] = Field([], max_length=2)
    auto_route: bool = True


@router.post("/retrieve/trace")
def trace(q: TraceIn):
    e = eng(); by = e.retriever.by_id
    rr = e.retriever.retrieve(q.question, RetrievalConfig(top_k_each=q.top_k_each, final_k=q.final_k, doc_types=tuple(sorted(set(q.doc_types))), auto_route=q.auto_route))
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
def kg_search(q: str = Query(..., max_length=200), limit: int = Query(20, ge=1, le=50)):
    G = eng().retriever.kg.g; ql = q.lower(); out = []
    for n, d in G.nodes(data=True):
        lab = d.get("label", "")
        if ql in lab.lower():
            out.append({"id": n, "label": lab, "kind": d.get("kind"), "degree": G.degree(n)})
            if len(out) >= limit:
                break
    return out


def _neighbourhood(G, node: str, hops: int, max_nodes: int) -> list[str]:
    """Breadth-first, in the graph's own order: the nearest nodes are kept when the limit cuts, and the same request
    always returns the same nodes (a set would be cut in hash order, which changes with every restart)."""
    order, seen, frontier = [node], {node}, [node]
    for _ in range(hops):
        nxt = []
        for n in frontier:
            for m in (*G.successors(n), *G.predecessors(n)):
                if m not in seen:
                    seen.add(m); nxt.append(m)
        order += nxt; frontier = nxt
        if len(order) >= max_nodes:
            break
    return order[:max_nodes]


@router.get("/kg/neighborhood")
def kg_neighborhood(node: str = Query(..., max_length=500), hops: int = Query(1, ge=1, le=2), max_nodes: int = Query(60, ge=1, le=200)):
    import networkx as nx
    G = eng().retriever.kg.g
    if node not in G:
        raise HTTPException(404, "node not found")
    nodes = _neighbourhood(G, node, hops, max_nodes); keep = set(nodes)
    H = nx.DiGraph(); H.add_nodes_from(nodes)       # built in breadth-first order (a subgraph view iterates in hash order), so the layout repeats
    H.add_edges_from((u, v, {"rel": d.get("rel")}) for u in nodes for v, d in G[u].items() if v in keep)
    pos = nx.spring_layout(H, seed=3, k=0.9 / max(1, np.sqrt(len(nodes))))
    return {"nodes": [{"id": n, "label": G.nodes[n].get("label", n), "kind": G.nodes[n].get("kind"), "degree": G.degree(n), "x": float(pos[n][0]), "y": float(pos[n][1]), "doc_id": G.nodes[n].get("doc_id")} for n in nodes],
            "edges": [{"source": u, "target": v, "rel": d["rel"]} for u, v, d in H.edges(data=True)]}


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
    def version(results: Path, corpus_stats: Path):          # the headline artefacts of one corpus version
        return {"ablation_ft": _csv(results / "ablation_ft/metrics.csv"), "landmark": (_json(results / "landmark_eval.json") or {}).get("summary"),
                "corpus": _json(corpus_stats)}
    prev = RESULTS_DIR / "v1"                                # results archived before the corpus expansion
    versions = {"v1": version(prev, prev / "corpus_stats.json"), "v2": version(RESULTS_DIR, DATA_PROCESSED / "corpus_stats.json"),
                # v2 again, with every query restricted to the document type of its answer: what a perfect statute/judgment router would score
                "v2_right_type": _csv(RESULTS_DIR / "v2_right_type/ablation_ft/metrics.csv")} if prev.exists() else None
    def on(meta: Path):                                      # the corpus version a stored result was measured on
        return (_json(meta) or {}).get("corpus", CORPUS_VERSION)
    measured = {"answer_eval": on(RESULTS_DIR / "answer_eval/summary.json"), "chunk_sweep": on(RESULTS_DIR / "chunk_sweep_meta.json"),
                "reranker_legal": on(RESULTS_DIR / "ablation_ft_legalce/meta.json")}
    return {"corpus_version": CORPUS_VERSION, "measured_on": measured, "corpus_versions": versions, "ablation_base": _csv(RESULTS_DIR / "ablation_base/metrics.csv"), "ablation_ft": _csv(RESULTS_DIR / "ablation_ft/metrics.csv"),
            "ablation_ft_legalce": _csv(RESULTS_DIR / "ablation_ft_legalce/metrics.csv"), "chunk_sweep": _csv(RESULTS_DIR / "chunk_sweep.csv"),
            "latency": _json(RESULTS_DIR / "ablation_ft/latency.json"), "answer_eval": _json(RESULTS_DIR / "answer_eval/summary.json"),
            "grounded": _csv(RESULTS_DIR / "answer_eval/grounded.csv"), "train_biencoder": tm("lawline-bge-small-legal"), "train_reranker": tm("lawline-reranker-legal")}


# ----------------------------------------------------------------------------------------------- analyzer / drafting
class TextIn(BaseModel):
    text: str = Field(..., min_length=20, max_length=60000)
    brief: bool = False


@router.post("/analyze", dependencies=LIMITED)
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


MAX_UPLOAD = 10 * 1024 * 1024


@router.post("/analyze/upload", dependencies=LIMITED)
def analyze_upload(file: UploadFile = File(...), brief: bool = False):     # sync, so parsing and the model call run off the event loop
    data = file.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "file too large (10 MB limit)")
    if (file.filename or "").lower().endswith(".pdf"):
        try:
            from pypdf import PdfReader
        except ImportError:
            raise HTTPException(501, "PDF support is not installed on this server")
        try:
            text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages[:30])
        except Exception:
            raise HTTPException(400, "could not read that PDF")
    else:
        text = data.decode(errors="ignore")
    text = text.strip()
    if len(text) < 20:
        raise HTTPException(400, "no readable text found in the file (scanned PDFs need OCR)")
    out = analyze(TextIn(text=text[:60000], brief=brief))
    out["text"] = text[:60000]            # the Judgment Summarizer uploads a PDF only to read its text back
    return out


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
    template: str = Field(..., max_length=40)
    fields: dict[str, str] = Field(..., max_length=20)
    # tone and language go into the system prompt
    tone: str = Field("Standard", max_length=40, pattern=r"^[\w /+().,&-]+$")
    language: str = Field("English", max_length=40, pattern=r"^[\w /+().,&-]+$")

    @field_validator("fields")
    @classmethod
    def _bounded(cls, v):
        if any(len(k) > 100 or len(x) > 10000 for k, x in v.items()):
            raise ValueError("field names are limited to 100 characters and values to 10000")
        return v


@router.post("/draft", dependencies=LIMITED)
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
