"""Render result CSV/JSON files as Markdown + LaTeX tables (outputs/results/tables/)."""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd
from ..config import RESULTS_DIR, DATA_PROCESSED

OUT = RESULTS_DIR / "tables"
ORDER = ["bm25", "faiss", "kg", "faiss+bm25", "faiss+kg", "bm25+kg", "faiss+bm25+kg", "faiss+rerank", "bm25+rerank",
         "faiss+bm25+rerank", "faiss+bm25+kg+rerank"]
TASK = {"bns_qa": "BNS-QA", "ipc_facts": "IPC-Facts", "const_qa": "Const-QA", "sc_case": "SC-Case", "macro": "Macro"}


def _write(name: str, df: pd.DataFrame, caption: str, label: str, fmt="%.3f"):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.md").write_text(f"**{caption}**\n\n" + df.to_markdown(index=False, floatfmt=".3f") + "\n")
    (OUT / f"{name}.tex").write_text(df.to_latex(index=False, float_format=lambda x: fmt % x, caption=caption, label=label, escape=True))


def ablation_tables(tag: str):
    p = RESULTS_DIR / f"ablation_{tag}" / "metrics.csv"
    if not p.exists():
        return
    df = pd.read_csv(p)
    main = df[(df.task == "macro") & df.config.isin(ORDER)].set_index("config").reindex([c for c in ORDER if c in set(df.config)]).reset_index()
    main = main[["config", "R@1", "R@5", "R@10", "MRR@10", "nDCG@10"]].rename(columns={"config": "Retriever configuration"})
    _write(f"ablation_{tag}", main, f"Retrieval ablation, macro-average over four tasks ({tag} embeddings, n=1,810 queries)", f"tab:ablation_{tag}")
    # per-task nDCG@10 for key configs
    key = [c for c in ("bm25", "faiss", "kg", "faiss+bm25", "faiss+bm25+kg", "faiss+bm25+kg+rerank") if c in set(df.config)]
    piv = df[df.config.isin(key)].pivot(index="config", columns="task", values="R@5").reindex(key)
    piv = piv[[t for t in ("bns_qa", "ipc_facts", "const_qa", "sc_case", "macro") if t in piv.columns]].rename(columns=TASK).reset_index().rename(columns={"config": "Configuration"})
    _write(f"per_task_{tag}", piv, f"Recall@5 per task ({tag} embeddings)", f"tab:per_task_{tag}")
    sweep = df[(df.task == "macro") & df.config.str.contains(r"\[")][["config", "R@1", "R@5", "MRR@10", "nDCG@10"]].rename(columns={"config": "Fusion setting"})
    if len(sweep):
        _write(f"fusion_sweep_{tag}", sweep, f"Fusion-weight / RRF-k sensitivity of the full hybrid without reranking ({tag} embeddings)", f"tab:sweep_{tag}")
    lat = RESULTS_DIR / f"ablation_{tag}" / "latency.json"
    if lat.exists():
        L = json.load(open(lat))
        rows = [{"Stage": k, "mean (ms)": v["mean_ms"], "p50 (ms)": v["p50_ms"], "p95 (ms)": v["p95_ms"]} for k, v in L.items() if k != "embed_batch_total_ms"]
        _write(f"latency_{tag}", pd.DataFrame(rows), f"Per-stage retrieval latency on Apple M-series laptop ({tag})", f"tab:latency_{tag}", fmt="%.1f")


def base_vs_ft():
    b, f = RESULTS_DIR / "ablation_base/metrics.csv", RESULTS_DIR / "ablation_ft/metrics.csv"
    if not (b.exists() and f.exists()):
        return
    b, f = pd.read_csv(b), pd.read_csv(f)
    rows = []
    for cfg in ("faiss", "faiss+bm25", "faiss+bm25+kg", "faiss+bm25+kg+rerank"):
        for task in ("bns_qa", "ipc_facts", "const_qa", "sc_case", "macro"):
            bb = b[(b.config == cfg) & (b.task == task)]; ff = f[(f.config == cfg) & (f.task == task)]
            if len(bb) and len(ff):
                rows.append({"Configuration": cfg, "Task": TASK[task], "nDCG@10 base": bb["nDCG@10"].iloc[0], "nDCG@10 fine-tuned": ff["nDCG@10"].iloc[0],
                             "Δ": ff["nDCG@10"].iloc[0] - bb["nDCG@10"].iloc[0], "R@5 base": bb["R@5"].iloc[0], "R@5 fine-tuned": ff["R@5"].iloc[0]})
    _write("base_vs_finetuned", pd.DataFrame(rows), "Effect of legal-domain fine-tuning of the bi-encoder (bge-small-en-v1.5)", "tab:finetune")


def chunk_table():
    p = RESULTS_DIR / "chunk_sweep.csv"
    if p.exists():
        df = pd.read_csv(p)[["chunk_words", "overlap", "retriever", "n_chunks", "R@5", "MRR@10", "nDCG@10"]]
        _write("chunk_sweep", df, "Chunk-size / overlap sweep on the core sub-corpus", "tab:chunk")


def answer_table():
    p = RESULTS_DIR / "answer_eval" / "summary.json"
    if not p.exists():
        return
    s = json.load(open(p))
    rows = []
    if "aibe" in s:
        rows.append({"Metric": f"AIBE MCQ accuracy (n={s['aibe']['n']})", "Closed-book LLM": s["aibe"]["closed_book_acc"], "LawLine RAG": s["aibe"]["rag_acc"]})
    if "rag" in s:
        for k, lab in (("correctness_mean(0-2)", "Judged correctness (0–2)"), ("faithfulness_mean(0-2)", "Judged faithfulness (0–2)"),
                       ("fully_correct_rate", "Fully-correct rate"), ("fabricated_citation_rate", "Fabricated-citation rate")):
            rows.append({"Metric": lab, "Closed-book LLM": s["closed"][k], "LawLine RAG": s["rag"][k]})
        rows.append({"Metric": "Retrieval hit (gold provision in top-5)", "Closed-book LLM": float("nan"), "LawLine RAG": s["rag"]["retrieval_hit_rate"]})
        rows.append({"Metric": "Gold provision explicitly cited", "Closed-book LLM": float("nan"), "LawLine RAG": s["rag"]["gold_cited_rate"]})
    _write("answer_eval", pd.DataFrame(rows), f"End-to-end answer quality (generator {s.get('generator')}, judge {s.get('judge')})", "tab:answer")


def data_table():
    cs = json.load(open(DATA_PROCESSED / "corpus_stats.json")); gs = json.load(open(DATA_PROCESSED / "gold_stats.json"))
    rows = [{"Component": k, "Count": v} for k, v in cs.items()]
    _write("corpus_stats", pd.DataFrame(rows), "Corpus composition", "tab:corpus", fmt="%d")
    rows = [{"Task": TASK.get(k, k), "Test queries": v["queries"], "Training pairs": v["train_pairs"]} for k, v in gs.items()]
    _write("gold_stats", pd.DataFrame(rows), "Evaluation benchmark", "tab:gold", fmt="%d")


def main():
    for tag in ("base", "ft"):
        ablation_tables(tag)
    base_vs_ft(); chunk_table(); answer_table(); data_table()
    print("tables:", sorted(p.name for p in OUT.glob("*.md")))


if __name__ == "__main__":
    main()
