"""Unit economics from measured inputs, margin stated without breakage (S0-22).

This replaces the planning model, every input of which was an estimate. The
estimate that mattered most was wrong by 5×: `$0.010 per business cold` against
a measured $0.0168. Nothing here is typed in — every cost comes from a
`benchmark-<market>.json` written by a real run, and the file says so when an
input is missing rather than substituting a plausible number.

Three decisions make this model honest rather than flattering:

**1. No breakage.** Every allowance unit is assumed consumed. Real customers
leave some unused, and counting that is how a thin margin is made to look
healthy — the plan's Change 5 exists because the founding documents leaned on
retention and breakage at the same time, which is having it both ways. If the
margin only works when customers do not use what they paid for, it does not
work.

**2. The allowance is solved for, not assumed.** The plan deliberately fixes
prices ($29 / $79 / $199) and leaves allowances open, because the allowance is
the free variable: given a price and a measured cost, how many units can a tier
include and still clear a margin? Assuming an allowance and reporting the
margin gets the dependency backwards and produces a number nobody can act on.

**3. Four billable units, priced side by side.** The product currently bills
per *business matching every criterion*, and that is the only unit whose cost
depends on the match rate. Measured across three niches:

    per business read      $0.0166  $0.0170  $0.0168   ← varies 2.4%
    per business matched   $0.0294  $0.1374  $0.1787   ← varies 6x

The match rate is the product of one rate per criterion, so it collapses as
criteria are added — 26.0% on a one-criterion market, 6.2% and 5.0% on
two-criterion ones. A product whose flagship query has two criteria cannot
price against a number measured on one. That is an arithmetic property, not an
engine defect, and no amount of accuracy work removes it.

Usage:
    python3 stage0/src/economics/unit_model.py
    python3 stage0/src/economics/unit_model.py --margin 0.75
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from benchmark.run import in_niche  # noqa: E402

DATA = ROOT / "stage0" / "data"
APP = ROOT / "public" / "data"
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"

# The plan's tiers. Prices are fixed and allowances are the free variable, which
# is why this file solves for allowances rather than reading them.
TIERS = [("Free", 0.0), ("Starter", 29.0), ("Growth", 79.0), ("Scale", 199.0)]

# Gross margin to hold. 80% is the SaaS convention and the plan does not name
# one, so it is an input rather than a constant — see --margin.
DEFAULT_MARGIN = 0.80

# Which run to read per market. The dental canonical run predates the
# generic-escalation flip, so its tagged twin is the one that matches the
# shipped engine. Comparing markets across different engines is how the first
# version of this table produced a wrong answer.
RUNS = {
    "dental-phoenix": "benchmark-dental-phoenix-escalate.json",
    "med-spa-dallas": "benchmark-med-spa-dallas.json",
    "hvac-tampa": "benchmark-hvac-tampa.json",
}

UNITS = [
    ("business read", "read",
     "every business whose site we fetched and judged"),
    ("business decided", "decided",
     "every criterion answered match or no_match — the work that produced an answer"),
    ("criterion match", "criterion",
     "every criterion that matched, whether or not the business matched them all"),
    ("business matched", "matched",
     "only businesses matching EVERY criterion — what the product bills today"),
]


def measured(market_id: str) -> dict | None:
    """Read one market's measured run. Returns None rather than guessing."""
    path = DATA / RUNS[market_id]
    if not path.exists():
        return None
    bm = json.loads(path.read_text())
    tag = "-escalate" if "escalate" in path.name else ""
    trace_path = DATA / f"verdict-trace-{market_id}{tag}.json"
    log_path = DATA / f"cost-log-{market_id}{tag}.jsonl"
    if not (trace_path.exists() and log_path.exists()):
        return None

    spec = json.loads(FIXTURES.read_text())
    fixture = next(m for m in spec["markets"] if m["id"] == market_id)
    app = json.loads((APP / f"{market_id}.json").read_text())
    pool = [b for b in app["businesses"]
            if b.get("site") and in_niche(b, fixture["categories"])]
    rng = random.Random(f"20260921:{market_id}")
    rng.shuffle(pool)
    ids = [b["id"] for b in pool[: bm["businesses"]]]

    trace = json.loads(trace_path.read_text())
    cost: Counter = Counter()
    for line in log_path.read_text().splitlines():
        if line.strip():
            r = json.loads(line)
            cost[r["business_id"]] += r["cost_usd"]

    spend = sum(cost.get(i, 0.0) for i in ids)
    counts = {
        "read": sum(1 for i in ids if cost.get(i, 0.0) > 0),
        "decided": sum(1 for i in ids for v in (trace.get(i) or {}).values()
                       if v["verdict"] in ("match", "no_match")),
        "criterion": sum(1 for i in ids for v in (trace.get(i) or {}).values()
                         if v["verdict"] == "match"),
        "matched": sum(1 for i in ids if trace.get(i)
                       and all(v["verdict"] == "match" for v in trace[i].values())),
    }
    return {
        "market": market_id,
        "criteria": len(fixture["criteria"]),
        "businesses": len(ids),
        "spend": spend,
        "counts": counts,
        "cost": {k: (spend / n if n else None) for k, n in counts.items()},
        "match_rate": counts["matched"] / len(ids) if ids else 0.0,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--margin", type=float, default=DEFAULT_MARGIN,
                    help="gross margin to hold, 0-1 (default 0.80)")
    args = ap.parse_args()
    target = args.margin

    runs = {mid: measured(mid) for mid in RUNS}
    missing = [m for m, r in runs.items() if r is None]
    if missing:
        print("Missing measured runs for: " + ", ".join(missing))
        print("Run benchmark/run.py for those markets. This model does not "
              "substitute estimates for measurements.")
        return 1
    rows = list(runs.values())

    print("Unit economics from measured runs — margin WITHOUT breakage")
    print("=" * 72)
    print("\nMeasured inputs (nothing below is typed in):\n")
    print(f"{'market':<16}{'crit':>5}{'biz':>6}{'spend':>8}"
          f"{'per read':>10}{'per decided':>12}{'per crit':>10}{'per matched':>12}"
          f"{'match%':>8}")
    for r in rows:
        c = r["cost"]
        f = lambda k: f"${c[k]:.4f}" if c[k] else "n/a"  # noqa: E731
        print(f"{r['market']:<16}{r['criteria']:>5}{r['businesses']:>6}"
              f"{r['spend']:>8.2f}{f('read'):>10}{f('decided'):>12}"
              f"{f('criterion'):>10}{f('matched'):>12}"
              f"{100*r['match_rate']:>7.1f}%")

    # The spread is the finding. A unit whose cost swings 6x across niches
    # cannot carry a price; one that holds to 2% can.
    print("\nSpread across niches — the property that decides which unit can carry a price:\n")
    for label, key, _ in UNITS:
        vals = [r["cost"][key] for r in rows if r["cost"][key]]
        lo, hi = min(vals), max(vals)
        print(f"  {label:<20} ${lo:.4f} – ${hi:.4f}   {hi/lo:.1f}x spread")

    print(f"\n\nAllowance each tier can include at {100*target:.0f}% gross margin")
    print("(every allowance unit assumed consumed — no breakage)")
    print("=" * 72)
    for label, key, gloss in UNITS:
        vals = [r["cost"][key] for r in rows if r["cost"][key]]
        worst = max(vals)          # price against the worst niche, not the mean
        best = min(vals)
        print(f"\n{label.upper()}  — {gloss}")
        print(f"  cost per unit: ${best:.4f} best niche, ${worst:.4f} worst")
        print(f"  {'tier':<10}{'price':>8}{'units @ worst':>15}{'units @ best':>14}")
        for name, price in TIERS:
            if price == 0:
                # A free tier is pure cost. What matters is what it costs to
                # honour, not what it earns.
                print(f"  {name:<10}{'—':>8}{'(costs ':>15}"
                      f"${worst:.4f}/unit to honour)")
                continue
            budget = price * (1 - target)
            print(f"  {name:<10}${price:>7.0f}{int(budget/worst):>15,}{int(budget/best):>14,}")

    # Computed, not typed. An earlier version quoted the figures in this
    # summary as literals, which meant the prose would keep asserting last
    # week's numbers after a run moved them — the exact failure the rest of
    # this file exists to avoid, reproduced in the part a reader trusts most.
    reads = [r["cost"]["read"] for r in rows]
    matched = [r["cost"]["matched"] for r in rows if r["cost"]["matched"]]
    rates = [r["match_rate"] for r in rows]
    print("\n\nWhat this does and does not settle")
    print("=" * 72)
    print(f"""
SETTLED, from measurement:
  · Cost per business read is ${min(reads):.4f}-${max(reads):.4f} across {len(rows)} niches with
    different categories, criteria counts, readability and match rates
    ({100*min(rates):.1f}%-{100*max(rates):.1f}%). It is the only unit stable enough to price against.
  · Cost per business matched swings {max(matched)/min(matched):.1f}x for the same reason it fails
    the gate: it divides by a match rate that is the product of one rate
    per criterion, so it collapses as criteria are added.

NOT SETTLED, and not settleable here:
  · What a buyer pays per matched lead. Still an open question in the plan
    ("10 customer interviews, pre-launch"), and it is the numerator the
    $0.04 budget was derived from. Until it is answered, gate item 4
    compares a measured cost against an assumed threshold.
  · Weekly re-read cost for alerts. S0-20 has not been run, so the alert
    engine's running cost is unmodelled. Every figure above is
    first-scan-only and UNDERSTATES the cost of a retained customer.
  · Gap-fill discovery at $0.0079/business is measured but not included
    above: it applies only where open data misses a business, and that
    rate is per-niche (HVAC worst at 31-48% coverage).
""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
