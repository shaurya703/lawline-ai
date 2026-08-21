"""Fetch runtime assets (indices, fine-tuned model, chunk store) from the public HF dataset repo when they are not
present locally — used by hosted deployments that build from the GitHub repo."""
from __future__ import annotations
import os
from pathlib import Path
from .config import ROOT

REPO = os.environ.get("LAWLINE_ASSETS_REPO", "shaurya2121/lawline-ai-assets")
FILES = ["data/processed/chunks.jsonl", "outputs/indices/bm25/bm25.pkl", "outputs/indices/kg/kg.pkl", "outputs/indices/faiss_ft/ids.json", "outputs/indices/faiss_ft/index.faiss"]
MODEL_DIR = "outputs/models/lawline-bge-small-legal"


def ensure_assets(progress=None) -> None:
    missing = [f for f in FILES if not (ROOT / f).exists()] + ([MODEL_DIR] if not (ROOT / MODEL_DIR / "model.safetensors").exists() else [])
    if not missing:
        return
    from huggingface_hub import hf_hub_download, snapshot_download
    for f in missing:
        if progress: progress(f"downloading {f}…")
        if f == MODEL_DIR:
            snapshot_download(REPO, repo_type="dataset", allow_patterns=[f"{MODEL_DIR}/*"], local_dir=str(ROOT))
        else:
            hf_hub_download(REPO, f, repo_type="dataset", local_dir=str(ROOT))
