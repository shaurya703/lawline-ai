#!/usr/bin/env bash
cd "$(dirname "$0")/.." && source .venv/bin/activate && exec uvicorn lawline.api:app --host 0.0.0.0 --port "${PORT:-8000}"
