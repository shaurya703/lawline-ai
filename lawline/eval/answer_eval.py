"""End-to-end answer quality.

(A) AIBE multiple-choice accuracy: closed-book LLM vs. LLM + hybrid retrieval (same generator, same prompt budget).
(B) Grounded QA on held-out questions with reference answers (BNS-QA, Constitution-QA):
    closed-book vs. RAG, judged by a *different* model (LLM-as-judge) for correctness and faithfulness, plus
    automatic citation metrics (retrieval hit, gold-cited, citation density).
Results -> outputs/results/answer_eval/
"""
from __future__ import annotations
import argparse, ast, json, random, re, time
from pathlib import Path
import pandas as pd
from tqdm import tqdm
from ..config import RESULTS_DIR, DATA_RAW, RetrievalConfig, JUDGE_MODEL, GEMINI_MODEL
from ..generation.llm import LLMClient
from ..generation.prompts import SYSTEM_PROMPT, USER_TEMPLATE, CLOSED_BOOK_SYSTEM, format_context
from .gold import load_gold

SEED = 13
OUT = RESULTS_DIR / "answer_eval"
MCQ_SYS = "You are taking the All India Bar Examination. Answer with the single letter of the correct option (a, b, c or d) and nothing else."
JUDGE_SYS = """You are a strict legal evaluator. You will be given a question, a reference answer written by a domain expert, and TWO
assistant answers: answer A (closed-book, no context) and answer B (given the context passages shown). Return ONLY a JSON object:
{"A": {"correctness": 0|1|2, "faithfulness": 0|1|2, "fabricated_citation": true|false, "reason": "<one sentence>"},
 "B": {"correctness": 0|1|2, "faithfulness": 0|1|2, "fabricated_citation": true|false, "reason": "<one sentence>"}}
correctness: 2 = fully consistent with the reference, 1 = partially correct / incomplete, 0 = wrong or refuses when the reference answers.
faithfulness (only meaningful when context is given; else judge against the reference): 2 = every legal claim is supported by the
context/reference, 1 = minor unsupported detail, 0 = material unsupported or contradicted claim.
fabricated_citation: true if the answer cites a section/article/case number that is neither in the context nor in the reference."""


def _sleep(s=6.5):      # free-tier pacing (~10 requests / minute per model)
    time.sleep(s)


def _parse_letter(text: str) -> str | None:
    m = re.search(r"\b([abcd])\b", text.strip().lower())
    return m.group(1) if m else None


def run_aibe(engine, gen: LLMClient, n: int, cfg: RetrievalConfig) -> pd.DataFrame:
    df = pd.concat([pd.read_csv(DATA_RAW / "jmukesh99__AIBE_mcq/train.csv"), pd.read_csv(DATA_RAW / "jmukesh99__AIBE_mcq/test.csv")])
    df = df.dropna().sample(frac=1, random_state=SEED).head(n)
    rows = []
    for r in tqdm(list(df.itertuples()), desc="AIBE"):
        try:
            opts = ast.literal_eval(r.Options)
        except Exception:
            opts = [r.Options]
        q = f"{r.Question}\nOptions:\n" + "\n".join(opts)
        truth = str(r.True_Answer).strip().lower()[0]
        rec = {"question": r.Question, "truth": truth}
        try:
            cb = gen.complete(MCQ_SYS, q + "\nAnswer:"); rec["closed"] = _parse_letter(cb.text); _sleep()
            rr = engine.retriever.retrieve(r.Question + " " + " ".join(opts), cfg)
            ctx = format_context(rr.passages)
            rag = gen.complete(MCQ_SYS + " Use the context passages if they help.", f"Context:\n{ctx}\n\nQuestion:\n{q}\nAnswer:")
            rec["rag"] = _parse_letter(rag.text); _sleep()
        except Exception as e:
            rec["error"] = str(e)[:200]
        rows.append(rec)
    out = pd.DataFrame(rows)
    out["closed_ok"] = out.closed == out.truth; out["rag_ok"] = out.rag == out.truth
    return out


def run_grounded(engine, gen: LLMClient, judge: LLMClient, n_bns: int, n_const: int, cfg: RetrievalConfig) -> pd.DataFrame:
    qa = pd.read_json(DATA_RAW / "GSMS-B__Indian-Legal-QA-BNS-BNSS-BSA/bns_bnss_bsa_combined_legal_qa.jsonl", lines=True)
    ref_bns = dict(zip(qa.question, qa.answer))
    cq = pd.read_json(DATA_RAW / "nisaar__Constitution_of_India/constitution_train.jsonl", lines=True)
    ref_const = dict(zip(cq.question, cq.answer))
    rnd = random.Random(SEED)
    gb = [g for g in load_gold("bns_qa") if g["query"] in ref_bns]; rnd.shuffle(gb)
    gc = [g for g in load_gold("const_qa") if g["query"] in ref_const]; rnd.shuffle(gc)
    items = [(g, ref_bns[g["query"]]) for g in gb[:n_bns]] + [(g, ref_const[g["query"]]) for g in gc[:n_const]]
    rows = []
    for g, ref in tqdm(items, desc="grounded QA"):
        rec = {"qid": g["qid"], "task": g["task"], "question": g["query"], "reference": ref}
        try:
            cb = gen.complete(CLOSED_BOOK_SYSTEM, g["query"]); _sleep()
            ans = engine.ask(g["query"], cfg)
            rec.update(closed_answer=cb.text, rag_answer=ans.answer, backend=ans.backend,
                       retrieval_hit=any(p.chunk.doc_id in g["relevant"] for p in ans.retrieval.passages),
                       gold_cited=any(c["used"] and c["chunk_id"].split("#c")[0] in g["relevant"] for c in ans.citations),
                       n_cited=sum(c["used"] for c in ans.citations),
                       rag_cit_density=len(re.findall(r"\[\d+\]", ans.answer)) / max(1, len(re.findall(r"[.!?](\s|$)", ans.answer))),
                       gen_ms=ans.timings_ms.get("generation"), retr_ms=ans.timings_ms.get("retrieval_total"))
            ctx = format_context(ans.retrieval.passages)
            jprompt = (f"Question: {g['query']}\n\nReference answer: {ref}\n\nAnswer A (closed-book): {cb.text}\n\n"
                       f"Answer B (with context): {ans.answer}\n\nContext passages given to B:\n{ctx}")
            jr = judge.complete(JUDGE_SYS, jprompt); _sleep()
            m = re.search(r"\{.*\}", jr.text, re.S)
            j = json.loads(m.group(0)) if m else {}
            for name, key in (("closed", "A"), ("rag", "B")):
                jj = j.get(key, {})
                rec[f"{name}_correct"] = jj.get("correctness"); rec[f"{name}_faithful"] = jj.get("faithfulness")
                rec[f"{name}_fabricated"] = jj.get("fabricated_citation"); rec[f"{name}_reason"] = jj.get("reason")
            rec["judge_retries"] = len(jr.errors or [])
        except Exception as e:
            rec["error"] = str(e)[:300]
        rows.append(rec)
    return pd.DataFrame(rows)


def summarize(aibe: pd.DataFrame | None, grounded: pd.DataFrame | None) -> dict:
    s = {}
    if aibe is not None and len(aibe):
        ok = aibe[aibe.error.isna()] if "error" in aibe else aibe
        s["aibe"] = {"n": int(len(ok)), "closed_book_acc": float(ok.closed_ok.mean()), "rag_acc": float(ok.rag_ok.mean())}
    if grounded is not None and len(grounded):
        ok = grounded[grounded.error.isna()] if "error" in grounded else grounded
        for name in ("closed", "rag"):
            s[name] = {"correctness_mean(0-2)": float(ok[f"{name}_correct"].astype(float).mean()),
                       "faithfulness_mean(0-2)": float(ok[f"{name}_faithful"].astype(float).mean()),
                       "fully_correct_rate": float((ok[f"{name}_correct"].astype(float) == 2).mean()),
                       "fabricated_citation_rate": float(ok[f"{name}_fabricated"].astype(bool).mean())}
        s["rag"].update(retrieval_hit_rate=float(ok.retrieval_hit.mean()), gold_cited_rate=float(ok.gold_cited.mean()),
                        mean_citations_per_answer=float(ok.n_cited.mean()), n=int(len(ok)),
                        mean_generation_ms=float(ok.gen_ms.mean()), mean_retrieval_ms=float(ok.retr_ms.mean()))
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="base"); ap.add_argument("--embed-model", default=None)
    ap.add_argument("--aibe-n", type=int, default=150); ap.add_argument("--bns-n", type=int, default=40); ap.add_argument("--const-n", type=int, default=20)
    ap.add_argument("--skip-aibe", action="store_true"); ap.add_argument("--skip-grounded", action="store_true")
    a = ap.parse_args()
    from ..engine import QueryEngine
    from ..config import BASE_EMBEDDING_MODEL
    gen = LLMClient(backend="gemini"); judge = LLMClient(backend="gemini", gemini_model=JUDGE_MODEL, temperature=0.0)
    engine = QueryEngine(llm=gen, faiss_tag=a.tag, embed_model=a.embed_model or BASE_EMBEDDING_MODEL)
    cfg = RetrievalConfig()
    OUT.mkdir(parents=True, exist_ok=True)
    aibe = grounded = None
    if not a.skip_aibe:
        aibe = run_aibe(engine, gen, a.aibe_n, cfg); aibe.to_csv(OUT / "aibe.csv", index=False)
    elif (OUT / "aibe.csv").exists():
        aibe = pd.read_csv(OUT / "aibe.csv")
    if not a.skip_grounded:
        grounded = run_grounded(engine, gen, judge, a.bns_n, a.const_n, cfg); grounded.to_csv(OUT / "grounded.csv", index=False)
    elif (OUT / "grounded.csv").exists():
        grounded = pd.read_csv(OUT / "grounded.csv")
    s = summarize(aibe, grounded) | {"generator": GEMINI_MODEL, "judge": JUDGE_MODEL, "faiss_tag": a.tag}
    json.dump(s, open(OUT / "summary.json", "w"), indent=2)
    print(json.dumps(s, indent=2))


if __name__ == "__main__":
    main()
