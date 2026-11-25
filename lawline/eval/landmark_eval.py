"""Landmark-judgment retrieval test.

The four frozen gold sets barely exercise case law: the only case task (`sc_case`) covers Supreme Court Reports 2016.
This test asks doctrinal questions a student or litigant would ask, each answered by a well-known Supreme Court
judgment, and checks whether the full retrieval pipeline surfaces that judgment. Questions never name the case.

Read it for what it is. The questions were written by hand for this project and there are a few dozen of them. Their
targets were chosen from `lawline.data.expand.LANDMARKS`, the list of judgments the v2 corpus adds by name, so v2
holds every target by construction and v1 holds only the three it already had. The score therefore measures whether
judgments that were deliberately added can be found from a plain-language question; it is not a measure of how much
of the case law the corpus covers, and it is not a tuned benchmark. In the "all" setting a statute that answers the
question correctly can outrank the judgment, which counts against the score.

Run:  python -m lawline.eval.landmark_eval            -> outputs/results/landmark_eval.json
"""
from __future__ import annotations
import json, re
from ..config import RESULTS_DIR, CORPUS_PATH, RetrievalConfig
from ..data.schema import read_jsonl

# (question, [(title fragment, year of decision), ...]) - any listed judgment counts as a hit.
QUESTIONS: list[tuple[str, list[tuple[str, int]]]] = [
    ("Can Parliament amend any part of the Constitution, or is there a basic structure it cannot alter?", [("KESAVANANDA", 1973)]),
    ("Which decision held that Parliament has no power to amend fundamental rights and applied prospective overruling?", [("GOLAK NATH", 1967)]),
    ("Which early decision upheld a preventive detention law by reading procedure established by law apart from the freedoms in Article 19?", [("A.K. GOPALAN", 1950)]),
    ("Could a detenu file a habeas corpus petition during the Emergency when Article 21 was suspended?", [("DISTRICT MAGISTRATE JABALPUR", 1976)]),
    ("Is the limited amending power of Parliament itself part of the basic structure, and can directive principles override fundamental rights?", [("MINERVA MILLS", 1980)]),
    ("When can the death penalty be imposed for murder; what is the rarest of rare doctrine?", [("BACHAN SINGH", 1980)]),
    ("Is a mandatory death sentence for murder committed by a life convict constitutional?", [("MITHU", 1983)]),
    ("Is there a 50 per cent ceiling on reservations, and must the creamy layer among backward classes be excluded?", [("INDRA SAWHNEY", 1992)]),
    ("Can courts review a proclamation of President's rule under Article 356, and is secularism a basic feature?", [("S.R. BOMMAI", 1994)]),
    ("What guidelines must employers follow to prevent sexual harassment of women at the workplace?", [("VISHAKA", 1997)]),
    ("What requirements must police follow when arresting and detaining a person to prevent custodial violence?", [("D.K. BASU", 1996)]),
    ("Must police arrest automatically in a dowry harassment case where the offence is punishable with up to seven years?", [("ARNESH KUMAR", 2014)]),
    ("Is registration of an FIR mandatory when information discloses a cognizable offence, or can police hold a preliminary inquiry first?", [("LALITA KUMARI", 2013)]),
    ("Was the provision punishing offensive messages sent online struck down for violating free speech?", [("SHREYA SINGHAL", 2015)]),
    ("Is consensual sex between adults of the same sex still a criminal offence?", [("NAVTEJ SINGH JOHAR", 2018)]),
    ("Is adultery still a crime for which only the man can be punished?", [("JOSEPH SHINE", 2018)]),
    ("Is instant triple talaq a valid form of divorce?", [("SHAYARA BANO", 2017)]),
    ("Is passive euthanasia permitted, and can a person make a living will or advance directive?", [("COMMON CAUSE", 2018), ("ARUNA RAMCHANDRA SHANBAUG", 2011)]),
    ("Is the Aadhaar scheme constitutionally valid, and can it be made mandatory for bank accounts and mobile phones?", [("PUTTASWAMY", 2018)]),
    ("Can women of menstruating age be barred from entering a temple on grounds of religious custom?", [("INDIAN YOUNG LAWYERS", 2018)]),
    ("Are transgender persons legally recognised as a third gender with fundamental rights?", [("NATIONAL LEGAL SERVICES AUTHORITY", 2014)]),
    ("What principles govern the grant of anticipatory bail, and must it be limited to a fixed period?", [("GURBAKSH SINGH SIBBIA", 1980), ("SUSHILA AGGARWAL", 2020)]),
    ("In what categories of cases can a High Court quash an FIR using its inherent powers?", [("BHAJAN LAL", 1990)]),
    ("Is a certificate required before electronic records such as CDs or call records can be admitted as secondary evidence?", [("ANVAR P.V.", 2014), ("ARJUN PANDITRAO KHOTKAR", 2020)]),
    ("Can a divorced Muslim woman claim maintenance from her former husband beyond the iddat period?", [("AHMED KHAN", 1985), ("DANIAL LATIFI", 2001)]),
    ("Is the right to a speedy trial part of the right to life, particularly for undertrial prisoners who have spent years in jail?", [("HUSSAINARA KHATOON", 1979)]),
    ("Can the Supreme Court act on a letter about bonded labourers working in stone quarries as public interest litigation?", [("BANDHUA MUKTI MORCHA", 1983)]),
    ("Is an enterprise carrying on a hazardous activity absolutely liable for harm from a gas leak, without the usual exceptions to strict liability?", [("M.C. MEHTA", 1986)]),
    ("Are the precautionary principle and the polluter pays principle part of Indian environmental law?", [("VELLORE CITIZENS", 1996)]),
    ("Can a patient sue a doctor or hospital for deficient service before a consumer forum?", [("INDIAN MEDICAL ASSOCIATION", 1995)]),
    ("What degree of negligence is needed to prosecute a doctor for causing death by a rash or negligent act?", [("JACOB MATHEW", 2005)]),
    ("Who has primacy in appointing judges to the higher judiciary, the executive or a collegium of judges?", [("SUPREME COURT ADVOCATES-ON-RECORD", 1993), ("SUPREME COURT ADVOCATES-ON-RECORD", 2015)]),
    ("Can the power of judicial review of High Courts under Article 226 be excluded by setting up administrative tribunals?", [("L. CHANDRA KUMAR", 1997)]),
    ("Can a law placed in the Ninth Schedule after 1973 still be challenged for violating fundamental rights?", [("I.R. COELHO", 2007)]),
    ("What must the State show before providing reservation in promotions for Scheduled Castes and Scheduled Tribes?", [("M. NAGARAJ", 2006), ("JARNAIL SINGH", 2018)]),
    ("Is the anti-defection law in the Tenth Schedule valid, and can the Speaker's decision on disqualification be reviewed by courts?", [("KIHOTO HOLLOHAN", 1992)]),
    ("Is there a fundamental right to education, and up to what age?", [("UNNI KRISHNAN", 1993), ("MOHINI JAIN", 1992)]),
    ("Which decision held that a cheque bounce complaint must be filed where the drawee bank is, the rule Parliament later changed?", [("DASHRATH RUPSINGH RATHOD", 2014)]),
    ("What directions did the Supreme Court issue for police reforms, such as a State Security Commission and fixed tenure for officers?", [("PRAKASH SINGH", 2006)]),
    ("Is a confession recorded by a narcotics officer admissible against the accused in a drugs trial?", [("TOFAN SINGH", 2020)]),
    ("Does a daughter have coparcenary rights in ancestral property by birth even if her father died before 2005?", [("VINEETA SHARMA", 2020)]),
    ("Can the government suspend internet services indefinitely, and is access to the internet protected by freedom of speech?", [("ANURADHA BHASIN", 2020)]),
    ("Was the electoral bonds scheme for anonymous political donations held unconstitutional?", [("ASSOCIATION FOR DEMOCRATIC REFORMS", 2024)]),
    ("Is ten per cent reservation for economically weaker sections among forward castes constitutional?", [("JANHIT ABHIYAN", 2022)]),
    ("Are the Enforcement Directorate's powers of arrest and the twin conditions for bail in money laundering cases valid?", [("VIJAY MADANLAL CHOUDHARY", 2022), ("NIKESH TARACHAND SHAH", 2017)]),
    ("What guidelines apply to bail for an accused who was not arrested during investigation and cooperated throughout?", [("SATENDER KUMAR ANTIL", 2022)]),
    ("Is sexual intercourse by a husband with his wife aged between fifteen and eighteen years rape?", [("INDEPENDENT THOUGHT", 2017)]),
    ("When does a live-in relationship qualify as a relationship in the nature of marriage for protection against domestic violence?", [("D. VELUSAMY", 2010), ("INDRA SARMA", 2013)]),
    ("Is a second marriage valid if a Hindu husband converts to Islam without dissolving his first marriage?", [("SARLA MUDGAL", 1995), ("LILY THOMAS", 2000)]),
    ("Can Indian courts grant interim relief or set aside an award in an arbitration seated outside India?", [("BHARAT ALUMINIUM", 2012)]),
    ("Is capital gains tax payable in India when shares of a foreign holding company owning an Indian business are sold offshore?", [("VODAFONE INTERNATIONAL", 2012)]),
    ("Is the Insolvency and Bankruptcy Code's different treatment of financial and operational creditors constitutional?", [("SWISS RIBBONS", 2019)]),
    ("Is telephone tapping by the government an invasion of privacy, and what safeguards apply?", [("PEOPLE'S UNION FOR CIVIL LIBERTIES", 1996)]),
    ("Do voters have a right to reject all candidates through a none of the above option?", [("PEOPLE'S UNION FOR CIVIL LIBERTIES", 2013)]),
    ("Does a sitting legislator lose the seat immediately on conviction, or can membership continue while an appeal is pending?", [("LILY THOMAS", 2013)]),
    ("What preventive and remedial measures must States take against mob lynching and cow vigilantism?", [("TEHSEEN", 2018)]),
    ("What must authorities do to prevent honour killings ordered by khap panchayats against inter-caste couples?", [("SHAKTI VAHINI", 2018)]),
    ("Can a court annul the marriage of an adult woman who converted and married a man of her choice?", [("SHAFIN JAHAN", 2018)]),
    ("Do same-sex couples have a fundamental right to marry?", [("SUPRIYO", 2023)]),
    ("Must a government corporation act fairly and follow its own tender conditions when awarding a contract?", [("RAMANA DAYARAM SHETTY", 1979)]),
    ("Can a clause allowing a public corporation to terminate a permanent employee with three months' notice be struck down as unconscionable?", [("CENTRAL INLAND WATER", 1986)]),
    ("What must the prosecution prove under the third clause of the definition of murder about the bodily injury inflicted?", [("VIRSA SINGH", 1958)]),
    ("Does killing a wife's lover after learning of the affair amount to grave and sudden provocation?", [("NANAVATI", 1961)]),
    ("Can a State sub-classify Scheduled Castes to give preference to the more backward among them?", [("DAVINDER SINGH", 2024)]),
    ("Can the government ban the entry and circulation of a journal in a State in the interest of public safety?", [("ROMESH THAPPAR", 1950)]),
    ("Was the 2016 demonetisation of high-value currency notes legally valid?", [("VIVEK NARAYAN SHARMA", 2023)]),
    ("Who did the Supreme Court say should select the Chief Election Commissioner and Election Commissioners until Parliament made a law?", [("ANOOP BARANWAL", 2023)]),
    ("When does a contract become void because performance has become impossible or impracticable?", [("MUGNEERAM", 1954)]),
    ("Could the central bank prohibit banks from dealing with cryptocurrency exchanges?", [("INTERNET AND MOBILE ASSOCIATION", 2020)]),
    ("Can a new form of a known medicine be patented without showing enhanced therapeutic efficacy?", [("NOVARTIS", 2013)]),
    # three judgments the v1 corpus already held, so that version is not scored on an empty set
    ("Must the procedure for depriving a person of liberty, such as impounding a passport, be fair, just and reasonable?", [("MANEKA GANDHI", 1978)]),
    ("Does the right to life include the right to livelihood of pavement and slum dwellers facing eviction?", [("OLGA TELLIS", 1985)]),
    ("Is the right to privacy a fundamental right under the Constitution?", [("PUTTASWAMY", 2017)]),
]


V1_TARGETS = {"MANEKA GANDHI (1978)", "OLGA TELLIS (1985)", "PUTTASWAMY (2017)"}      # held since v1 (source "capstone-phase2")
POOL = 30                                                                             # passages retrieved per question before collapsing to documents


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[.,'’`]", " ", (s or "").upper())).strip()


def resolve(corpus_path=CORPUS_PATH) -> list[dict]:
    """Attach the corpus doc_ids of each question's judgments (none if the corpus does not hold them). A v2 judgment
    is identified by the LANDMARKS entry it was added for, which the corpus builder records on the document, so a
    different case with a similar party name can never count. The three v1 judgments are matched by title."""
    by_label: dict[str, list[str]] = {}
    v1_titles = []
    for d in read_jsonl(corpus_path):
        if d["doc_type"] != "case":
            continue
        label = (d.get("extra") or {}).get("landmark")
        if label:
            by_label.setdefault(label, []).append(d["doc_id"])
        elif d["source"] == "capstone-phase2":
            v1_titles.append((d["doc_id"], _norm(d["title"])))
    out = []
    for i, (q, targets) in enumerate(QUESTIONS):
        gold = set()
        for frag, year in targets:
            label = f"{frag} ({year})"
            gold.update(by_label.get(label, ()))
            if label in V1_TARGETS:
                gold.update(doc_id for doc_id, title in v1_titles if re.search(r"\b" + re.escape(_norm(frag)) + r"\b", title))
        out.append({"qid": f"lm{i:02d}", "query": q, "targets": [f"{f} ({y})" for f, y in targets], "gold": sorted(gold)})
    return out


def score(rows: list[dict]) -> dict:
    n = len(rows)
    def rate(name, cut):
        return sum(1 for r in rows if r[name]["rank"] and r[name]["rank"] <= cut) / n
    return {"questions": n, "judgment_in_corpus": sum(r["in_corpus"] for r in rows),
            **{f"{name}_hit@{cut}": round(rate(name, cut), 3) for name in ("all", "cases_only") for cut in (1, 5, 10)}}


def run() -> dict:
    """Document-level ranks: the top POOL reranked passages are collapsed to their parent documents, as the retrieval
    benchmark does, and hit@k asks whether the judgment is among the first k documents."""
    from ..retrieval.hybrid import HybridRetriever
    import os
    from ..config import FINETUNED_EMBEDDING_MODEL
    tag = os.environ.get("LAWLINE_FAISS_TAG", "ft")
    retriever = HybridRetriever(faiss_tag=tag, embed_model=os.environ.get("LAWLINE_EMBED_MODEL") or FINETUNED_EMBEDDING_MODEL)
    rows = []
    for it in resolve():
        row = {"qid": it["qid"], "query": it["query"], "targets": it["targets"], "in_corpus": bool(it["gold"])}
        for name, cfg in (("all", RetrievalConfig(final_k=POOL)), ("cases_only", RetrievalConfig(final_k=POOL, doc_types=("case",)))):
            docs = list(dict.fromkeys(p.chunk.doc_id for p in retriever.retrieve(it["query"], cfg).passages))
            rank = next((i + 1 for i, d in enumerate(docs) if d in it["gold"]), None)
            row[name] = {"rank": rank, "top": docs[:3]}
        rows.append(row)
    out = {"summary": {**score(rows), "chunks": len(retriever.chunks), "faiss_tag": tag, "pool": POOL}, "rows": rows}
    json.dump(out, open(RESULTS_DIR / "landmark_eval.json", "w"), indent=2)
    return out


if __name__ == "__main__":
    print(json.dumps(run()["summary"], indent=2))
