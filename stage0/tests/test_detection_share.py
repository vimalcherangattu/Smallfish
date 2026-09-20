"""Tests for the S0-10 detection-share measurement.

The bug worth pinning here was found by reading the first run's output, not by
a test. Coverage was inferred from `needs_model == 0`, which is true of an
*absence* criterion with no detector — the absence rule answers couldn't-tell
rather than needs-model, so a criterion that can never be settled looked like a
covered one performing badly, and it dragged the reported range from 56.0–57.4%
down to a meaningless 0.0–57.4%.

    python3 stage0/tests/test_detection_share.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.check_plan import plan_for_criterion  # noqa: E402
from engine.detection_share import NEEDS_MODEL, SETTLED, UNSETTLED  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def main() -> int:
    # --- the buckets are what the cost lever actually means
    check("only match and no_match count as settled", SETTLED == {"match", "no_match"})
    check(
        "couldn't-tell and blocked are not settled",
        "couldnt_tell" in UNSETTLED and "blocked" in UNSETTLED,
        "an honest non-answer is not a saved model call, it is an unanswered criterion",
    )
    check("the buckets do not overlap", not (SETTLED & UNSETTLED | SETTLED & NEEDS_MODEL))

    # --- coverage comes from the engine, and distinguishes the three states
    booking = plan_for_criterion("no_online_booking", "has no online booking", "absence")
    check("an absence criterion with a detector is covered", bool(booking.tech_families))
    check(
        "and is still never settleable without a model in principle",
        not booking.settleable_without_model,
        "absence of a signal is not proof of absence — see absence.py",
    )

    independent = plan_for_criterion("independent", "is independent, not part of a group", "absence")
    check(
        "an absence criterion with no detector is NOT counted as covered",
        not independent.tech_families,
        "this is the bug: it reports couldn't-tell, never needs_model, so "
        "nothing flags it as uncoverable",
    )

    botox = plan_for_criterion("offers_botox", "offers Botox", "presence")
    check("an uncatalogued presence criterion has no detector", not botox.tech_families)

    # --- the measured numbers exist and are the ones recorded in the plan
    import json

    data = ROOT / "stage0" / "data" / "detection-share.json"
    check("the measurement has been run and stored", data.exists(), str(data))
    if data.exists():
        rows = json.loads(data.read_text())
        check("every row records whether a detector exists", all("detector" in r for r in rows))
        covered = [r for r in rows if r["detector"] and r["attempted"]]
        check(
            "every detector-covered criterion settles a majority",
            all(r["settled_pct"] > 50 for r in covered),
            f"{[(r['criterion'], r['settled_pct']) for r in covered]}",
        )
        dead = [r for r in rows if not r["detector"] and r["type"] == "absence"]
        check(
            "an uncoverable absence criterion settles nothing at all",
            all(r["settled"] == 0 for r in dead),
        )

    print("\n" + "=" * 50)
    if failures:
        print(f"{len(failures)} failure(s): {', '.join(failures)}")
        return 1
    print("Detection share measured correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
