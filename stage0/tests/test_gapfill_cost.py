"""Tests for the gap-fill cost model (S0-04b) — the arithmetic gate item 1 turns on.

This module decides whether the plan's escape clause holds, and it had no test
at all until the day a bug was found in it by reading: `measured[market] = ...`
in a loop over an unordered `glob`, with **two runs on disk for
`dental-phoenix`** — a baseline at $0.00345 per business and an `-escalate`
variant at $0.00763, 2.2x dearer. Which one reached the gate verdict was
decided by filesystem order.

The verdict did not change (med spa, the binding market, has one run), which is
exactly why it could have sat there indefinitely: a number chosen by accident
that happens to agree with the number chosen on purpose is indistinguishable
from a correct one until the day it is not.

Run:  python3 stage0/tests/test_gapfill_cost.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.gapfill_cost import (  # noqa: E402
    BUDGET_PER_MATCH,
    dearest_per_market,
)

failures: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'pass' if cond else 'FAIL'}  {name}")
    if not cond:
        failures.append(name)


print("\n=== the dearest run wins, and it is not an accident of ordering")

# The real shape: dental has two runs, and the cheap one is listed first.
runs = {
    "dental-phoenix": [(0.00345, "benchmark-dental-phoenix"),
                       (0.00763, "benchmark-dental-phoenix-escalate")],
    "med-spa-dallas": [(0.00847, "benchmark-med-spa-dallas")],
}
picked = dearest_per_market(runs)
check("two runs for one market resolve to the dearer", picked["dental-phoenix"] == 0.00763)
check("a market with one run keeps it", picked["med-spa-dallas"] == 0.00847)

# Order must not matter. This is the actual regression: the old code took
# whichever came last.
reversed_runs = {m: list(reversed(rs)) for m, rs in runs.items()}
check(
    "reversing the order on disk changes nothing",
    dearest_per_market(reversed_runs) == picked,
)

check("a market with no priced run is dropped, not defaulted to zero",
      "x" not in dearest_per_market({"x": []}))

print("\n=== the conservative choice is the dearer one, in both directions")

# Guard the *direction*. `min` would pass every test above that only checks
# "deterministic", and would quietly argue the model's conclusion for it.
check(
    "picking the cheaper run would lower the bill, so it must not be what happens",
    dearest_per_market({"m": [(0.001, "cheap"), (0.009, "dear")]})["m"] == 0.009,
)

print("\n=== the budget the verdict is read against")

check("the budget is $0.04 per match, as gate item 1 states",
      BUDGET_PER_MATCH == 0.04)

print("\n=== the committed numbers still say what the report says")

# `docs/stage0-coverage-report.md` §7b quotes these. If a re-run moves them,
# this fails and the report has to be updated with it — a measurement quoted
# in prose and nowhere else is a measurement that silently goes stale.
path = ROOT / "stage0" / "data" / "gapfill-cost.json"
if not path.exists():
    print("  SKIP  gapfill-cost.json absent; run engine/gapfill_cost.py")
    raise SystemExit(2)

rows = {r["market"]: r for r in json.loads(path.read_text())}

check("med spa is the binding market and it is over budget",
      rows["med-spa-dallas"]["total_per_match"] > BUDGET_PER_MATCH)
check("dental clears the budget cold",
      rows["dental-phoenix"]["total_per_match"] <= BUDGET_PER_MATCH)
check("hvac clears the budget cold",
      rows["hvac-tampa"]["total_per_match"] <= BUDGET_PER_MATCH)

# The claim in §7b that is easiest to get wrong and most load-bearing: med spa
# is marginal on *reading* alone, so coverage is not what breaks it.
med = rows["med-spa-dallas"]
check(
    "med spa's read-per-match alone is under budget — the gap-fill tips it over",
    med["read_per_match"] <= BUDGET_PER_MATCH,
)
check(
    "and its reading costs more than its gap-fill, which is the point of that note",
    med["read_per_match"] > med["discovery_per_match"],
)

# HVAC has the worst coverage in the benchmark and still clears the budget.
check(
    "the worst-covered market is not the failing one",
    rows["hvac-tampa"]["coverage_strict"] < rows["med-spa-dallas"]["coverage_strict"]
    and rows["hvac-tampa"]["total_per_match"] <= BUDGET_PER_MATCH,
)

print(f"\n{len(failures)} failure(s)")
sys.exit(1 if failures else 0)
