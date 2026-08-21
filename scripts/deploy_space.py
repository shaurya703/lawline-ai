"""Deploy the app to a Hugging Face Space (Streamlit SDK). Needs HF_TOKEN (write) and GEMINI_API_KEY in the environment.
Usage: HF_TOKEN=hf_xxx python scripts/deploy_space.py --space <user>/lawline-ai"""
import argparse, os, tempfile, shutil
from pathlib import Path
from huggingface_hub import HfApi

ap = argparse.ArgumentParser(); ap.add_argument("--space", required=True); ap.add_argument("--private", action="store_true"); a = ap.parse_args()
api = HfApi(token=os.environ["HF_TOKEN"]); root = Path(__file__).resolve().parent.parent
api.create_repo(a.space, repo_type="space", space_sdk="streamlit", private=a.private, exist_ok=True)
# secrets / variables
if os.environ.get("GEMINI_API_KEY"):
    api.add_space_secret(a.space, "GEMINI_API_KEY", os.environ["GEMINI_API_KEY"])
api.add_space_variable(a.space, "LAWLINE_FAISS_TAG", "ft"); api.add_space_variable(a.space, "LAWLINE_EMBED_MODEL", "outputs/models/lawline-bge-small-legal")
api.add_space_variable(a.space, "TOKENIZERS_PARALLELISM", "false")
readme = f"""---
title: LawLine AI
emoji: ⚖️
colorFrom: blue
colorTo: purple
sdk: streamlit
sdk_version: "1.40.1"
python_version: "3.12"
app_file: app.py
pinned: true
license: mit
short_description: Grounded legal research for Indian law (hybrid RAG + knowledge graph)
---
# LawLine AI
Knowledge-graph-augmented hybrid retrieval for Indian law with cited, grounded answers. Source: https://github.com/shaurya703/lawline-ai
"""
stage = Path(tempfile.mkdtemp()); (stage / "README.md").write_text(readme)
for rel in ["app.py", "requirements.txt", "lawline", "outputs/indices/bm25", "outputs/indices/kg", "outputs/indices/faiss_ft", "outputs/models/lawline-bge-small-legal",
            "outputs/results", "outputs/figures", "data/processed/chunks.jsonl", "data/processed/corpus_stats.json", "data/processed/gold_stats.json"]:
    src = root / rel; dst = stage / rel
    if src.is_dir():
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "checkpoints", "runs.json", "cache_*", "*.pyc"))
    elif src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, dst)
(stage / ".gitattributes").write_text("*.faiss filter=lfs diff=lfs merge=lfs -text\n*.pkl filter=lfs diff=lfs merge=lfs -text\n*.safetensors filter=lfs diff=lfs merge=lfs -text\n*.jsonl filter=lfs diff=lfs merge=lfs -text\n*.json filter=lfs diff=lfs merge=lfs -text\n*.png filter=lfs diff=lfs merge=lfs -text\n*.csv filter=lfs diff=lfs merge=lfs -text\n")
size = sum(f.stat().st_size for f in stage.rglob("*") if f.is_file()) / 1e6; print(f"staging {size:.0f} MB -> {a.space}")
api.upload_folder(repo_id=a.space, repo_type="space", folder_path=str(stage), commit_message="Deploy LawLine AI", ignore_patterns=["__pycache__/*"])
print("deployed: https://huggingface.co/spaces/" + a.space)
