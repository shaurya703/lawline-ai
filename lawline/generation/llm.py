"""LLM backends: Groq (primary) -> Gemini (fallback) -> extractive fallback (no key / offline)."""
from __future__ import annotations
import os, re, time
from dataclasses import dataclass
from ..config import GROQ_MODEL, GEMINI_MODEL

import logging; logging.getLogger("google_genai").setLevel(logging.ERROR)


@dataclass
class LLMResponse:
    text: str
    backend: str
    model: str
    latency_ms: float
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    errors: list = None


LLM_TIMEOUT_S = float(os.environ.get("LAWLINE_LLM_TIMEOUT_S", "60"))   # per HTTP call to a model
THINKING = ({"thinking_level": "minimal"}, {"thinking_budget": 0}, None)   # Gemini 3 takes a level, 2.5 a token budget, older models neither
GEMINI_FALLBACKS = [m for m in os.environ.get("LAWLINE_GEMINI_FALLBACKS", "gemini-3.1-flash-lite,gemini-2.5-flash,gemini-flash-lite-latest").split(",") if m]


_HINT = re.compile(r"(?:retry(?:Delay|[ -]in)|try again in)\D*?((?:\d+(?:\.\d+)?(?:h|ms|m|s)?)+)")


def retry_hint(msg: str) -> float | None:
    """Seconds a rate-limit reply asks the caller to wait: Gemini's "retryDelay: '41s'", Groq's '4.47s', '520ms', '2m59.5s'."""
    m = _HINT.search(msg)
    if not m:
        return None
    return sum(float(n) * {"h": 3600, "m": 60, "ms": 0.001}.get(u, 1) for n, u in re.findall(r"(\d+(?:\.\d+)?)(h|ms|m|s)?", m.group(1)))


class LLMClient:
    def __init__(self, backend: str = "auto", temperature: float = 0.1, max_tokens: int = 700, gemini_model: str = GEMINI_MODEL,
                 max_wait_s: float | None = None):
        self.backend = backend
        self.max_wait_s = max_wait_s           # total back-off budget per complete(); None waits as long as the hints ask
        self.gemini_model = gemini_model
        self._gemini_chain = [gemini_model] + [m for m in GEMINI_FALLBACKS if m != gemini_model]
        self._exhausted: set[str] = set()      # models whose per-day quota is gone for this session
        self._thinking: dict[str, int] = {}    # model -> index into THINKING of the form it accepts
        self.temperature = temperature
        self.max_tokens = max_tokens
        self._groq = self._gemini = None
        if os.getenv("GROQ_API_KEY") and backend in ("auto", "groq"):
            try:
                from groq import Groq
                self._groq = Groq(api_key=os.getenv("GROQ_API_KEY"), timeout=LLM_TIMEOUT_S, max_retries=0)
            except Exception:
                self._groq = None
        if os.getenv("GEMINI_API_KEY") and backend in ("auto", "gemini"):
            try:
                from google import genai
                self._gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"), http_options={"timeout": int(LLM_TIMEOUT_S * 1000)})
            except Exception:
                self._gemini = None

    @property
    def available(self) -> list[str]:
        return [n for n, c in (("groq", self._groq), ("gemini", self._gemini)) if c]

    def _call_groq(self, system: str, user: str, max_tokens: int | None = None, json_mode: str | dict | None = None) -> LLMResponse:
        t = time.perf_counter()
        kind = json_mode.get("type") if isinstance(json_mode, dict) else json_mode
        extra = {"response_format": {"type": "json_object"}} if kind == "object" else {}   # Groq's JSON mode is object-only
        r = self._groq.chat.completions.create(
            model=GROQ_MODEL, temperature=self.temperature, max_tokens=max_tokens or self.max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}], **extra)
        u = getattr(r, "usage", None)
        return LLMResponse(r.choices[0].message.content.strip(), "groq", GROQ_MODEL, (time.perf_counter() - t) * 1000,
                           getattr(u, "prompt_tokens", None), getattr(u, "completion_tokens", None))

    def _generate(self, model: str, contents: str, config: dict):
        """One Gemini call with thinking turned as far down as the model allows, so the output budget goes to the answer.
        The models in the fallback chain differ in how that is said; the form a model accepts is remembered."""
        i = self._thinking.get(model, 0)
        while True:
            cfg = config if THINKING[i] is None else {**config, "thinking_config": THINKING[i]}
            try:
                return self._gemini.models.generate_content(model=model, contents=contents, config=cfg)
            except Exception as e:
                if i + 1 == len(THINKING) or getattr(e, "code", None) != 400 or "thinking" not in str(e).lower():
                    raise
                i += 1; self._thinking[model] = i

    def _call_gemini(self, system: str, user: str, max_tokens: int | None = None, json_mode: str | dict | None = None) -> LLMResponse:
        t = time.perf_counter()
        last = None
        config = {"temperature": self.temperature, "max_output_tokens": max_tokens or self.max_tokens}
        if json_mode:
            config["response_mime_type"] = "application/json"
        if isinstance(json_mode, dict):                  # a schema constrains decoding, so the reply always has that shape
            config["response_json_schema"] = json_mode
        for model in self._gemini_chain:
            if model in self._exhausted:
                continue
            try:
                r = self._generate(model, f"{system}\n\n{user}", config)
                if not getattr(r, "text", None):
                    raise RuntimeError(f"{model}: empty response")
                break
            except Exception as e:                       # per-day quota -> move down the chain; per-minute -> let caller back off
                last = e
                if "PerDay" in str(e) or "per day" in str(e).lower():
                    self._exhausted.add(model); continue
                if getattr(e, "code", None) in (503, 504):   # this model is overloaded right now: the next one may not be
                    continue
                raise
        else:
            raise RuntimeError(f"no Gemini model answered: {last}")
        self.gemini_model = model
        return LLMResponse(r.text.strip(), "gemini", model, (time.perf_counter() - t) * 1000,
                           getattr(getattr(r, "usage_metadata", None), "prompt_token_count", None),
                           getattr(getattr(r, "usage_metadata", None), "candidates_token_count", None))

    def complete(self, system: str, user: str, retries: int = 5, max_tokens: int | None = None,
                 json_mode: str | dict | None = None) -> LLMResponse:
        """max_tokens overrides the client default for this call only (the client is shared across request threads).
        json_mode asks the backend for JSON instead of free text: "object" or "array" for valid syntax, or a JSON
        schema for a reply of exactly that shape (enforced by Gemini; Groq only guarantees syntax)."""
        errors = []
        deadline = None if self.max_wait_s is None else time.monotonic() + self.max_wait_s
        order = [("groq", self._call_groq), ("gemini", self._call_gemini)]
        if self.backend == "gemini":
            order.reverse()
        for name, fn in order:
            if getattr(self, f"_{name}") is None:
                continue
            for attempt in range(retries + 1):
                try:
                    resp = fn(system, user, max_tokens, json_mode)
                    resp.errors = list(errors)
                    return resp
                except Exception as e:   # rate limits, network, auth
                    errors.append(f"{name}: {e}")
                    msg = str(e); low = msg.lower()
                    status = getattr(e, "status_code", None) or getattr(e, "code", None)
                    status = status if isinstance(status, int) else None
                    # Gemini reports a bad or expired key as 400, so match its wording as well as the status
                    if status in (401, 403) or "invalid api key" in low or "api key expired" in low or "api key not valid" in low:
                        setattr(self, f"_{name}", None)      # disable dead backend for the rest of the session
                        break
                    # the request itself is wrong or too large, so retrying cannot help; except Groq's JSON mode,
                    # which answers 400 when the model wrote invalid JSON and usually succeeds on the next try
                    if status in (400, 404, 413, 422) and "json_validate_failed" not in msg:
                        break
                    if status == 429 or "RESOURCE_EXHAUSTED" in msg:
                        hint = retry_hint(msg)
                        wait = min(90, hint + 2 if hint is not None else 15.0 * (attempt + 1))
                    else:
                        wait = 1.5 * (attempt + 1)
                    if attempt == retries or (deadline is not None and time.monotonic() + wait > deadline):
                        break                                # interactive caller: try the next backend instead of sleeping
                    time.sleep(wait)
        raise RuntimeError("All LLM backends failed: " + " | ".join(errors[-3:]))


def extractive_answer(passages, why: str = "no LLM backend configured") -> str:
    """Deterministic fallback when no answer is generated: the top passages verbatim, with the reason in the heading."""
    lines = [f"Relevant provisions (extractive mode — {why}):"]
    for p in passages[:3]:
        lines.append(f"[{p.rank}] {p.chunk.citation}: {p.chunk.text[:400].strip()}…")
    lines.append("This is legal information, not legal advice.")
    return "\n".join(lines)
