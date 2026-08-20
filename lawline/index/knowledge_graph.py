"""Legal knowledge graph (networkx) + entity-based retrieval.

Nodes : act:<slug>, sec:<act-slug>:<num>, case:<doc_id>, topic:<slug>
Edges : act -HAS_SECTION-> sec, sec -REFERS_TO-> sec, case -CITES-> sec, case -CITES_CASE-> case, case -ABOUT-> topic

Retrieval: entity mentions (act aliases, section / article numbers, case names, topics) are extracted from the
query, resolved to nodes, and expanded one hop; each reached node contributes its chunks with a score that
decays with hop distance.
"""
from __future__ import annotations
import pickle, re
from collections import defaultdict
from pathlib import Path
import networkx as nx
from ..data.schema import Document, read_jsonl
from ..data.ingest import slug
from .concepts import CONCEPTS

ALIASES = {
    "Indian Penal Code, 1860": ["ipc", "indian penal code", "penal code"],
    "Code of Criminal Procedure Act, 1973": ["crpc", "cr.p.c", "code of criminal procedure", "criminal procedure code"],
    "Code of Civil Procedure, 1908": ["cpc", "code of civil procedure", "civil procedure code"],
    "Constitution of India, 1949": ["constitution", "constitution of india", "article"],
    "Bharatiya Nyaya Sanhita, 2023": ["bns", "bharatiya nyaya sanhita", "nyaya sanhita"],
    "Bharatiya Nagarik Suraksha Sanhita, 2023": ["bnss", "bharatiya nagarik suraksha sanhita", "nagarik suraksha"],
    "Bharatiya Sakshya Adhiniyam, 2023": ["bsa", "bharatiya sakshya adhiniyam", "sakshya adhiniyam"],
    "Indian Evidence Act, 1872": ["evidence act", "indian evidence act"],
    "Indian Contract Act, 1872": ["contract act", "indian contract act"],
    "Negotiable Instruments Act, 1881": ["ni act", "negotiable instruments act", "negotiable instrument"],
    "Motor Vehicles Act, 1988": ["mv act", "motor vehicles act", "motor vehicle act"],
    "Information Technology Act, 2000": ["it act", "information technology act"],
    "Right to Information Act, 2005": ["rti act", "right to information"],
    "Protection of Children from Sexual Offences Act, 2012": ["pocso"],
    "Narcotic Drugs and Psychotropic Substances Act, 1985": ["ndps"],
    "Arbitration and Conciliation Act, 1996": ["arbitration act", "arbitration and conciliation"],
    "Consumer Protection Act, 2019": ["consumer protection act"],
    "Hindu Marriage Act, 1955": ["hindu marriage act"],
    "Protection of Women from Domestic Violence Act, 2005": ["domestic violence act", "dv act"],
    "Transfer of Property Act, 1882": ["transfer of property act", "tpa"],
    "Companies Act, 2013": ["companies act"],
    "Insolvency and Bankruptcy Code Act, 2016": ["ibc", "insolvency and bankruptcy code"],
    "Prevention of Money-Laundering Act, 2002": ["pmla", "money laundering act"],
    "Unlawful Activities (Prevention) Act, 1967": ["uapa", "unlawful activities"],
    "Limitation Act, 1963": ["limitation act"],
    "Specific Relief Act, 1963": ["specific relief act"],
    "Dowry Prohibition Act, 1961": ["dowry prohibition act"],
    "Juvenile Justice (Care and Protection of Children) Act, 2015": ["juvenile justice act", "jj act"],
    "Scheduled Castes and the Scheduled Tribes (Prevention of Atrocities) Act, 1989": ["sc/st act", "atrocities act"],
    "Income-Tax Act, 1961": ["income tax act", "income-tax act"],
}
SEC_PAT = re.compile(r"\b(?:sections?|sec\.?|s\.|u/s\.?|ss\.)\s*((?:\d+[A-Za-z]{0,2})(?:\s*(?:,|and|&|/)\s*\d+[A-Za-z]{0,2})*)", re.I)
ART_PAT = re.compile(r"\b(?:articles?|art\.?)\s*((?:\d+[A-Za-z]{0,2})(?:\s*(?:,|and|&|/)\s*\d+[A-Za-z]{0,2})*)", re.I)
BARE_SEC = re.compile(r"\b(\d{2,3}[A-Z]{1,2})\b")          # 498A, 304B, 120B ...
_W = r"(?:[A-Z][\w.&'()-]*|of|the|and|for|&)"
CASE_PAT = re.compile(rf"([A-Z][\w.&'()-]*(?:\s+{_W}){{0,5}})\s+(?:v\.|vs\.?|versus)\s+([A-Z][\w.&'()-]*(?:\s+{_W}){{0,6}})")


def _norm_title(t: str) -> str:
    t = re.sub(r"\b(m/s|ltd|limited|ors|anr|others|another|the|state of|union of india|&)\b\.?", " ", t.lower())
    return re.sub(r"[^a-z0-9 ]+", " ", t).split()


class LegalKG:
    def __init__(self):
        self.g = nx.DiGraph()
        self.act_by_alias: dict[str, str] = {}
        self.node_chunks: dict[str, list[str]] = defaultdict(list)
        self.case_title_index: dict[str, str] = {}
        self.topic_index: dict[str, str] = {}
        self.concept_index: dict[str, str] = {}

    # ------------------------------------------------------------------ build
    @classmethod
    def build(cls, corpus_path, chunks) -> "LegalKG":
        kg = cls()
        docs = [Document.from_dict(d) for d in read_jsonl(corpus_path)]
        doc_chunks = defaultdict(list)
        for c in chunks:
            doc_chunks[c.doc_id].append(c.chunk_id)
        acts = set()
        for d in docs:
            if d.doc_type == "statute":
                a, s = f"act:{slug(d.act)}", f"sec:{slug(d.act)}:{d.section.upper()}"
                if a not in kg.g:
                    kg.g.add_node(a, kind="act", label=d.act); acts.add(d.act)
                kg.g.add_node(s, kind="section", label=f"Section {d.section}, {d.act}", doc_id=d.doc_id, title=d.title)
                kg.g.add_edge(a, s, rel="HAS_SECTION")
                kg.node_chunks[s] = doc_chunks[d.doc_id]
        for d in docs:
            if d.doc_type == "statute":
                for r in d.cited_sections:
                    if r.get("act") and r.get("section"):
                        t = f"sec:{slug(r['act'])}:{r['section'].upper()}"
                        if t in kg.g and t != f"sec:{slug(d.act)}:{d.section.upper()}":
                            kg.g.add_edge(f"sec:{slug(d.act)}:{d.section.upper()}", t, rel="REFERS_TO")
            else:
                c = f"case:{d.doc_id}"
                kg.g.add_node(c, kind="case", label=d.title, doc_id=d.doc_id, court=d.court, year=d.year)
                kg.node_chunks[c] = doc_chunks[d.doc_id][:2]
                kg.case_title_index[d.title] = c
                for r in d.cited_sections:
                    if r.get("act") and r.get("section"):
                        t = f"sec:{slug(r['act'])}:{str(r['section']).upper()}"
                        if t in kg.g:
                            kg.g.add_edge(c, t, rel="CITES")
                for t in d.topics:
                    tn = f"topic:{slug(t)}"
                    kg.g.add_node(tn, kind="topic", label=t)
                    kg.g.add_edge(c, tn, rel="ABOUT")
                    kg.topic_index[t.lower()] = tn
        # case -> case citations by title match
        titles = list(kg.case_title_index.items())
        norm = [(set(_norm_title(t)), n) for t, n in titles]
        for d in docs:
            if d.doc_type == "case" and d.cited_cases:
                src = f"case:{d.doc_id}"
                for cited in d.cited_cases:
                    cw = set(_norm_title(cited))
                    if len(cw) < 2:
                        continue
                    for tw, node in norm:
                        if node != src and len(cw & tw) >= max(2, int(0.6 * len(tw))):
                            kg.g.add_edge(src, node, rel="CITES_CASE")
        for act, al in ALIASES.items():
            if act in acts:
                for a in al:
                    kg.act_by_alias[a] = f"act:{slug(act)}"
        for act in acts:  # full act names are aliases of themselves
            kg.act_by_alias[act.lower()] = f"act:{slug(act)}"
        for phrase, provs in CONCEPTS.items():
            cn = f"concept:{slug(phrase)}"
            targets = [f"sec:{slug(a)}:{n.upper()}" for a, n in provs]
            targets = [t for t in targets if t in kg.g]
            if targets:
                kg.g.add_node(cn, kind="concept", label=phrase)
                for t in targets:
                    kg.g.add_edge(cn, t, rel="GOVERNED_BY")
                kg.concept_index[phrase] = cn
        return kg

    # ------------------------------------------------------------------ query
    def extract_mentions(self, query: str) -> dict:
        q = query.lower()
        acts = []
        for alias, node in sorted(self.act_by_alias.items(), key=lambda x: -len(x[0])):
            if alias == "article":
                continue
            if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", q):
                if node not in acts:
                    acts.append(node)
        def nums(m):
            return [x.strip().upper() for x in re.split(r",|and|&|/", m) if x.strip()]
        sections = [n for m in SEC_PAT.findall(query) for n in nums(m)]
        articles = [n for m in ART_PAT.findall(query) for n in nums(m)]
        bare = [b for b in BARE_SEC.findall(query) if b not in sections]
        cases = [f"{a.strip()} v. {b.strip()}" for a, b in CASE_PAT.findall(query)]
        topics = [t for t in self.topic_index if len(t) > 6 and t in q]
        concepts, taken = [], []
        for phrase in sorted(self.concept_index, key=len, reverse=True):
            m = re.search(rf"(?<![a-z]){re.escape(phrase)}(?:s|es)?(?![a-z])", q)
            if m and not any(a <= m.start() < b or a < m.end() <= b for a, b in taken):
                concepts.append(phrase); taken.append((m.start(), m.end()))
        return {"acts": acts, "sections": sections, "articles": articles, "bare": bare, "cases": cases,
                "topics": topics, "concepts": concepts}

    def _sec_nodes(self, act_node: str, num: str) -> list[str]:
        n = f"sec:{act_node[4:]}:{num}"
        return [n] if n in self.g else []

    def retrieve(self, query: str, k: int = 20) -> list[tuple[str, float]]:
        m = self.extract_mentions(query)
        node_scores: dict[str, float] = defaultdict(float)
        const = "act:constitution-of-india-1949"
        default_acts = ["act:indian-penal-code-1860", "act:bharatiya-nyaya-sanhita-2023",
                        "act:code-of-criminal-procedure-act-1973", "act:bharatiya-nagarik-suraksha-sanhita-2023"]
        for num in m["articles"]:
            for n in self._sec_nodes(const, num):
                node_scores[n] = max(node_scores[n], 1.0)
        target_acts = m["acts"] or default_acts
        for num in m["sections"] + m["bare"]:
            for a in target_acts:
                for n in self._sec_nodes(a, num):
                    node_scores[n] = max(node_scores[n], 1.0 if m["acts"] else 0.8)
        # act-only mention: rank its sections by title overlap with the query words
        if m["acts"] and not (m["sections"] or m["bare"] or m["articles"]):
            qw = set(re.findall(r"[a-z]{4,}", query.lower()))
            for a in m["acts"]:
                for _, s in self.g.out_edges(a):
                    lw = set(re.findall(r"[a-z]{4,}", self.g.nodes[s].get("title", self.g.nodes[s].get("label", "")).lower()))
                    cid = self.node_chunks.get(s)
                    if cid:
                        # use first-chunk text title words via label only (cheap)
                        ov = len(qw & lw)
                        if ov:
                            node_scores[s] = max(node_scores[s], 0.3 + 0.1 * ov)
        for phrase in m["concepts"]:
            cn = self.concept_index[phrase]
            for _, sec in self.g.out_edges(cn):
                act_node = "act:" + sec.split(":")[1]
                boost = 0.95 if (not m["acts"] or act_node in m["acts"]) else 0.6
                node_scores[sec] = max(node_scores[sec], boost)
        for cs in m["cases"]:
            cw = set(_norm_title(cs))
            for title, node in self.case_title_index.items():
                tw = set(_norm_title(title))
                if tw and len(cw & tw) >= max(2, int(0.6 * len(tw))):
                    node_scores[node] = max(node_scores[node], 0.9)
        for t in m["topics"]:
            tn = self.topic_index[t]
            for c, _ in self.g.in_edges(tn):
                node_scores[c] = max(node_scores[c], 0.5)
        # one-hop expansion
        expanded = dict(node_scores)
        for n, s in list(node_scores.items()):
            if s < 0.5:
                continue
            for _, nb, data in self.g.out_edges(n, data=True):
                if self.g.nodes[nb].get("kind") in ("section", "case"):
                    expanded[nb] = max(expanded.get(nb, 0), s * 0.5)
            for nb, _, data in self.g.in_edges(n, data=True):
                if data.get("rel") == "CITES" and self.g.nodes[nb].get("kind") == "case":
                    expanded[nb] = max(expanded.get(nb, 0), s * 0.6)
        out: dict[str, float] = {}
        for n, s in sorted(expanded.items(), key=lambda x: -x[1]):
            for cid in self.node_chunks.get(n, []):
                out[cid] = max(out.get(cid, 0), s)
            if len(out) >= k * 3:
                break
        return sorted(out.items(), key=lambda x: -x[1])[:k]

    # ------------------------------------------------------------------ io
    def save(self, path: Path):
        path = Path(path); path.mkdir(parents=True, exist_ok=True)
        with open(path / "kg.pkl", "wb") as f:
            pickle.dump(self.__dict__, f, protocol=pickle.HIGHEST_PROTOCOL)

    @classmethod
    def load(cls, path: Path) -> "LegalKG":
        obj = cls()
        with open(Path(path) / "kg.pkl", "rb") as f:
            obj.__dict__.update(pickle.load(f))
        return obj

    def stats(self) -> dict:
        kinds = defaultdict(int)
        for _, d in self.g.nodes(data=True):
            kinds[d.get("kind")] += 1
        rels = defaultdict(int)
        for _, _, d in self.g.edges(data=True):
            rels[d.get("rel")] += 1
        return {"nodes": dict(kinds), "edges": dict(rels)}
