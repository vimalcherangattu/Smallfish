"""Run the engine over a market slice and report measured cost (S0-17).

This is the harness the gate needs. It reads real businesses, judges them with
a real model, verifies every quote, and reports what it cost — replacing the
`$0.010 per business` planning estimate that `gapfill_cost.py` showed the whole
unit-economics question turns on.

What it reports, and why each one is here:

- **cost per business, cold** — the number gate item 4 turns on, and the input
  the gap-fill model was guessing at.
- **cost per match** — the billable unit. Non-matches are paid for and not
  charged for, so this is always the larger number.
- **proof validity** — the share of non-couldn't-tell verdicts whose quote was
  found verbatim in the fetched text. A high match rate with a low proof
  validity is worse than a low match rate (S0-14).
- **settled by detector vs model** — the cost lever from S0-10, now observed on
  a live run rather than inferred from tallies.
- **couldn't-tell** — against the ≤25% target.

Precision and recall are **not** here: they need the hand-labelled set (S0-16),
which is human work. This harness measures what a run costs and whether its
proof holds up, not whether the verdicts are right.

Usage:
    python3 stage0/src/benchmark/run.py --market med-spa-dallas --limit 25
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.check_plan import plan_for_search  # noqa: E402
from engine.fetcher import FetchCache, read_many  # noqa: E402
from engine.judge import judge_business  # noqa: E402
from engine.llm import MODEL_WORKER, CostMeter, client  # noqa: E402

DATA = ROOT / "stage0" / "data"
APP = ROOT / "public" / "data"
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"


def pick(market_id: str, limit: int, seed: int) -> list[dict]:
    """A deterministic slice of businesses that have a website worth reading.

    Seeded so a re-run costs nothing new (the fetch cache hits) and so two runs
    are comparable. Businesses with no website are excluded from the *cost*
    measurement because they cost nothing to read — including them would
    flatter the per-business figure.
    """
    path = APP / f"{market_id}.json"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run export_app_data.py first.")
    market = json.loads(path.read_text())
    have_site = [b for b in market["businesses"] if b.get("site")]

    import random

    rng = random.Random(f"{seed}:{market_id}")
    rng.shuffle(have_site)
    return have_site[:limit], market


async def main_async(args) -> int:
    businesses, market = pick(args.market, args.limit, args.seed)
    spec = json.loads(FIXTURES.read_text())
    fixture = next(m for m in spec["markets"] if m["id"] == args.market)
    criteria = fixture["criteria"]
    plan = plan_for_search(criteria)

    print(f"{args.market}: {len(businesses)} businesses, "
          f"{len(criteria)} criteria, model {MODEL_WORKER}")
    if args.dry_run:
        print("\nDry run — no fetching, no model calls, nothing spent.")
        return 0

    cache = FetchCache()
    print("Reading sites…")
    reads = await read_many(businesses, plan, concurrency=args.concurrency, cache=cache)
    outcomes = Counter(r.outcome for r in reads.values())
    print(f"  fetch cache: {cache.hits} hits, {cache.misses} misses")
    print(f"  outcomes: {dict(outcomes.most_common())}")

    meter = CostMeter()
    api = client()
    print("Judging…")
    judgments = []
    for b in businesses:
        judgments.append(
            judge_business(b, reads[b["id"]], criteria, meter=meter, api=api)
        )

    # --- tally
    verdicts = Counter()
    settled_by = Counter()
    proof_checked = proof_valid = 0
    errors = 0
    for j in judgments:
        if j.error:
            errors += 1
        for v in j.verdicts:
            verdicts[v.verdict] += 1
            settled_by[v.settled_by] += 1
            if v.verdict != "couldnt_tell" and v.settled_by == "model":
                proof_checked += 1
                proof_valid += 1 if v.proof_valid else 0

    # A business matches only when every criterion matched — the same rule the
    # CSV export and the UI use, so the cost per match is the cost per *row a
    # user would be charged for*, not per criterion.
    matches = sum(
        1 for j in judgments
        if j.verdicts and all(v.verdict == "match" for v in j.verdicts)
    )
    readable = sum(1 for r in reads.values() if r.readable)
    cold = sum(1 for r in reads.values() if not r.from_cache)

    summary = meter.summary(len(businesses), matches)
    print("\n" + "=" * 62)
    print(f"businesses            {len(businesses)}  ({readable} readable, {cold} cold-fetched)")
    print(f"model calls           {summary['model_calls']}"
          f"{f'  ({errors} failed)' if errors else ''}")
    print(f"verdicts              {dict(verdicts.most_common())}")
    print(f"settled by            {dict(settled_by.most_common())}")
    if proof_checked:
        print(f"proof valid           {proof_valid}/{proof_checked} "
              f"({100 * proof_valid / proof_checked:.1f}%) of model verdicts")
    else:
        print("proof valid           no model verdicts to check")

    # Couldn't-tell against the right denominator. S0-27 established that
    # blending unreadable sites into this rate is what made the target look
    # unreachable: a site we could not fetch is not a site we failed to judge.
    # The target applies to criteria on sites that were actually read.
    readable_ids = {bid for bid, r in reads.items() if r.readable}
    on_readable = Counter()
    for j in judgments:
        if j.business_id in readable_ids:
            for v in j.verdicts:
                on_readable[v.verdict] += 1
    judged_r = sum(on_readable.values())
    judged_all = verdicts["match"] + verdicts["no_match"] + verdicts["couldnt_tell"]
    if judged_r:
        print(f"couldn't-tell         {100 * on_readable['couldnt_tell'] / judged_r:.1f}% "
              f"of criteria on READABLE sites (target ≤ 25%)")
    if judged_all:
        print(f"  — blended            {100 * verdicts['couldnt_tell'] / judged_all:.1f}% "
              f"including sites we could not read (not the target's denominator)")

    print(f"\nTOTAL                 ${summary['total_usd']:.4f}")
    print(f"cost per business     ${summary['cost_per_business']:.5f}   "
          f"(plan estimate: $0.010 cold)")
    if summary["cost_per_match"]:
        print(f"cost per match        ${summary['cost_per_match']:.5f}   "
              f"(gate item 4: ≤ $0.04)")
    else:
        # Not a failure of the engine. A business matches only when *every*
        # criterion matches, and this market's second criterion needs a model
        # judgment that mostly returns couldn't-tell. Reporting a cost per
        # match here would mean dividing by zero or quietly switching to a
        # per-criterion denominator, which is not what the gate asks for.
        crit_matches = verdicts["match"]
        print(f"cost per match        n/a — 0 businesses matched every criterion "
              f"({crit_matches} criteria matched)")
        if crit_matches:
            print(f"  per criterion-match  ${summary['total_usd'] / crit_matches:.5f} "
                  f"(not the gate's unit)")
    print(f"cache read share      {100 * summary['cache_read_share']:.1f}% of billed input")

    out = DATA / f"benchmark-{args.market}.json"
    out.write_text(json.dumps({
        "market": args.market,
        "model": MODEL_WORKER,
        "businesses": len(businesses),
        "readable": readable,
        "cold_fetched": cold,
        "verdicts": dict(verdicts),
        "settled_by": dict(settled_by),
        "couldnt_tell_readable": dict(on_readable),
        "proof_checked": proof_checked,
        "proof_valid": proof_valid,
        "matches": matches,
        "errors": errors,
        "cost": summary,
    }, indent=2) + "\n")
    meter.write(DATA / f"cost-log-{args.market}.jsonl")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="med-spa-dallas")
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--seed", type=int, default=20260921)
    ap.add_argument("--dry-run", action="store_true")
    return asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
