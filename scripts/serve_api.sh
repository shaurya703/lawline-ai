#!/usr/bin/env bash
# Runs the LawLine API as a long-lived service (used by launchd). caffeinate keeps the Mac from idle-sleeping while it runs.
cd "$(dirname "$0")/.." && source .venv/bin/activate
exec caffeinate -i -s uvicorn lawline.api:app --host 0.0.0.0 --port "${PORT:-8000}"
