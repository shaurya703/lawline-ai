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
)
vol = modal.Volume.from_name("lawline-assets", create_if_missing=True)


@app.function(image=image, cpu=2, memory=3072, timeout=600, scaledown_window=1200,
              volumes={"/store": vol}, secrets=[modal.Secret.from_name("lawline-gemini")])
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def api():
    import os
    os.environ["LAWLINE_ROOT"] = "/store"   # data/ and outputs/ live in the persistent volume
    os.environ.setdefault("HF_HOME", "/store/.hf")
    from lawline.bootstrap import ensure_assets
    ensure_assets(progress=print)
    vol.commit()
    from lawline.api import app as fastapi_app
    return fastapi_app
