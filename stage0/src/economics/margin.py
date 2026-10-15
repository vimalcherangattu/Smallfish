"""Gross margin under PRD v2, against the owner's mandate.

    python3 stage0/src/economics/margin.py
    python3 stage0/src/economics/margin.py --mandate 0.80   # exits 1 if breached

The owner, 2026-10-15: *"we need to maintain gross margin that's a mandate or
we work on a different pricing model"*. This is that check, and it exists as a
script with an exit code rather than a spreadsheet because a mandate nobody can
run is a hope.

## What changed, and why the old model no longer answers it

`unit_model.py` measures what a read costs us today: $0.0166-$0.0170 per
business across three niches, from real cost logs. That number is sound and
this file reuses it rather than restating it.

Three things since have moved the economics and none of them are in it:

1. **A paid discovery provider.** Apify Compass, chosen 2026-10-15.
2. **Reviews**, which PRD v2 makes central to the "Why them" line, at roughly
   twenty per business.
3. **A credit now buys a reveal the customer chose**, not every match we
   found. We pay to read either way; we are paid only on the ones they take.

The third is the one that bites, and it is easy to miss: under the old model
every match was billed, so revenue tracked the engine. Under reveal pricing,
revenue tracks a customer decision we do not control, while cost tracks the
engine exactly as before. A reveal rate below 1.0 is a direct multiplier on
revenue and none on cost.

## Vendor prices are inputs, and are labelled as such

Everything from `unit_model.measured` is measured. The provider prices below
are **list prices read off the vendors' own pages on 2026-10-15**, not
measured from our runs, and they are named here so nobody mistakes the two.
Re-check them before trusting a number; Apify moved to per-event billing in
August 2026 and will move again.
"""

from __future__ import annotations

import argparse
import sys

from unit_model import RUNS, measured

# --- vendor list prices, 2026-10-15, apify.com/compass/crawler-google-places --
#
# Not measured. Read off the actor's own pricing panel.
APIFY_PER_PLACE = 0.0015
APIFY_PER_DETAILS = 0.002
APIFY_PER_REVIEW = 0.0005
REVIEWS_PER_BUSINESS = 20

# --- the plans, from src/lib/pricing.ts ---------------------------------------
PLANS = [("Starter", 29.0, 120), ("Growth", 79.0, 400), ("Agency", 199.0, 1000)]

# --- banding, from src/lib/pricing.ts BANDS -----------------------------------
def credits_for(match_rate: float) -> int:
    if match_rate >= 0.15:
        return 1
    if match_rate >= 0.06:
        return 2
    return 3


def cost_per_match(m: dict, *, reviews_on: str) -> float:
    """What one matched business costs us, under a given review policy.

    `reviews_on`:
      "every"  — reviews pulled for every business we read. Simplest, and what
                 a naive reading of the PRD's "read site and reviews" implies.
      "match"  — reviews pulled only for businesses that passed the website
                 read. Reviews are only ever shown on a row somebody might
                 buy, so this is not a degradation, it is not paying for
                 twenty reviews of a business we are about to discard.
    """
    per_read = m["cost"]["read"]
    reads_per_match = per_read and (m["cost"]["matched"] / per_read)

    reviews = APIFY_PER_DETAILS + APIFY_PER_REVIEW * REVIEWS_PER_BUSINESS
    read_side = per_read + APIFY_PER_PLACE + (reviews if reviews_on == "every" else 0.0)
    out = read_side * reads_per_match
    if reviews_on == "match":
        out += reviews
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mandate", type=float, default=0.80,
                    help="minimum acceptable gross margin, 0-1")
    ap.add_argument("--reveal", type=float, default=1.0,
                    help="share of matched rows a customer actually reveals")
    args = ap.parse_args()

    rows = [m for m in (measured(k) for k in RUNS) if m]
    if not rows:
        print("No measured runs. Run the benchmark first.")
        return 2

    print("Gross margin under PRD v2")
    print("=" * 74)
    print()
    print("Measured per-read cost from unit_model; provider prices are vendor list.")
    print()

    worst = 1.0
    worst_line = ""

    for reviews_on, note in [
        ("every", "reviews for every business read"),
        ("match", "reviews only for businesses that passed the read"),
    ]:
        print(f"-- {note} " + "-" * (70 - len(note)))
        print(f"{'market':<17}{'match%':>8}{'band':>6}{'$/match':>10}"
              f"{'Starter':>10}{'Growth':>9}{'Agency':>9}")
        for m in rows:
            rate = m["match_rate"]
            band = credits_for(rate)
            per = cost_per_match(m, reviews_on=reviews_on)
            cells = []
            for name, price, credits in PLANS:
                # Credits buy reveals. The matches we read but they decline
                # cost us the read and earn nothing, which `--reveal` models.
                matches = credits / band
                revenue = price
                cost = (matches / max(args.reveal, 1e-9)) * per
                gm = (revenue - cost) / revenue
                cells.append(gm)
                if gm < worst:
                    worst = gm
                    worst_line = (f"{m['market']} on {name}, {note}, "
                                  f"reveal {args.reveal:.0%}")
            print(f"{m['market']:<17}{rate:>7.1%}{band:>6}{per:>10.4f}"
                  + "".join(f"{c:>9.1%}" for c in cells))
        print()

    print("=" * 74)
    print(f"Worst gross margin: {worst:.1%}   ({worst_line})")
    print(f"Mandate:            {args.mandate:.1%}")

    # --- what the bands would have to be -------------------------------------
    #
    # The useful output is not "breached", it is the number that would not be.
    # Credits per match is the one lever that costs the customer nothing in a
    # good niche: dental stays at one credit either way, and only the niches
    # that genuinely cost more move.
    print()
    print("Credits per match needed to hold the mandate, by niche")
    print("(reviews only on businesses that passed the read)")
    print("-" * 74)
    print(f"{'market':<17}{'match%':>8}{'band now':>10}{'needed':>9}   at reveal rate")
    for m in rows:
        per = cost_per_match(m, reviews_on="match")
        row = []
        for reveal in (1.0, 0.7, 0.5):
            # Revenue per match must cover cost/reveal with the mandate left
            # over. Priced against Starter, the cheapest credit we sell, so
            # every other plan clears it too.
            price_per_credit = PLANS[0][1] / PLANS[0][2]
            need = (per / reveal) / (1 - args.mandate) / price_per_credit
            row.append(need)
        print(f"{m['market']:<17}{m['match_rate']:>7.1%}"
              f"{credits_for(m['match_rate']):>10}"
              f"{'':>9}   " + "  ".join(f"{r:.1f}@{int(v*100)}%"
                                        for r, v in zip(row, (1.0, 0.7, 0.5))))

    if worst < args.mandate:
        print()
        print("BREACHED. The levers, cheapest first:")
        print("  1. Reviews only on businesses that passed the read. Free: a")
        print("     review is only ever shown on a row somebody might buy.")
        print("  2. Re-band, per the table above. Costs a good niche nothing.")
        print("  3. Fewer reads per credit. READS_PER_CREDIT is 11 and was set")
        print("     from NO_HOPE_RATE, never from margin: at $0.0183 a read it")
        print("     lets $0.20 of cost run against a $0.24 credit.")
        print("  4. A cheaper judge model, the only lever the customer cannot feel.")
        return 1
    print("\nWithin the mandate.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
