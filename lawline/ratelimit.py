"""Sliding one-minute budget for the routes that call the language model, so anonymous callers cannot exhaust the
API key's quota. A limit of 0 turns that check off."""
from __future__ import annotations
import os, time, threading
from collections import deque
from fastapi import HTTPException, Request
from . import config as _config     # noqa: F401  loads .env before the limits below are read

PER_MIN = int(os.environ.get("LAWLINE_LLM_PER_MIN", "60"))
GLOBAL_PER_MIN = int(os.environ.get("LAWLINE_LLM_GLOBAL_PER_MIN", "180"))
TRUST_PROXY = os.environ.get("LAWLINE_TRUST_PROXY") == "1"     # only behind a proxy that appends to X-Forwarded-For itself
WINDOW_S = 60.0

_hits: dict[str, deque] = {}
_all: deque = deque()
_lock = threading.Lock()


def reset():
    with _lock:
        _hits.clear(); _all.clear()


def client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for") if TRUST_PROXY else None
    # the last entry is the one the proxy appended; anything before it is whatever the caller chose to send
    return fwd.split(",")[-1].strip() if fwd else (request.client.host if request.client else "unknown")


def llm_budget(request: Request):
    ip, now = client_key(request), time.monotonic()
    with _lock:
        if len(_hits) > 20000:
            for k in [k for k, q in _hits.items() if not q or now - q[-1] > WINDOW_S]:
                del _hits[k]
        q = _hits.setdefault(ip, deque())
        for d in (q, _all):
            while d and now - d[0] > WINDOW_S:
                d.popleft()
        if (PER_MIN > 0 and len(q) >= PER_MIN) or (GLOBAL_PER_MIN > 0 and len(_all) >= GLOBAL_PER_MIN):
            raise HTTPException(429, "Too many requests. Please wait a minute and try again.", headers={"Retry-After": "60"})
        q.append(now); _all.append(now)
