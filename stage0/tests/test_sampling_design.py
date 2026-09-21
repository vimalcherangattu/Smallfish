"""A labelled set carries its sampling design, and the scorer obeys it.

Precision and recall need *different* samples, and the difference is not a
matter of size:

- **Recall** needs a complete slice. The true matches the engine missed are, by
  definition, absent from the engine's output, so a sample drawn from that
  output cannot find them.
- **Precision** is already conditioned on "the engine said match", so sampling
  on the same condition changes nothing about it — and it is ~11x cheaper.
  Measured: 70 randomly sampled businesses bought 6 positive calls and a
  43.6-97.0% interval; deciding the 90% gate at a true 95% needs ~127 positive
  calls, which is ~2,200 random businesses and is never going to be labelled.

So `--enrich` exists, and the danger it creates is a file that looks exactly
like a normal labelled set and silently reports an inflated recall. Recall from
an enriched sample is not noisy, it is structurally wrong, and it reads HIGH —
the direction that gets believed. The design therefore travels inside the
exported file, and the scorer refuses rather than trusting the operator to
remember which file is which.

    python3 stage0/tests/test_sampling_design.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

FIXTURES = ROOT / "stage0" / "fixtures"
DATA = ROOT / "stage0" / "data"

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def run_scorer(market: str) -> str:
    proc = subprocess.run(
        [sys.executable, str(ROOT / "stage0/src/benchmark/score.py"), "--market", market],
        capture_output=True, text=True,
    )
    return proc.stdout + proc.stderr


def with_design(market: str, design, body):
    """Temporarily rewrite a real labels file's design, then restore it."""
    path = FIXTURES / f"labels-{market}.json"
    original = path.read_text()
    try:
        payload = json.loads(original)
        if design is None:
            payload.pop("design", None)
        else:
            payload["design"] = design
        path.write_text(json.dumps(payload))
        return body()
    finally:
        path.write_text(original)


def main() -> int:
    market = "dental-phoenix"
    if not (FIXTURES / f"labels-{market}.json").exists() or \
       not (DATA / f"verdicts-{market}.json").exists():
        print("  skip  no labelled set and verdicts on disk to score")
        return 0

    # --- a complete slice reports both metrics
    out = with_design(market, None, lambda: run_scorer(market))
    check("a set with no design recorded is treated as a complete slice",
          "Recall, DELIVERED" in out and "not computable" not in out)
    check("and reports precision too", "Precision, blended" in out)

    out = with_design(market, {"sampling": "complete_slice", "n": 70},
                      lambda: run_scorer(market))
    check("an explicit complete_slice reports recall", "Recall, DELIVERED" in out)

    # --- an enriched sample reports precision and REFUSES recall
    enriched = {
        "sampling": "enriched_on_engine_positives",
        "n": 70, "positives": 40, "filler": 30,
        "valid_for": ["precision"], "invalid_for": ["recall"],
        "why": "the misses are absent by construction",
    }
    out = with_design(market, enriched, lambda: run_scorer(market))
    check("an enriched set still reports precision",
          "Precision, blended" in out,
          "precision is conditioned on engine-positive either way")
    check("an enriched set does NOT report a delivered recall figure",
          "not computable from this sample" in out)
    check("and does not sneak it back via the decided-only diagnostic",
          "Recall, decided-only" not in out)
    check("and says why, not just that it refused",
          "absent by construction" in out)
    check("and says the sampling out loud at the top",
          "ENRICHED" in out)
    check("the refusal is recorded in the scored output, not only printed",
          json.loads((DATA / f"score-{market}.json").read_text())
          .get("recall_reported") is False)

    # --- the builder records the design it actually used
    from benchmark.labelling_set import build_tasks  # noqa: E402

    _, _, design = build_tasks(market, 10, 20260921)
    check("a normal build records complete_slice",
          design["sampling"] == "complete_slice")

    _, _, design = build_tasks(market, 10, 20260921, enrich=True)
    check("an enriched build records that it is enriched",
          design["sampling"] == "enriched_on_engine_positives")
    check("and names what it must not be used for",
          design.get("invalid_for") == ["recall"])

    # --- blindness: the engine's verdict must not reach the labeller
    tasks, _, _ = build_tasks(market, 10, 20260921, enrich=True)
    blob = json.dumps(tasks)
    check("no engine verdict leaks into an enriched task file",
          not any(k in blob for k in ('"verdict"', '"settled_by"', '"raw_model"')),
          "a labeller who can see the verdict agrees with it")

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
