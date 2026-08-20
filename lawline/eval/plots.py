"""Generate all paper / report figures from outputs/results into outputs/figures."""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from ..config import RESULTS_DIR, FIG_DIR

plt.rcParams.update({"font.size": 9, "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 160})
ROUTED = "routed: dense (narrative) | faiss+bm25+kg+rerank (question)"
ORDER = ["bm25", "faiss", "kg", "faiss+bm25", "faiss+kg", "bm25+kg", "faiss+bm25+kg", "faiss+rerank", "bm25+rerank",
         "faiss+bm25+rerank", "faiss+bm25+kg+rerank", ROUTED]
SHORT = {ROUTED: "LawLine\n(routed)"}
TASK_LABEL = {"bns_qa": "BNS-QA", "ipc_facts": "IPC facts→section", "const_qa": "Constitution-QA", "sc_case": "SC case retrieval", "macro": "Macro avg"}


def _load(tag):
    p = RESULTS_DIR / f"ablation_{tag}" / "metrics.csv"
    return pd.read_csv(p) if p.exists() else None


def fig_ablation(tag="base"):
    df = _load(tag)
    if df is None: return
    m = df[df.task == "macro"].set_index("config").reindex([c for c in ORDER if c in set(df.config)])
    fig, ax = plt.subplots(figsize=(7.2, 3.2))
    x = range(len(m)); w = 0.27
    for i, (col, lab) in enumerate((("R@1", "Recall@1"), ("R@5", "Recall@5"), ("nDCG@10", "nDCG@10"))):
        ax.bar([xi + (i - 1) * w for xi in x], m[col], w, label=lab)
    ax.set_xticks(list(x)); ax.set_xticklabels([SHORT.get(c, c) for c in m.index], rotation=35, ha="right"); ax.set_ylim(0, 1); ax.set_ylabel("score (macro over 4 tasks)")
    ax.legend(frameon=False, ncol=3); ax.set_title(f"Retrieval ablation ({tag} embeddings)")
    fig.tight_layout(); fig.savefig(FIG_DIR / f"ablation_{tag}.png"); plt.close(fig)


def fig_per_task(tag="base"):
    df = _load(tag)
    if df is None: return
    tasks = [t for t in ("bns_qa", "ipc_facts", "const_qa", "sc_case") if t in set(df.task)]
    cfgs = [c for c in ("bm25", "faiss", "kg", "faiss+bm25+kg", "faiss+bm25+kg+rerank", ROUTED) if c in set(df.config)]
    fig, ax = plt.subplots(figsize=(7.2, 3.0)); w = 0.8 / len(cfgs)
    for i, c in enumerate(cfgs):
        vals = [df[(df.task == t) & (df.config == c)]["R@5"].iloc[0] for t in tasks]
        ax.bar([j + (i - len(cfgs) / 2 + 0.5) * w for j in range(len(tasks))], vals, w, label=SHORT.get(c, c).replace("\n", " "))
    ax.set_xticks(range(len(tasks))); ax.set_xticklabels([TASK_LABEL[t] for t in tasks]); ax.set_ylim(0, 1); ax.set_ylabel("Recall@5")
    ax.legend(frameon=False, ncol=3, fontsize=7); ax.set_title("Recall@5 per task")
    fig.tight_layout(); fig.savefig(FIG_DIR / f"per_task_{tag}.png"); plt.close(fig)


def fig_base_vs_ft():
    b, f = _load("base"), _load("ft")
    if b is None or f is None: return
    cfgs = [c for c in ("faiss", "faiss+bm25+kg", "faiss+bm25+kg+rerank", ROUTED) if c in set(b.config) & set(f.config)]
    tasks = ["bns_qa", "ipc_facts", "const_qa", "sc_case", "macro"]
    fig, axes = plt.subplots(1, len(cfgs), figsize=(2.0 * len(cfgs), 2.8), sharey=True)
    for ax, c in zip(axes, cfgs):
        bv = [b[(b.task == t) & (b.config == c)]["nDCG@10"].iloc[0] for t in tasks]
        fv = [f[(f.task == t) & (f.config == c)]["nDCG@10"].iloc[0] for t in tasks]
        ax.bar([i - 0.2 for i in range(len(tasks))], bv, 0.4, label="bge-small (base)")
        ax.bar([i + 0.2 for i in range(len(tasks))], fv, 0.4, label="bge-small (legal fine-tuned)")
        ax.set_xticks(range(len(tasks))); ax.set_xticklabels(["BNS", "IPC", "Const", "SC", "macro"], rotation=0, fontsize=7)
        ax.set_title(SHORT.get(c, c).replace("\n", " "), fontsize=8); ax.set_ylim(0, 1)
    axes[0].set_ylabel("nDCG@10"); axes[0].legend(frameon=False, fontsize=6, loc="upper left")
    fig.tight_layout(); fig.savefig(FIG_DIR / "base_vs_finetuned.png"); plt.close(fig)


def fig_latency(tag="ft"):
    p = RESULTS_DIR / f"ablation_{tag}" / "latency.json"
    if not p.exists(): p = RESULTS_DIR / "ablation_base" / "latency.json"
    if not p.exists(): return
    lat = json.load(open(p))
    stages = [("embed_single", "query embed"), ("faiss", "FAISS"), ("bm25", "BM25"), ("kg", "KG")]
    fig, ax = plt.subplots(figsize=(4.2, 2.6))
    ax.bar([l for _, l in stages], [lat[k]["p50_ms"] for k, _ in stages], yerr=[[0] * 4, [lat[k]["p95_ms"] - lat[k]["p50_ms"] for k, _ in stages]], capsize=3)
    ax.set_ylabel("ms (p50, whisker to p95)"); ax.set_title("Per-stage retrieval latency")
    fig.tight_layout(); fig.savefig(FIG_DIR / "latency_stages.png"); plt.close(fig)
    ae = RESULTS_DIR / "answer_eval" / "summary.json"
    if ae.exists():
        s = json.load(open(ae))
        if "rag" in s:
            fig, ax = plt.subplots(figsize=(4.2, 2.4))
            parts = [("retrieval (hybrid+rerank)", s["rag"]["mean_retrieval_ms"]), ("LLM generation", s["rag"]["mean_generation_ms"])]
            ax.barh([p for p, _ in parts], [v for _, v in parts]); ax.set_xlabel("mean ms per query"); ax.set_title("End-to-end latency breakdown")
            fig.tight_layout(); fig.savefig(FIG_DIR / "latency_e2e.png"); plt.close(fig)


def fig_chunk_sweep():
    p = RESULTS_DIR / "chunk_sweep.csv"
    if not p.exists(): return
    df = pd.read_csv(p)
    fig, ax = plt.subplots(figsize=(4.6, 2.8))
    for name, g in df.groupby("retriever"):
        ax.plot(g.chunk_words, g["R@5"], marker="o", label=name)
    ax.set_xlabel("chunk size (words)"); ax.set_ylabel("Recall@5 (macro)"); ax.set_title("Chunk-size sweep (core sub-corpus)")
    ax.legend(frameon=False); fig.tight_layout(); fig.savefig(FIG_DIR / "chunk_sweep.png"); plt.close(fig)


def fig_answer_eval():
    p = RESULTS_DIR / "answer_eval" / "summary.json"
    if not p.exists(): return
    s = json.load(open(p))
    fig, axes = plt.subplots(1, 2, figsize=(6.4, 2.6))
    if "aibe" in s:
        axes[0].bar(["closed-book", "RAG (ours)"], [s["aibe"]["closed_book_acc"], s["aibe"]["rag_acc"]], color=["#999", "#2b6cb0"])
        axes[0].set_ylim(0, 1); axes[0].set_title(f"AIBE MCQ accuracy (n={s['aibe']['n']})")
        for i, v in enumerate([s["aibe"]["closed_book_acc"], s["aibe"]["rag_acc"]]): axes[0].text(i, v + 0.02, f"{v:.1%}", ha="center")
    if "rag" in s:
        labels = ["correctness", "faithfulness", "fabricated cit."]
        cb = [s["closed"]["correctness_mean(0-2)"] / 2, s["closed"]["faithfulness_mean(0-2)"] / 2, s["closed"]["fabricated_citation_rate"]]
        rg = [s["rag"]["correctness_mean(0-2)"] / 2, s["rag"]["faithfulness_mean(0-2)"] / 2, s["rag"]["fabricated_citation_rate"]]
        x = range(3); axes[1].bar([i - 0.2 for i in x], cb, 0.4, label="closed-book", color="#999"); axes[1].bar([i + 0.2 for i in x], rg, 0.4, label="RAG (ours)", color="#2b6cb0")
        axes[1].set_xticks(list(x)); axes[1].set_xticklabels(labels); axes[1].set_ylim(0, 1); axes[1].legend(frameon=False, fontsize=7)
        axes[1].set_title(f"Judged answer quality (n={s['rag']['n']})")
    fig.tight_layout(); fig.savefig(FIG_DIR / "answer_eval.png"); plt.close(fig)


def fig_reranker_variants():
    f, l = _load("ft"), None
    p = RESULTS_DIR / "ablation_ft_legalce" / "metrics.csv"
    if f is None or not p.exists(): return
    l = pd.read_csv(p)
    tasks = ["bns_qa", "ipc_facts", "const_qa", "sc_case", "macro"]
    variants = [("no reranker", f, "faiss+bm25+kg"), ("generic CE", f, "faiss+bm25+kg+rerank"), ("legal CE (1 ep)", l, "faiss+bm25+kg+rerank"),
                ("dense only", f, "faiss"), ("routed (ours)", f, ROUTED)]
    fig, ax = plt.subplots(figsize=(7.2, 3.0)); w = 0.8 / len(variants)
    for i, (lab, src, cfg) in enumerate(variants):
        vals = [src[(src.task == t) & (src.config == cfg)]["R@5"].iloc[0] for t in tasks]
        ax.bar([j + (i - len(variants) / 2 + 0.5) * w for j in range(len(tasks))], vals, w, label=lab)
    ax.set_xticks(range(len(tasks))); ax.set_xticklabels([TASK_LABEL[t] for t in tasks]); ax.set_ylim(0, 1); ax.set_ylabel("Recall@5")
    ax.legend(frameon=False, ncol=5, fontsize=7); ax.set_title("Reranking strategies on fine-tuned embeddings")
    fig.tight_layout(); fig.savefig(FIG_DIR / "reranker_variants.png"); plt.close(fig)


def fig_training_curve():
    fig, ax = plt.subplots(figsize=(4.6, 2.4))
    for name, lab in (("lawline-bge-small-legal", "bi-encoder (MNRL)"), ("lawline-reranker-legal", "cross-encoder (BCE)")):
        p = Path(f"outputs/models/{name}/train_meta.json")
        if p.exists():
            h = json.load(open(p))["loss_history"]; ax.plot([x["step"] for x in h], [x["loss"] for x in h], label=lab)
    ax.set_xlabel("step"); ax.set_ylabel("loss"); ax.set_title("Fine-tuning loss"); ax.legend(frameon=False)
    fig.tight_layout(); fig.savefig(FIG_DIR / "training_loss.png"); plt.close(fig)


def main():
    for tag in ("base", "ft"):
        fig_ablation(tag); fig_per_task(tag)
    fig_base_vs_ft(); fig_reranker_variants(); fig_latency(); fig_chunk_sweep(); fig_answer_eval(); fig_training_curve()
    print("figures:", sorted(p.name for p in FIG_DIR.glob("*.png")))


if __name__ == "__main__":
    main()
