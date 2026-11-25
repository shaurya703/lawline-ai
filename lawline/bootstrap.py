"""Fetch runtime assets (indices, fine-tuned model, chunk store) from the public HF dataset repo when they are not
present locally — used by hosted deployments that build from the GitHub repo."""
from __future__ import annotations
import os
from pathlib import Path
from .config import ROOT

REPO = os.environ.get("LAWLINE_ASSETS_REPO", "shaurya2121/lawline-ai-assets")
# Branch, tag or commit of the assets repo. Unset = its latest state (the v2 corpus). The v1 corpus (42,868 documents,
# about a third of the memory) is tagged "v1": set LAWLINE_ASSETS_REVISION=v1 on a host that cannot hold v2.
REVISION = os.environ.get("LAWLINE_ASSETS_REVISION") or None
FILES = ["data/processed/chunks.jsonl", "outputs/indices/bm25/bm25.pkl", "outputs/indices/kg/kg.pkl", "outputs/indices/faiss_ft/ids.json", "outputs/indices/faiss_ft/index.faiss"]
CORPUS = "data/processed/corpus.jsonl"      # not needed to serve; needed to rebuild indices or run lawline.eval.landmark_eval
MODEL_DIR = "outputs/models/lawline-bge-small-legal"


def ensure_assets(progress=None, corpus: bool = False) -> None:
    """Download whatever is missing. Files already present are never replaced."""
    missing = [f for f in FILES + ([CORPUS] if corpus else []) if not (ROOT / f).exists()] + ([MODEL_DIR] if not (ROOT / MODEL_DIR / "model.safetensors").exists() else [])
    if not missing:
        return
    from huggingface_hub import hf_hub_download, snapshot_download
    for f in missing:
        if progress: progress(f"downloading {f}…")
        if f == MODEL_DIR:
            snapshot_download(REPO, repo_type="dataset", revision=REVISION, allow_patterns=[f"{MODEL_DIR}/*"], local_dir=str(ROOT))
        else:
            hf_hub_download(REPO, f, repo_type="dataset", revision=REVISION, local_dir=str(ROOT))


if __name__ == "__main__":                  # python -m lawline.bootstrap [--corpus]
    import sys
    ensure_assets(progress=print, corpus="--corpus" in sys.argv)
    print("assets present")
