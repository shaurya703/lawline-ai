#!/usr/bin/env bash
cd "$(dirname "$0")/.." && source .venv/bin/activate && exec streamlit run app.py --server.port "${PORT:-8501}"
