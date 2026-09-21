"""Cost the gap-fill, which is gate item 1's own escape clause (S0-04b).

Gate item 1 does not say "open data must be enough". It says:

    Open-data overlap >= 70% of Google's places per niche **(or a costed
    gap-fill plan that keeps blended cost per match <= $0.04)**.

That parenthesis is the whole question now. S0-04 measured that Overture holds
73-86% of veterinary, 64-94% of dental, 45-79% of med spas and **31-48% of
HVAC**. So for at least one named benchmark niche, open data alone is not
enough, and the plan's response is not to drop the niche — it is to price the
alternative and check it against the unit economics.

This module does that arithmetic from measured inputs only:

- **Discovery cost** comes from the S0-04 run: requests spent, places returned.
- **Read cost** comes from the S0-17 benchmark runs (`benchmark-*.json`), per
  market, falling back to the planning estimate only where none has run.
- **Match rate** comes from the measured tallies in `public/data/index.json`.

This module earned its keep by being wrong first. Run against the $0.010
planning estimate it reported every market over budget and called the escape
clause failed — and said so with the estimate labelled, rather than presenting
the verdict as settled. Metering the read (S0-17) put it at ~$0.0015, five
times lower, and the verdict reversed. A cost model whose inputs are half
measured and half guessed has to say which is which, or it launders a guess
into a decision.

Usage:
    python3 stage0/src/engine/gapfill_cost.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "stage0" / "data"
APP = ROOT / "public" / "data"

# Planning estimate from PROJECT_PLAN.md. Used only where no metered run
# exists for a market — `benchmark-<market>.json` overrides it, and S0-17
# measured it five times lower than this.
COLD_READ_PER_BUSINESS = 0.010
WARM_READ_PER_BUSINESS = 0.002
BUDGET_PER_MATCH = 0.04


def main() -> int:
    base_path = DATA / "google-baseline.json"
    if not base_path.exists():
        raise SystemExit(f"Missing {base_path}. Run google_baseline.py first.")
    base = json.loads(base_path.read_text())

    index = json.loads((APP / "index.json").read_text())
    tallies = {m["id"]: m for m in index["markets"]}

    # Measured read cost per market, where S0-17 has run. This is the whole
    # point of metering: the first version of this model reported a failing
    # verdict off the planning estimate, and the estimate was 5x high.
    measured: dict[str, float] = {}
    for f in DATA.glob("benchmark-*.json"):
        b = json.loads(f.read_text())
        if b.get("cost", {}).get("cost_per_business"):
            measured[b["market"]] = b["cost"]["cost_per_business"]
    blended = sum(measured.values()) / len(measured) if measured else None

    # --- discovery: what one Google-discovered business actually costs.
    # Measured directly: every request in the S0-04 run, against every place it
    # returned (on-niche and off, because both were paid for).
    reqs = sum(r["requests"] for r in base)
    places = sum(r["google_places"] + r["off_niche_dropped"] for r in base)
    price_per_request = 0.032
    per_place = reqs * price_per_request / places if places else 0.0

    print("GAP-FILL COST — gate item 1's escape clause\n")
    if measured:
        print("Read cost per business — MEASURED (S0-17):")
        for k, v in sorted(measured.items()):
            print(f"  {k:18} ${v:.5f}")
        if blended:
            print(f"  {'blended (others)':18} ${blended:.5f}   "
                  f"vs ${COLD_READ_PER_BUSINESS:.3f} planning estimate\n")
    print(f"Discovery, measured on the S0-04 run:")
    print(f"  {reqs} requests returned {places} places "
          f"→ ${per_place:.4f} per business discovered")
    print(f"  (Only the ones Overture lacks need buying, so this is an upper bound.)\n")

    w = max(len(r["market"]) for r in base)
    print(f"{'market'.ljust(w)}  cover  match%  disc/match  read/match  TOTAL   vs $0.04")

    rows = []
    for r in base:
        mid = r["market"]
        # Worst case: assume every ambiguous place is genuinely missing, so the
        # gap-fill has to buy as many as possible. The flattering assumption
        # would quietly shrink the bill.
        coverage = r["coverage_strict"]
        missing_share = max(0.0, 1.0 - coverage)

        # Match rate: of the businesses judged in this market, how many matched?
        m = tallies.get(mid)
        matched = judged = 0
        if m:
            for cid, t in m["tallies"].items():
                matched += t.get("match", 0)
                judged += t.get("match", 0) + t.get("no_match", 0) + t.get("couldnt_tell", 0)
        match_rate = matched / judged if judged else 0.0
        if not match_rate:
            rows.append((mid, coverage, 0.0, None, None, None))
            continue

        # Every business read costs a read; only a fraction become matches, and
        # the cost of the non-matches is carried by the matches. That is what
        # "cost per match" means and it is where naive models go wrong.
        read_cost = measured.get(mid, blended or COLD_READ_PER_BUSINESS)
        read_per_match = read_cost / match_rate
        # Gap-fill only buys the businesses Overture is missing.
        disc_per_match = per_place * missing_share / match_rate
        total = read_per_match + disc_per_match
        rows.append((mid, coverage, match_rate, disc_per_match, read_per_match, total))

    for mid, cov, mr, disc, read, total in rows:
        if total is None:
            print(f"{mid.ljust(w)}  {100*cov:>4.0f}%   n/a   "
                  f"        —           —       —   (no judged criteria yet)")
            continue
        verdict = "OK" if total <= BUDGET_PER_MATCH else "OVER"
        print(f"{mid.ljust(w)}  {100*cov:>4.0f}%  {100*mr:>4.1f}%  "
              f"${disc:>9.4f}  ${read:>9.4f}  ${total:>5.3f}  {verdict}")

    priced = [r for r in rows if r[5] is not None]
    if priced:
        worst = max(priced, key=lambda r: r[5])
        print(f"\nWorst market: {worst[0]} at ${worst[5]:.3f} per match "
              f"against a ${BUDGET_PER_MATCH:.2f} budget.")
        if worst[5] <= BUDGET_PER_MATCH:
            print("Gate item 1's escape clause HOLDS: buying the coverage gap from "
                  "Google\nkeeps cost per match inside budget, in every measured "
                  "market including\nthe one where open data fails outright.")
        else:
            print("Gate item 1's escape clause FAILS: even with gap-fill, cost per "
                  "match\nexceeds budget. That would be the genuine no-go.")

    # --- sensitivity. The total is dominated by read cost / match rate, and
    # read cost is the one input nobody has metered. Reporting a pass/fail off
    # a guessed number would be the same mistake as trusting an unverified
    # probe figure, so the guess is stress-tested instead.
    if priced:
        print("\nSENSITIVITY — cold column now uses the measured read cost.\n")
        print(f"{'market'.ljust(w)}   cold read   warm read   break-even read cost")
        for mid, cov, mr, disc, _read, _total in priced:
            rc = measured.get(mid, blended or COLD_READ_PER_BUSINESS)
            warm_total = WARM_READ_PER_BUSINESS / mr + disc
            cold_total = rc / mr + disc
            # What the per-business read would have to cost for this market to
            # land exactly on budget, gap-fill included.
            break_even = (BUDGET_PER_MATCH - disc) * mr
            print(f"{mid.ljust(w)}   ${cold_total:>7.3f}   ${warm_total:>7.3f}   "
                  f"${break_even:.4f} per business")
        all_cold_ok = all(
            (measured.get(mid, blended or COLD_READ_PER_BUSINESS) / mr + disc)
            <= BUDGET_PER_MATCH
            for mid, _c, mr, disc, _r, _t in priced
        )
        if all_cold_ok:
            print(
                "\n  Every market is inside budget on the FIRST pass, not just on\n"
                "  re-reads. This reverses the earlier reading of this table, which\n"
                "  was computed from the $0.010 planning estimate and reported every\n"
                "  market over budget. The estimate was ~5x high."
            )
        else:
            print(
                "\n  Some markets clear the budget only on warm reads. That is the\n"
                "  cold-market problem the plan names as Change 11, priced: the first\n"
                "  pass over such a market loses money and later passes do not."
            )

    print(
        "\nWhat is measured and what is not:\n"
        "  measured  — discovery cost, coverage, match rate, and (S0-17) the\n"
        "              cold read cost per business on the markets listed above\n"
        "  estimated — the read cost for markets S0-17 has not run yet, and the\n"
        "              $%.3f warm read, which needs a second pass to observe.\n"
        "  unmeasured — precision. A cheap wrong answer is not a win; gate item 2\n"
        "              still needs the hand-labelled set (S0-16)."
        % WARM_READ_PER_BUSINESS
    )

    out = DATA / "gapfill-cost.json"
    out.write_text(json.dumps(
        [{"market": r[0], "coverage_strict": r[1], "match_rate": r[2],
          "discovery_per_match": r[3], "read_per_match": r[4], "total_per_match": r[5]}
         for r in rows], indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
