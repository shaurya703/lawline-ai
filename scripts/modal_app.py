"""Deploy the LawLine API to Modal (serverless, scale-to-zero).

    modal deploy scripts/modal_app.py

Assets (indices, model, chunks) are pulled once from the public HF dataset into a persistent
Volume; later cold starts read them from the volume. The FastAPI app is served as an ASGI app.
"""
import modal

app = modal.App("lawline-api")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("fastapi[standard]", "sentence-transformers>=3.0", "faiss-cpu", "rank-bm25", "networkx",
                 "numpy", "pandas", "pyarrow", "scikit-learn", "google-genai", "python-dotenv", "pypdf",
                 "huggingface_hub", "tabulate")
    .add_local_python_source("lawline")
    # small metadata the API reads (stats, benchmark tables, AIBE questions, training meta) — copied into the volume at startup
    .add_local_file("data/processed/corpus_stats.json", "/meta/data/processed/corpus_stats.json")
    .add_local_file("data/processed/gold_stats.json", "/meta/data/processed/gold_stats.json")
    .add_local_dir("data/raw/jmukesh99__AIBE_mcq", "/meta/data/raw/jmukesh99__AIBE_mcq")
    .add_local_dir("outputs/results", "/meta/outputs/results", ignore=["**/runs.json", "cache_*", "**/preds*"])
    .add_local_file("outputs/models/lawline-bge-small-legal/train_meta.json", "/meta/outputs/models/lawline-bge-small-legal/train_meta.json")
)
vol = modal.Volume.from_name("lawline-assets", create_if_missing=True)


@app.function(image=image, cpu=2, memory=3072, timeout=600, scaledown_window=1200,
              volumes={"/store": vol}, secrets=[modal.Secret.from_name("lawline-gemini")])
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def api():
    import os
    os.environ["LAWLINE_ROOT"] = "/store"   # data/ and outputs/ live in the persistent volume
    os.environ["LAWLINE_FAISS_TAG"] = "ft"  # serve the fine-tuned index + encoder (the shipped config)
    os.environ["LAWLINE_EMBED_MODEL"] = "/store/outputs/models/lawline-bge-small-legal"
    os.environ.setdefault("HF_HOME", "/store/.hf")
    import shutil
    meta = __import__("pathlib").Path("/meta")
    for f in meta.rglob("*"):
        if f.is_file():
            dst = __import__("pathlib").Path("/store") / f.relative_to(meta)
            if not dst.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dst)
    from lawline.bootstrap import ensure_assets
    ensure_assets(progress=print)
    vol.commit()
    from lawline.api import app as fastapi_app
    return fastapi_app
