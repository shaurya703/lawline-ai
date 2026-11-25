"""Fetch runtime assets (indices, fine-tuned model, chunk store) from the public HF dataset repo when they are not
present locally — used by hosted deployments that build from the GitHub repo."""
from __future__ import annotations
import os
from .config import ROOT

REPO = os.environ.get("LAWLINE_ASSETS_REPO", "shaurya2121/lawline-ai-assets")
# Branch, tag or commit of the assets repo. Unset = the commit of the v2 upload, pinned so that a later push to the repo
# cannot change what a host downloads (and unpickles). The v1 corpus (42,868 documents, about a third of the memory) is
# tagged "v1": set LAWLINE_ASSETS_REVISION=v1 on a host that cannot hold v2.
REVISION = os.environ.get("LAWLINE_ASSETS_REVISION") or "30c6ddddb6800bc45a16c8ad55f8edd17b8bc6a6"
FILES = ["data/processed/chunks.jsonl", "outputs/indices/bm25/bm25.pkl", "outputs/indices/kg/kg.pkl", "outputs/indices/faiss_ft/ids.json", "outputs/indices/faiss_ft/index.faiss"]
CORPUS = "data/processed/corpus.jsonl"      # not needed to serve; needed to rebuild indices or run lawline.eval.landmark_eval
MODEL_DIR = "outputs/models/lawline-bge-small-legal"
# The Bar Exam Trainer's questions come from their own public dataset. Optional: without them only the trainer is empty.
QUIZ_REPO, QUIZ_DIR, QUIZ_FILES = "jmukesh99/AIBE_mcq", "data/raw/jmukesh99__AIBE_mcq", ["train.csv", "test.csv"]


def ensure_assets(progress=None, corpus: bool = False) -> None:
    """Download whatever is missing. Files already present are never replaced."""
    missing = [f for f in FILES + ([CORPUS] if corpus else []) if not (ROOT / f).exists()] + ([MODEL_DIR] if not (ROOT / MODEL_DIR / "model.safetensors").exists() else [])
    quiz = [f for f in QUIZ_FILES if not (ROOT / QUIZ_DIR / f).exists()]
    if not missing and not quiz:
        return
    from huggingface_hub import hf_hub_download, snapshot_download
    for f in missing:
        if progress: progress(f"downloading {f}…")
        if f == MODEL_DIR:
            snapshot_download(REPO, repo_type="dataset", revision=REVISION, allow_patterns=[f"{MODEL_DIR}/*"], local_dir=str(ROOT))
        else:
            hf_hub_download(REPO, f, repo_type="dataset", revision=REVISION, local_dir=str(ROOT))
    for f in quiz:
        try:
            hf_hub_download(QUIZ_REPO, f, repo_type="dataset", local_dir=str(ROOT / QUIZ_DIR))
        except Exception as e:
            if progress: progress(f"bar exam questions not fetched ({f}): {e}")


if __name__ == "__main__":                  # python -m lawline.bootstrap [--corpus]
    import sys
    ensure_assets(progress=print, corpus="--corpus" in sys.argv)
    print("assets present")
