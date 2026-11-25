"""The figures quoted on the landing page and in the README must be the ones in the result files."""
import json
import pytest
from lawline.config import RESULTS_DIR, ROOT
from lawline.eval import export_facts as x

pytestmark = pytest.mark.skipif(not (RESULTS_DIR / "ablation_ft" / "metrics.csv").exists(), reason="no evaluation results in this checkout")


def test_facts_json_is_current():
    assert json.loads(x.FACTS_PATH.read_text()) == json.loads(json.dumps(x.build())), "run: python -m lawline.eval.export_facts"


def test_readme_results_block_is_current():
    readme = (ROOT / "README.md").read_text()
    assert x.readme_block(x.build()) in readme, "run: python -m lawline.eval.export_facts"


def test_headline_row_is_the_routed_system():
    top = x.build()["benchmark"]["systems"][-1]
    assert top["system"].startswith("LawLine") and 0 < top["r1"] <= top["r5"] <= 1
