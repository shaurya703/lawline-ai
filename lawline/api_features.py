"""Feature routes for the LawLine AI React app (v2): code-transition map, judgment summariser, case timeline,
argument arena, offence lookup, provision comparison, plain-language simplifier, glossary, rights guides,
limitation calculator, AIBE trainer and citation verifier. Mounted onto lawline.api.app."""
from __future__ import annotations
import ast, csv, json, re, random
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from .config import RetrievalConfig, DATA_RAW
from .index.concepts import CONCEPTS, IPC, BNS, CRPC, BNSS, IEA, BSA, COI, ICA, NIA, HMA, DVA, CPA, RTI, ITA, MVA, LIM
from .api_ext import eng, llm, _statutes

router = APIRouter()
PAIRS = [(IPC, BNS), (CRPC, BNSS), (IEA, BSA)]
OLD_TO_NEW = dict(PAIRS); NEW_TO_OLD = {n: o for o, n in PAIRS}


def llm_json(system: str, user: str, max_tokens: int = 1200):
    txt = llm(system + "\nReturn ONLY valid JSON, no markdown fences.", user, max_tokens)
    m = re.search(r"[\[{].*[\]}]", txt, re.S)
    if not m:
        raise HTTPException(502, f"model returned no JSON: {txt[:200]}")
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        cleaned = re.sub(r",\s*([\]}])", r"\1", m.group(0))
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            raise HTTPException(502, "model returned malformed JSON")


@lru_cache(maxsize=1)
def _full_text():
    out: dict[str, list] = {}
    for c in eng().retriever.chunks:
        if c.doc_type == "statute":
            out.setdefault(c.doc_id, []).append((c.position, c.text))
    return {k: " ".join(t for _, t in sorted(v)) for k, v in out.items()}


def prov_by(act: str, section: str):
    df = _statutes().get(act)
    if df is None:
        return None
    hit = df[df.section.astype(str).str.upper() == str(section).upper()]
    if hit.empty:
        return None
    r = hit.iloc[0]
    return {"act": act, "section": str(r.section), "title": r.title, "doc_id": r.doc_id, "text": _full_text().get(r.doc_id, r.text)}


def ctx_passages(query: str, k: int = 6, doc_types=()):
    rr = eng().retriever.retrieve(query[:1500], RetrievalConfig(final_k=k, doc_types=tuple(doc_types)))
    ctx = "\n\n".join(f"[{p.rank}] ({p.chunk.citation})\n{p.chunk.text[:800]}" for p in rr.passages)
    plist = [{"rank": p.rank, "citation": p.chunk.citation, "sources": p.sources, "text": p.chunk.text[:500], "doc_id": p.chunk.doc_id, "score": p.score} for p in rr.passages]
    return ctx, plist


# ----------------------------------------------------------------------------------------------- transition map
@lru_cache(maxsize=1)
def transition_table():
    rows = {}
    for concept, provs in CONCEPTS.items():
        for old, new in PAIRS:
            olds = [s for a, s in provs if a == old]; news = [s for a, s in provs if a == new]
            if olds and news:
                for i, o in enumerate(olds):
                    n = news[min(i, len(news) - 1)] if len(news) < len(olds) else news[i] if i < len(news) else news[-1]
                    key = (old, o)
                    r = rows.setdefault(key, {"old_act": old, "old_section": o, "new_act": new, "new_sections": [], "concepts": []})
                    if n not in r["new_sections"]:
                        r["new_sections"].append(n)
                    if concept not in r["concepts"]:
                        r["concepts"].append(concept)
    out = list(rows.values())
    def k(r):
        m = re.match(r"(\d+)([A-Za-z]*)", r["old_section"]); return (r["old_act"], int(m.group(1)) if m else 0, m.group(2) if m else "")
    return sorted(out, key=k)


@router.get("/transition/map")
def transition_map():
    return transition_table()


@router.get("/transition")
def transition(act: str = "IPC", section: str = "302"):
    short = {"IPC": IPC, "BNS": BNS, "CRPC": CRPC, "BNSS": BNSS, "IEA": IEA, "BSA": BSA}
    a = short.get(act.upper().replace(" ", ""), act); s = section.strip().upper()
    tbl = transition_table()
    if a in OLD_TO_NEW:
        hits = [r for r in tbl if r["old_act"] == a and r["old_section"].upper() == s]
        old = prov_by(a, s); news = [prov_by(OLD_TO_NEW[a], n) for h in hits for n in h["new_sections"]]
        concepts = sorted({c for h in hits for c in h["concepts"]})
    elif a in NEW_TO_OLD:
        hits = [r for r in tbl if r["new_act"] == a and s in [x.upper() for x in r["new_sections"]]]
        news = [prov_by(a, s)]; old = prov_by(NEW_TO_OLD[a], hits[0]["old_section"]) if hits else None
        concepts = sorted({c for h in hits for c in h["concepts"]})
    else:
        raise HTTPException(400, "act must be one of IPC, BNS, CrPC, BNSS, IEA, BSA")
    news = [n for n in news if n]
    if not old and not news:
        raise HTTPException(404, "no mapping known for that section")
    diff = None
    if old and news:
        diff = llm_json("You compare an old Indian statutory provision with its 2023 replacement. Output JSON: {\"summary\": str (2 sentences), \"changes\": [str, ...] (max 5 concrete differences: punishment, scope, new ingredients, renumbering), \"unchanged\": [str,...] (max 3), \"severity_old\": str, \"severity_new\": str}",
                        f"OLD ({old['act']} s.{old['section']}):\n{old['text'][:2500]}\n\nNEW ({news[0]['act']} s.{news[0]['section']}):\n{news[0]['text'][:2500]}", 700)
    return {"old": old, "new": news, "concepts": concepts, "diff": diff}


# ----------------------------------------------------------------------------------------------- summariser / timeline / arguments
class DocIn(BaseModel):
    text: str = Field(..., min_length=40, max_length=80000)


@router.post("/summarize")
def summarize(q: DocIn):
    ctx, plist = ctx_passages(q.text[:1500], 6)
    out = llm_json("You are a Supreme Court law clerk. Summarise the judgment/document into JSON with keys: title (str), court (str|null), year (int|null), parties (str), "
                   "facts (3-6 bullet strings), issues (list), holding (str), ratio (str), provisions (list of strings like 'Section 302 IPC'), "
                   "precedents (list of case names mentioned), outcome (one of: allowed, dismissed, partly allowed, remanded, acquitted, convicted, other), "
                   "one_liner (<=25 words), key_quotes (max 3 short verbatim quotes). Use the supporting passages only to name provisions correctly.",
                   f"DOCUMENT:\n{q.text[:14000]}\n\nSUPPORTING STATUTORY PASSAGES:\n{ctx}", 1500)
    return {"summary": out, "passages": plist, "words": len(q.text.split())}


@router.post("/timeline")
def timeline(q: DocIn):
    out = llm_json("Extract a chronological timeline of events from the legal facts. JSON: {\"events\": [{\"date\": 'YYYY-MM-DD' or 'YYYY-MM' or 'YYYY' or null, \"label\": short title, \"detail\": 1-2 sentences, "
                   "\"actors\": [names], \"kind\": one of incident|police|court|filing|order|contract|notice|other, \"legal_significance\": str}], \"gaps\": [str] (missing dates or facts a lawyer would ask for), \"limitation_flags\": [str]}. Order events chronologically; keep 4-20 events.",
                   f"FACTS:\n{q.text[:14000]}", 1600)
    return out


class ArgueIn(BaseModel):
    facts: str = Field(..., min_length=20, max_length=20000)
    side: str = "both"  # prosecution|defence|petitioner|respondent|both
    forum: str = "Sessions Court"


@router.post("/argue")
def argue(q: ArgueIn):
    ctx, plist = ctx_passages(q.facts, 8)
    out = llm_json("You are a moot-court coach for Indian law. From the facts and the numbered passages, build the strongest arguments. JSON: "
                   "{\"issues\": [str], \"side_a\": {\"name\": str, \"arguments\": [{\"point\": str, \"basis\": str, \"citations\": [int], \"strength\": 1-5}]}, "
                   "\"side_b\": {same}, \"pivotal_facts\": [str], \"likely_outcome\": str, \"confidence\": 0-1, \"questions_bench_may_ask\": [str]}. "
                   "Cite passages by number only when they genuinely support the point. 3-5 arguments per side.",
                   f"FORUM: {q.forum}\nSIDE REQUESTED: {q.side}\nFACTS:\n{q.facts[:8000]}\n\nPASSAGES:\n{ctx}", 1800)
    return {**out, "passages": plist}


# ----------------------------------------------------------------------------------------------- offence lookup
PUNISH = re.compile(r"(imprisonment (?:for life|of either description for a term which may extend to [^,;.]+|for a term which may extend to [^,;.]+)|death|rigorous imprisonment[^,;.]*|simple imprisonment[^,;.]*|fine(?: which may extend to [^,;.]+)?)", re.I)


def parse_punishment(text: str):
    t = text.lower(); found = [m.group(0).strip() for m in PUNISH.finditer(text)]
    WORDS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "ten": "10", "fourteen": "14", "twenty": "20"}
    tn = re.sub(r"\b(one|two|three|four|five|six|seven|ten|fourteen|twenty)\b", lambda m: WORDS[m.group(1)], t)
    years = [float(y) for y in re.findall(r"extend to (\d+)\s*years?", tn)]
    months = [float(y) for y in re.findall(r"extend to (\d+)\s*months?", tn)]
    if not years and months:
        years = [max(months) / 12]
    sev = 5 if "death" in t else 4 if "imprisonment for life" in t else 3 if years and max(years) >= 7 else 2 if years and max(years) >= 3 else 1 if years or "imprisonment" in t else 0
    return {"mentions": list(dict.fromkeys(found))[:6], "max_years": max(years) if years else None, "life": "imprisonment for life" in t, "death": "death" in t and "punished with death" in t, "fine": "fine" in t, "severity": sev}


@router.get("/offence")
def offence(q: str, limit: int = 8):
    ql = q.lower().strip(); hits = []
    for concept, provs in CONCEPTS.items():
        if ql in concept or concept in ql:
            for a, s in provs:
                if a in (IPC, BNS):
                    p = prov_by(a, s)
                    if p:
                        hits.append({**p, "concept": concept, "text": p["text"][:1800], "punishment": parse_punishment(p["text"])})
    if not hits:
        rr = eng().retriever.retrieve(q, RetrievalConfig(final_k=limit, doc_types=("statute",)))
        for p in rr.passages:
            if p.chunk.act in (IPC, BNS):
                pr = prov_by(p.chunk.act, p.chunk.section)
                if pr:
                    hits.append({**pr, "concept": None, "text": pr["text"][:1800], "punishment": parse_punishment(pr["text"])})
    seen, out = set(), []
    for h in hits:
        if h["doc_id"] not in seen:
            seen.add(h["doc_id"]); out.append(h)
    out = out[:limit]
    cls = None
    if out:
        cls = llm_json("For each Indian offence provision, classify per the CrPC/BNSS First Schedule from general legal knowledge. JSON list of {\"doc_id\": str, \"cognizable\": bool|null, \"bailable\": bool|null, \"compoundable\": bool|null, \"triable_by\": str, \"ingredients\": [str] (3-5 essential ingredients)}. Mark null when unsure.",
                       "\n\n".join(f"doc_id={h['doc_id']} :: {h['act']} s.{h['section']}: {h['text'][:700]}" for h in out), 1200)
    by = {c.get("doc_id"): c for c in (cls or []) if isinstance(c, dict)}
    for h in out:
        h["classification"] = by.get(h["doc_id"])
    return {"query": q, "results": out}


# ----------------------------------------------------------------------------------------------- compare / simplify
class CompareIn(BaseModel):
    doc_ids: list[str] = Field(..., min_length=2, max_length=3)


@router.post("/compare")
def compare(q: CompareIn):
    e = eng(); docs = []
    for d in q.doc_ids:
        ch = sorted([c for c in e.retriever.chunks if c.doc_id == d], key=lambda c: c.position)
        if not ch:
            raise HTTPException(404, f"{d} not found")
        docs.append({"doc_id": d, "citation": ch[0].citation, "act": ch[0].act, "section": ch[0].section, "title": ch[0].title, "text": " ".join(c.text for c in ch)[:6000]})
    out = llm_json("Compare these Indian legal provisions. JSON: {\"overview\": str, \"matrix\": [{\"dimension\": str, \"values\": [str per provision in order]}] (dimensions: scope, ingredients, punishment/consequence, who can invoke, procedure, notable differences), \"when_to_use\": [str per provision], \"interplay\": str}",
                   "\n\n".join(f"PROVISION {i+1} ({d['citation']}):\n{d['text'][:3000]}" for i, d in enumerate(docs)), 1400)
    return {"docs": docs, "analysis": out}


class SimplifyIn(BaseModel):
    text: str = Field(..., min_length=20, max_length=12000)
    level: str = "12-year-old"  # 12-year-old | layperson | law student | practitioner
    language: str = "English"


@router.post("/simplify")
def simplify(q: SimplifyIn):
    out = llm_json(f"Rewrite the Indian legal text for a {q.level}, in {q.language}. JSON: {{\"plain\": str (<=120 words), \"example\": str (one concrete everyday scenario), \"key_terms\": [{{\"term\": str, \"meaning\": str}}] (max 5), \"do_dont\": [str] (max 4 practical pointers)}}",
                   q.text, 800)
    return out


# ----------------------------------------------------------------------------------------------- glossary / rights / limitation (curated)
GLOSSARY = [
    ("Acquittal", "A court finding that the accused is not guilty; ends the prosecution.", [(CRPC, "232"), (BNSS, "255")]),
    ("Anticipatory bail", "Pre-arrest bail directing that a person be released on bail if arrested for a non-bailable offence.", [(CRPC, "438"), (BNSS, "482")]),
    ("Bail", "Release of an accused from custody on conditions pending trial.", [(CRPC, "437"), (BNSS, "480")]),
    ("Bailable offence", "An offence where bail is a matter of right (CrPC First Schedule).", [(CRPC, "436"), (BNSS, "478")]),
    ("Charge sheet", "Final police report filed after investigation under s.173 CrPC / s.193 BNSS.", [(CRPC, "173"), (BNSS, "193")]),
    ("Cognizable offence", "An offence for which police may arrest without a warrant and investigate without court permission.", [(CRPC, "154"), (BNSS, "173")]),
    ("Compoundable offence", "An offence the victim may settle with the accused, ending the case.", [(CRPC, "320"), (BNSS, "359")]),
    ("Consideration", "Something of value exchanged that makes a promise enforceable as a contract.", [(ICA, "2"), (ICA, "25")]),
    ("Culpable homicide", "Causing death with intention or knowledge; murder is its aggravated form.", [(IPC, "299"), (BNS, "100")]),
    ("Decree", "Formal expression of a civil court's adjudication conclusively determining the rights of parties.", []),
    ("Defamation", "Harming reputation by words, signs or visible representations.", [(IPC, "499"), (BNS, "356")]),
    ("Dishonour of cheque", "A cheque returned unpaid for insufficient funds — an offence under s.138 NI Act.", [(NIA, "138")]),
    ("Dying declaration", "Statement by a dying person about the cause of death; admissible as evidence.", [(IEA, "32"), (BSA, "26")]),
    ("FIR", "First Information Report — the first record of a cognizable offence registered by police.", [(CRPC, "154"), (BNSS, "173")]),
    ("Fundamental rights", "Rights in Part III of the Constitution enforceable directly in the Supreme Court (Art. 32) and High Courts (Art. 226).", [(COI, "32"), (COI, "226")]),
    ("Habeas corpus", "A writ to produce a detained person before the court and test the legality of detention.", [(COI, "32"), (COI, "226")]),
    ("Hearsay", "Second-hand evidence of a statement made outside court, generally inadmissible.", [(IEA, "60"), (BSA, "55")]),
    ("Injunction", "A court order to do or refrain from doing an act.", [(SRA := "Specific Relief Act, 1963", "36"), (SRA, "38")]),
    ("Judicial custody", "Detention of an accused in jail under a magistrate's order, as opposed to police custody.", [(CRPC, "167"), (BNSS, "187")]),
    ("Limitation", "Time limit within which a suit, appeal or application must be filed.", [(LIM, "3")]),
    ("Maintenance", "Periodic support a court orders for a wife, child or parent unable to maintain themselves.", [(CRPC, "125"), (BNSS, "144")]),
    ("Mens rea", "The guilty mind — the mental element (intention/knowledge) required for most offences.", []),
    ("Mesne profits", "Profits a person in wrongful possession of property received or could have received.", []),
    ("Non-bailable offence", "An offence where bail is at the discretion of the court.", [(CRPC, "437"), (BNSS, "480")]),
    ("PIL", "Public Interest Litigation — a petition filed for the public at large, with relaxed locus standi.", [(COI, "32"), (COI, "226")]),
    ("Plea bargaining", "Negotiated guilty plea for a lesser sentence in offences punishable up to 7 years.", [(CRPC, "265A"), (BNSS, "289")]),
    ("Quash", "To annul an FIR or proceeding, typically by the High Court under s.482 CrPC / s.528 BNSS.", [(CRPC, "482"), (BNSS, "528")]),
    ("Remand", "Sending an accused back into custody, or a case back to a lower court.", [(CRPC, "167"), (BNSS, "187")]),
    ("Res judicata", "A matter finally decided cannot be re-litigated between the same parties.", [("Code of Civil Procedure, 1908", "11")]),
    ("Sedition", "Exciting disaffection against the Government; s.124A IPC replaced by BNS s.152 (acts endangering sovereignty).", [(IPC, "124A"), (BNS, "152")]),
    ("Specific performance", "A decree compelling a party to perform the contract rather than pay damages.", [(SRA, "10")]),
    ("Summons case", "A case relating to an offence not punishable with more than two years' imprisonment.", [(CRPC, "2"), (BNSS, "2")]),
    ("Warrant case", "A case relating to an offence punishable with death, life imprisonment or more than two years.", [(CRPC, "2"), (BNSS, "2")]),
    ("Writ", "A formal court order — habeas corpus, mandamus, prohibition, certiorari, quo warranto.", [(COI, "32"), (COI, "226")]),
    ("Zero FIR", "An FIR registered at any police station irrespective of jurisdiction, later transferred.", [(BNSS, "173")]),
    ("Abetment", "Instigating, conspiring or intentionally aiding the commission of an offence.", [(IPC, "107"), (BNS, "45")]),
    ("Attempt", "An act towards committing an offence that falls short of completion; punishable.", [(IPC, "511"), (BNS, "62")]),
    ("Common intention", "Liability of each person for a criminal act done by several in furtherance of a shared intention.", [(IPC, "34"), (BNS, "3")]),
    ("Cheating", "Deceiving a person to deliver property or act to their detriment.", [(IPC, "420"), (BNS, "318")]),
    ("Criminal breach of trust", "Dishonest misappropriation of property entrusted to a person.", [(IPC, "406"), (BNS, "316")]),
    ("Right to information", "Statutory right to obtain information from public authorities within 30 days.", [(RTI, "6"), (RTI, "7")]),
    ("Consumer", "A person who buys goods or hires services for consideration (not for resale).", [(CPA, "2")]),
    ("Domestic violence", "Physical, sexual, verbal, emotional or economic abuse in a domestic relationship.", [(DVA, "3")]),
    ("Mutual consent divorce", "Divorce on joint petition after one year of separation.", [(HMA, "13B")]),
    ("Identity theft", "Fraudulent use of another person's electronic signature or password.", [(ITA, "66C")]),
    ("Drunk driving", "Driving with blood alcohol above 30 mg/100 ml — punishable under s.185 MV Act.", [(MVA, "185")]),
]


@router.get("/glossary")
def glossary(q: str = ""):
    ql = q.lower()
    rows = [{"term": t, "meaning": m, "provisions": [{"act": a, "section": s} for a, s in p]} for t, m, p in GLOSSARY if not ql or ql in t.lower() or ql in m.lower()]
    return rows


RIGHTS = [
    {"id": "arrest", "title": "If you are arrested", "icon": "handcuffs", "summary": "Your rights from the moment of arrest.",
     "steps": ["Ask the officer's name and the grounds of arrest — they must be told to you (Art. 22(1); s.47 BNSS / s.50 CrPC).",
               "You have the right to inform a relative or friend (s.48 BNSS / s.50A CrPC) and to consult a lawyer (Art. 22(1)).",
               "You must be produced before a magistrate within 24 hours (Art. 22(2); s.58 BNSS / s.57 CrPC).",
               "A medical examination can be demanded (s.53 BNSS / s.54 CrPC). Women may be arrested only by women officers and not after sunset without magistrate's permission (s.43(5) BNSS / s.46(4) CrPC).",
               "You cannot be compelled to be a witness against yourself (Art. 20(3)). Say you will speak in the presence of your lawyer."],
     "provisions": [(COI, "22"), (COI, "20"), (BNSS, "47"), (BNSS, "58"), (CRPC, "50"), (CRPC, "57")]},
    {"id": "fir", "title": "Police refuse to register your FIR", "icon": "file-warning", "summary": "Escalation ladder when a cognizable complaint is not registered.",
     "steps": ["Registration of an FIR for a cognizable offence is mandatory (Lalita Kumari v. Govt. of U.P., 2014; s.173 BNSS / s.154 CrPC). Ask for a free copy.",
               "File a Zero FIR at any police station; it must be transferred.", "Send the complaint in writing to the Superintendent of Police (s.173(4) BNSS / s.154(3) CrPC).",
               "Apply to the Magistrate under s.175(3) BNSS / s.156(3) CrPC directing investigation.", "Approach the High Court under s.528 BNSS / s.482 CrPC or Art. 226 if still refused."],
     "provisions": [(BNSS, "173"), (CRPC, "154"), (CRPC, "156"), (BNSS, "175")]},
    {"id": "cheque", "title": "Your cheque bounced", "icon": "banknote", "summary": "The s.138 NI Act timeline.",
     "steps": ["Get the bank's return memo (insufficient funds / exceeds arrangement).", "Send a written demand notice within 30 days of the memo.",
               "The drawer has 15 days from receipt to pay.", "If unpaid, file a complaint before the Magistrate within 30 days after that 15-day window (s.142).",
               "Punishment: up to 2 years' imprisonment and/or fine up to twice the cheque amount (s.138); interim compensation up to 20% is possible (s.143A)."],
     "provisions": [(NIA, "138"), (NIA, "142"), (NIA, "143A")]},
    {"id": "tenant", "title": "Landlord–tenant dispute", "icon": "home", "summary": "Eviction, deposits and notice.",
     "steps": ["Check the written agreement and whether it is registered (leases over 11 months must be registered).",
               "A lease without a fixed term needs 15 days' notice for month-to-month tenancies (s.106 Transfer of Property Act).",
               "Landlords cannot cut utilities or forcibly evict; only a court/rent authority can order eviction.", "Security deposit refund disputes can go to the rent authority (state Rent Control / Tenancy Act) or civil court.",
               "Keep rent receipts and communication in writing."], "provisions": [("Transfer of Property Act, 1882", "106"), ("Transfer of Property Act, 1882", "108")]},
    {"id": "consumer", "title": "Defective product or poor service", "icon": "shopping-bag", "summary": "Consumer Protection Act 2019 remedies.",
     "steps": ["Write to the seller/service provider first; keep invoice and proof.", "File online at e-daakhil or before the District Commission (claims up to ₹50 lakh), State (up to ₹2 crore), National (above).",
               "Limitation is 2 years from the cause of action (s.69).", "Relief: refund, replacement, compensation, punitive damages, and product-liability claims (Chapter VI).", "No lawyer is required; fees are nominal."],
     "provisions": [(CPA, "2"), (CPA, "35"), (CPA, "69")]},
    {"id": "dv", "title": "Domestic violence", "icon": "shield", "summary": "Immediate protection under the PWDV Act 2005 and BNS s.85.",
     "steps": ["Call 181 (women helpline) / 112. Approach the Protection Officer, police or Magistrate directly.",
               "Ask for a Protection Order (s.18), Residence Order (s.19) — you cannot be evicted from the shared household — and monetary relief (s.20).",
               "Cruelty by husband or relatives is also a cognizable offence (s.85 BNS / s.498A IPC).", "Interim orders can be granted ex parte (s.23).", "Free legal aid is available under the Legal Services Authorities Act."],
     "provisions": [(DVA, "3"), (DVA, "18"), (DVA, "19"), (BNS, "85"), (IPC, "498A")]},
    {"id": "accident", "title": "Road accident", "icon": "car", "summary": "What to do and what you can claim.",
     "steps": ["Report to police within 24 hours; an FIR helps the claim.", "Hit-and-run victims get compensation from the Solatium scheme (s.161 MV Act).",
               "Claim before the Motor Accident Claims Tribunal (s.166); no limitation for death/injury claims under the 2019 amendment, but file promptly.",
               "Insurer of the vehicle is liable under third-party cover (s.146, s.147).", "Rash driving is an offence (s.281 BNS / s.279 IPC; s.106 BNS for death by negligence)."],
     "provisions": [(MVA, "166"), (MVA, "161"), (MVA, "185"), (BNS, "106"), (BNS, "281")]},
    {"id": "rti", "title": "Getting information from the government", "icon": "search", "summary": "RTI in five steps.",
     "steps": ["Write to the Public Information Officer of the authority; ₹10 fee (free for BPL).", "Reply due within 30 days (48 hours for life/liberty matters) (s.7).",
               "Exemptions are limited to s.8 (security, privacy, etc.).", "First appeal to the senior officer within 30 days; second appeal to the Information Commission within 90 days (s.19).", "Penalty of ₹250/day on the PIO for delay (s.20)."],
     "provisions": [(RTI, "6"), (RTI, "7"), (RTI, "8"), (RTI, "19")]},
    {"id": "workplace", "title": "Sexual harassment at work", "icon": "briefcase", "summary": "POSH Act 2013 and BNS s.75.",
     "steps": ["Complain in writing to the Internal Committee within 3 months (extendable).", "Employers with 10+ staff must have an Internal Committee; else the Local Committee.",
               "Inquiry must complete within 90 days; interim relief such as transfer or leave is available.", "It is also an offence under s.75 BNS / s.354A IPC.", "Retaliation against the complainant is prohibited."],
     "provisions": [(BNS, "75"), (IPC, "354A")]},
    {"id": "online", "title": "Online fraud or hacking", "icon": "wifi", "summary": "Cyber-crime response.",
     "steps": ["Report within the 'golden hour' on 1930 / cybercrime.gov.in to freeze the money trail.", "Identity theft and cheating by personation are offences (s.66C, 66D IT Act; s.319 BNS).",
               "Ask your bank in writing to reverse unauthorised transactions (RBI limited-liability circular: zero liability if reported within 3 days).", "Preserve screenshots, transaction IDs and headers.", "File an FIR; cyber offences are cognizable."],
     "provisions": [(ITA, "66C"), (ITA, "66D"), (BNS, "318"), (BNS, "319")]},
]


@router.get("/rights")
def rights(scenario: str | None = None):
    def enrich(r):
        provs = []
        for a, s in r["provisions"]:
            p = prov_by(a, s)
            provs.append({"act": a, "section": s, "title": p["title"] if p else None, "doc_id": p["doc_id"] if p else None, "text": (p["text"][:600] if p else None)})
        return {**{k: v for k, v in r.items() if k != "provisions"}, "provisions": provs}
    if scenario:
        for r in RIGHTS:
            if r["id"] == scenario:
                return enrich(r)
        raise HTTPException(404, "unknown scenario")
    return [{k: v for k, v in r.items() if k in ("id", "title", "icon", "summary")} | {"steps": len(r["steps"])} for r in RIGHTS]


LIMITATION = [
    {"id": "cheque_notice", "matter": "Cheque bounce — demand notice", "days": 30, "from": "date of bank return memo", "basis": "s.138(b) NI Act"},
    {"id": "cheque_complaint", "matter": "Cheque bounce — criminal complaint", "days": 30, "from": "expiry of 15 days after notice is received", "basis": "s.142(1)(b) NI Act"},
    {"id": "consumer", "matter": "Consumer complaint", "days": 730, "from": "date of cause of action", "basis": "s.69 Consumer Protection Act 2019"},
    {"id": "contract", "matter": "Suit for breach of contract / recovery of money", "days": 1095, "from": "date of breach / when money became due", "basis": "Arts. 55, 113 Limitation Act"},
    {"id": "tort", "matter": "Suit for compensation (tort)", "days": 365, "from": "date of injury", "basis": "Arts. 72–91 Limitation Act"},
    {"id": "possession", "matter": "Suit for possession of immovable property", "days": 4380, "from": "date of dispossession", "basis": "Art. 65 Limitation Act"},
    {"id": "appeal_hc", "matter": "Appeal to High Court from a decree", "days": 90, "from": "date of decree", "basis": "Art. 116 Limitation Act"},
    {"id": "appeal_other", "matter": "Appeal to other court from a decree", "days": 30, "from": "date of decree", "basis": "Art. 116 Limitation Act"},
    {"id": "crim_appeal", "matter": "Criminal appeal to High Court (conviction)", "days": 60, "from": "date of sentence", "basis": "Art. 115 Limitation Act"},
    {"id": "slp", "matter": "Special Leave Petition to Supreme Court", "days": 90, "from": "date of judgment", "basis": "Art. 133 Limitation Act"},
    {"id": "rti_first", "matter": "RTI first appeal", "days": 30, "from": "receipt of reply / expiry of 30-day period", "basis": "s.19(1) RTI Act"},
    {"id": "rti_second", "matter": "RTI second appeal", "days": 90, "from": "first appellate order", "basis": "s.19(3) RTI Act"},
    {"id": "posh", "matter": "POSH complaint to Internal Committee", "days": 90, "from": "date of incident", "basis": "s.9 POSH Act 2013"},
    {"id": "arbitration", "matter": "Challenge to arbitral award", "days": 90, "from": "receipt of award", "basis": "s.34(3) Arbitration Act 1996"},
    {"id": "writ", "matter": "Writ petition (no fixed limit; delay/laches applies)", "days": 0, "from": "cause of action", "basis": "Art. 226 Constitution"},
    {"id": "maintenance_arrears", "matter": "Recovery of maintenance arrears", "days": 365, "from": "date each instalment fell due", "basis": "s.128 CrPC / s.144 BNSS"},
    {"id": "execution", "matter": "Execution of a decree", "days": 4380, "from": "date of decree", "basis": "Art. 136 Limitation Act"},
    {"id": "cognizance_1yr", "matter": "Cognizance — offence punishable up to 1 year", "days": 365, "from": "date of offence", "basis": "s.468 CrPC / s.514 BNSS"},
    {"id": "cognizance_3yr", "matter": "Cognizance — offence punishable 1–3 years", "days": 1095, "from": "date of offence", "basis": "s.468 CrPC / s.514 BNSS"},
]


@router.get("/limitation")
def limitation(start: str | None = None):
    rows = []
    for r in LIMITATION:
        row = dict(r)
        if start and r["days"]:
            try:
                d0 = date.fromisoformat(start); dl = d0 + timedelta(days=r["days"]); row["deadline"] = dl.isoformat(); row["days_left"] = (dl - date.today()).days
            except ValueError:
                raise HTTPException(400, "start must be YYYY-MM-DD")
        rows.append(row)
    return {"today": date.today().isoformat(), "rows": rows}


# ----------------------------------------------------------------------------------------------- AIBE trainer
@lru_cache(maxsize=1)
def aibe():
    rows = []
    for f in ("train.csv", "test.csv"):
        p = Path(DATA_RAW) / "jmukesh99__AIBE_mcq" / f
        if not p.exists():
            continue
        for i, r in enumerate(csv.DictReader(open(p, encoding="utf-8"))):
            try:
                opts = list(ast.literal_eval(r["Options"]))
            except Exception:
                try:
                    opts = json.loads(r["Options"].replace("'", '"'))
                except Exception:
                    continue
            ans = (r["True_Answer"] or "").strip()
            m = re.search(r"\(([A-Da-d])\)", ans) or re.fullmatch(r"\s*([A-Da-d])\s*", ans)
            if not m or len(opts) < 2:
                continue
            rows.append({"id": f"{f[:-4]}_{i}", "question": re.sub(r"^\d+\.\s*", "", r["Question"]).strip(), "options": [re.sub(r"^\(?[A-Da-d][).]\s*", "", str(o)).strip() for o in opts], "answer": "ABCD".index(m.group(1).upper())})
    return rows


@router.get("/quiz")
def quiz(n: int = 5, seed: int | None = None):
    rows = aibe(); rng = random.Random(seed)
    pick = rng.sample(rows, min(n, len(rows)))
    return {"total": len(rows), "questions": [{k: v for k, v in q.items() if k != "answer"} for q in pick]}


class QuizCheck(BaseModel):
    id: str
    choice: int
    explain: bool = True


@router.post("/quiz/check")
def quiz_check(q: QuizCheck):
    row = next((r for r in aibe() if r["id"] == q.id), None)
    if not row:
        raise HTTPException(404, "unknown question")
    out = {"correct": q.choice == row["answer"], "answer": row["answer"]}
    if q.explain:
        ctx, plist = ctx_passages(row["question"] + " " + row["options"][row["answer"]], 4)
        out["explanation"] = llm("You are a bar-exam tutor for Indian law. In 3-5 sentences explain why the correct option is right and the chosen one (if different) is wrong, citing the passages like [1] where they help.",
                                  f"Question: {row['question']}\nOptions: {row['options']}\nCorrect: {row['options'][row['answer']]}\nStudent chose: {row['options'][q.choice]}\n\nPassages:\n{ctx}", 400)
        out["passages"] = plist
    return out


# ----------------------------------------------------------------------------------------------- citation verifier
class VerifyIn(BaseModel):
    text: str = Field(..., min_length=3, max_length=20000)


CITE = re.compile(r"(?:section|sec\.?|s\.|article|art\.?)\s*(\d+[A-Z]?)(?:\s*(?:of|,)?\s*(?:the\s+)?([A-Z][A-Za-z ,()]+?(?:Act|Code|Sanhita|Adhiniyam|Constitution)(?:,?\s*\d{4})?|IPC|BNS|BNSS|CrPC|BSA|NI Act|IT Act))?", re.I)
ABBR = {"ipc": IPC, "bns": BNS, "bnss": BNSS, "crpc": CRPC, "bsa": BSA, "iea": IEA, "ni act": NIA, "it act": ITA, "constitution": COI}


@router.post("/verify")
def verify(q: VerifyIn):
    acts = list(_statutes().keys()); out = []
    for m in CITE.finditer(q.text):
        sec, act = m.group(1), (m.group(2) or "").strip()
        is_art = m.group(0).lower().startswith("art")
        cand = ABBR.get(act.lower()) if act else (COI if is_art else None)
        if not cand and act:
            al = act.lower().replace("the ", "")
            cand = next((a for a in acts if al in a.lower() or a.lower().split(",")[0] in al), None)
        p = prov_by(cand, sec) if cand else None
        out.append({"span": m.group(0), "section": sec, "act_guess": cand or act or None, "found": bool(p), "doc_id": p["doc_id"] if p else None, "title": p["title"] if p else None})
    return {"citations": out, "verified": sum(1 for o in out if o["found"]), "total": len(out)}
