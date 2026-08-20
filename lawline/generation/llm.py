"""LLM backends: Groq (primary) -> Gemini (fallback) -> extractive fallback (no key / offline)."""
from __future__ import annotations
import os, time
from dataclasses import dataclass
from dotenv import load_dotenv
from ..config import ROOT, GROQ_MODEL, GEMINI_MODEL

load_dotenv(ROOT / ".env")
import logging; logging.getLogger("google_genai").setLevel(logging.ERROR)


@dataclass
class LLMResponse:
    text: str
    backend: str
    model: str
    latency_ms: float
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class LLMClient:
    def __init__(self, backend: str = "auto", temperature: float = 0.1, max_tokens: int = 700, gemini_model: str = GEMINI_MODEL):
        self.backend = backend
        self.gemini_model = gemini_model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self._groq = self._gemini = None
        if os.getenv("GROQ_API_KEY") and backend in ("auto", "groq"):
            try:
                from groq import Groq
                self._groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
            except Exception:
                self._groq = None
        if os.getenv("GEMINI_API_KEY") and backend in ("auto", "gemini"):
            try:
                from google import genai
                self._gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            except Exception:
                self._gemini = None

    @property
    def available(self) -> list[str]:
        return [n for n, c in (("groq", self._groq), ("gemini", self._gemini)) if c]

    def _call_groq(self, system: str, user: str) -> LLMResponse:
        t = time.perf_counter()
        r = self._groq.chat.completions.create(
            model=GROQ_MODEL, temperature=self.temperature, max_tokens=self.max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
        u = getattr(r, "usage", None)
        return LLMResponse(r.choices[0].message.content.strip(), "groq", GROQ_MODEL, (time.perf_counter() - t) * 1000,
                           getattr(u, "prompt_tokens", None), getattr(u, "completion_tokens", None))

    def _call_gemini(self, system: str, user: str) -> LLMResponse:
        t = time.perf_counter()
        r = self._gemini.models.generate_content(
            model=self.gemini_model, contents=f"{system}\n\n{user}",
            config={"temperature": self.temperature, "max_output_tokens": self.max_tokens})
        return LLMResponse(r.text.strip(), "gemini", self.gemini_model, (time.perf_counter() - t) * 1000,
                           getattr(getattr(r, "usage_metadata", None), "prompt_token_count", None),
                           getattr(getattr(r, "usage_metadata", None), "candidates_token_count", None))

    def complete(self, system: str, user: str, retries: int = 2) -> LLMResponse:
        errors = []
        order = [("groq", self._call_groq, self._groq), ("gemini", self._call_gemini, self._gemini)]
        if self.backend == "gemini":
            order.reverse()
        for name, fn, client in order:
            if client is None:
                continue
            for attempt in range(retries + 1):
                try:
                    return fn(system, user)
                except Exception as e:   # rate limits, network
                    errors.append(f"{name}: {e}")
                    time.sleep(1.5 * (attempt + 1))
        raise RuntimeError("All LLM backends failed: " + " | ".join(errors[-3:]))


def extractive_answer(passages) -> str:
    """Deterministic fallback used in tests / offline mode: returns the top passages verbatim with citations."""
    lines = ["Relevant provisions (extractive mode — no LLM backend configured):"]
    for p in passages[:3]:
        lines.append(f"[{p.rank}] {p.chunk.citation}: {p.chunk.text[:400].strip()}…")
    lines.append("This is legal information, not legal advice.")
    return "\n".join(lines)
