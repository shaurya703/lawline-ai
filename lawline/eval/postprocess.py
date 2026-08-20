"""Derive the query-type-routed system row from saved ablation runs (no recomputation)."""
from __future__ import annotations
import json, sys
import numpy as np
import pandas as pd
from ..config import RESULTS_DIR, ROUTE_WORDS
from .gold import load_gold
from .metrics import evaluate_run

ROUTED = "routed: dense (narrative) | faiss+bm25+kg+rerank (question)"


def add_routed(name: str, narrative_cfg="faiss", question_cfg="faiss+bm25+kg+rerank"):
    d = RESULTS_DIR / name
    runs = json.load(open(d / "runs.json")); gold = load_gold()
    routed = {g["qid"]: (runs[narrative_cfg] if len(g["query"].split()) > ROUTE_WORDS else runs[question_cfg]).get(g["qid"], []) for g in gold}
    runs[ROUTED] = routed
    json.dump(runs, open(d / "runs.json", "w"))
    df = pd.read_csv(d / "metrics.csv"); df = df[df.config != ROUTED]
    tasks = sorted({g["task"] for g in gold}); rows = []
    per = {t: evaluate_run(routed, [g for g in gold if g["task"] == t]) for t in tasks}
    for t, mm in per.items():
        rows.append({"config": ROUTED, "task": t, **mm})
    rows.append({"config": ROUTED, "task": "macro", **{m: float(np.mean([per[t][m] for t in tasks])) for m in per[tasks[0]] if m != "n"}, "n": len(gold)})
    df = pd.concat([df, pd.DataFrame(rows)], ignore_index=True); df.to_csv(d / "metrics.csv", index=False)
    print(name, df[(df.config == ROUTED)][["task", "R@1", "R@5", "nDCG@10"]].round(3).to_string(index=False))


if __name__ == "__main__":
    for n in sys.argv[1:] or ["ablation_base", "ablation_ft"]:
        add_routed(n)
