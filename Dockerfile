FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 HF_HOME=/app/.hf TOKENIZERS_PARALLELISM=false
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml README.md ./
COPY lawline ./lawline
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -e .
COPY app.py ./
COPY .streamlit/config.toml ./.streamlit/config.toml
# indices + processed chunks are built offline (scripts/build_indices.py) and copied in, with the small files the API serves
COPY data/processed/chunks.jsonl data/processed/corpus_stats.json data/processed/gold_stats.json ./data/processed/
COPY data/raw/jmukesh99__AIBE_mcq ./data/raw/jmukesh99__AIBE_mcq
COPY outputs/indices ./outputs/indices
COPY outputs/models ./outputs/models
COPY outputs/results ./outputs/results
EXPOSE 8000 8501
CMD ["sh", "-c", "uvicorn lawline.api:app --host 0.0.0.0 --port 8000 & streamlit run app.py --server.port 8501 --server.address 0.0.0.0"]
