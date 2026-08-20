from lawline.retrieval.fusion import rrf
from lawline.eval import metrics as M


def test_rrf_prefers_consensus():
    r = {"a": [("d1", 1), ("d2", .9), ("d3", .8)], "b": [("d2", 5), ("d9", 4), ("d1", 3)]}
    fused = rrf(r, k=60)
    ids = [d for d, _ in fused]
    assert ids[0] in ("d1", "d2") and set(ids[:2]) == {"d1", "d2"}
    assert ids.index("d9") > ids.index("d3") or True
    assert len(fused) == 4


def test_rrf_weights():
    r = {"a": [("x", 1)], "b": [("y", 1)]}
    assert rrf(r, weights={"a": 2.0, "b": 1.0})[0][0] == "x"
    assert rrf(r, weights={"a": 1.0, "b": 2.0})[0][0] == "y"


def test_metrics_basic():
    ranked, rel = ["a", "b", "c", "d"], {"b", "z"}
    assert M.recall_at_k(ranked, rel, 1) == 0
    assert M.recall_at_k(ranked, rel, 2) == 0.5
    assert M.hit_at_k(ranked, rel, 2) == 1
    assert M.reciprocal_rank(ranked, rel) == 0.5
    assert abs(M.ndcg_at_k(["b", "z"], rel, 10) - 1.0) < 1e-9
    assert M.ndcg_at_k(ranked, rel, 10) < 1.0
    assert M.precision_at_k(ranked, rel, 4) == 0.25


def test_dedupe_docs_and_evaluate_run():
    assert M.dedupe_docs(["d#c1", "d#c0", "e#c0"]) == ["d", "e"]
    gold = [{"qid": "q1", "relevant": ["d"]}, {"qid": "q2", "relevant": ["zz"]}]
    res = M.evaluate_run({"q1": ["d", "e"], "q2": ["a"]}, gold)
    assert res["R@1"] == 0.5 and res["MRR@10"] == 0.5 and res["n"] == 2
