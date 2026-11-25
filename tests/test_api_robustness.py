"""Regression tests for two API failures seen under the React app: the process dying when two requests ran a model
at the same time, and JSON features (e.g. /argue) failing on replies with a dropped closing brace."""
import threading
import time
import numpy as np
import pytest
from fastapi import HTTPException
from lawline import api_features
from lawline.generation.llm import LLMClient
from lawline.index.embedder import Embedder
from lawline.retrieval.reranker import Reranker


class OverlapProbe:
    """Stands in for a torch model and records whether two threads were ever inside it together."""
    def __init__(self):
        self.inside = 0
        self.overlapped = False
        self._guard = threading.Lock()

    def _enter(self):
        with self._guard:
            self.inside += 1
            self.overlapped |= self.inside > 1
        time.sleep(0.005)
        with self._guard:
            self.inside -= 1

    def encode(self, texts, **kw):
        self._enter()
        return np.zeros((len(texts), 4))

    def predict(self, pairs, **kw):
        self._enter()
        return np.arange(len(pairs), dtype=float)


def test_model_calls_never_overlap_across_threads():
    probe = OverlapProbe()
    emb = Embedder.__new__(Embedder); emb.model = probe; emb.batch_size = 8; emb.use_prefix = False
    rer = Reranker.__new__(Reranker); rer.model = probe

    def work():
        for _ in range(10):
            emb.encode_queries(["q"])
            rer.rerank("q", [("a", "x"), ("b", "y")])
            emb.encode_passages(["p"])

    threads = [threading.Thread(target=work) for _ in range(6)]
    [t.start() for t in threads]; [t.join() for t in threads]
    assert not probe.overlapped


def test_rerank_orders_best_first():
    rer = Reranker.__new__(Reranker); rer.model = OverlapProbe()
    assert [c for c, _ in rer.rerank("q", [("a", "x"), ("b", "y"), ("c", "z")], top_k=2)] == ["c", "b"]


def test_parse_json_tolerates_fences_and_trailing_commas():
    assert api_features.parse_json('```json\n{"a": [1, 2,], }\n```') == {"a": [1, 2]}
    assert api_features.parse_json('Here you go: [{"x": 1}]') == [{"x": 1}]
    assert api_features.parse_json('{"side_a": {"arguments": [1], "side_b": {"arguments": [2]}') is None   # dropped brace
    assert api_features.parse_json("no json here") is None


def test_llm_json_uses_json_mode_and_retries_once(monkeypatch):
    calls = []
    replies = iter(['{"side_a": {"arguments": [1], "side_b": 2}', '{"ok": true}'])

    def fake_llm(system, user, max_tokens=900, json_mode=None):
        calls.append((max_tokens, json_mode))
        return next(replies)

    monkeypatch.setattr(api_features, "llm", fake_llm)
    assert api_features.llm_json("sys", "user", 1800) == {"ok": True}
    assert calls == [(1800, "object"), (1800, "object")]


def test_llm_json_gives_up_after_two_bad_replies(monkeypatch):
    calls = []
    monkeypatch.setattr(api_features, "llm", lambda *a, **k: calls.append(k) or '{"a": [1, 2')
    with pytest.raises(HTTPException) as e:
        api_features.llm_json("sys", "user", kind="array")
    assert e.value.status_code == 502 and "malformed" in e.value.detail
    assert [k["json_mode"] for k in calls] == ["array", "array"]


class FakeGemini:
    def __init__(self):
        self.configs = []
        self.models = self

    def generate_content(self, model, contents, config):
        self.configs.append(config)
        return type("R", (), {"text": '{"ok": true}', "usage_metadata": None})()


def test_per_call_limits_do_not_change_the_shared_client():
    client = LLMClient(backend="none", max_tokens=700)
    client._gemini = fake = FakeGemini()
    client.complete("s", "u", max_tokens=1800, json_mode="object")
    client.complete("s", "u")
    assert client.max_tokens == 700
    assert fake.configs[0]["max_output_tokens"] == 1800 and fake.configs[0]["response_mime_type"] == "application/json"
    assert fake.configs[1]["max_output_tokens"] == 700 and "response_mime_type" not in fake.configs[1]
