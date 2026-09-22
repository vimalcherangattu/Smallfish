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
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.check_plan import plan_for_search  # noqa: E402
from engine.fetcher import FetchCache, read_many  # noqa: E402
from engine.judge import judge_business  # noqa: E402
from engine.llm import MODEL_WORKER, CostMeter, client  # noqa: E402
from engine import tech_signals  # noqa: E402

DATA = ROOT / "stage0" / "data"
APP = ROOT / "public" / "data"
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"

# Above this share of failed model calls, the run is an outage rather than
# a measurement and nothing is reported or written. Set low on purpose: a
# few percent of failures skews couldn't-tell and the match count, and the
# re-run is cheap because the crawl is cached.
MAX_ERROR_RATE = 0.02


def output_paths(market: str, tag: str = "") -> dict[str, Path]:
    """Every file a run writes, resolved in one place.

    These used to be built inline at the point of use, and the tag was
    introduced between two of them: the run judged 1,000 businesses, spent the
    money, and died on an UnboundLocalError at the first write. A path
    expression evaluated only at the very end of an expensive job is a
    landmine, so they are computed together and unit-tested without spending
    anything.
    """
    suffix = f"-{tag}" if tag else ""
    return {
        "benchmark": DATA / f"benchmark-{market}{suffix}.json",
        "verdicts": DATA / f"verdicts-{market}{suffix}.json",
        "trace": DATA / f"verdict-trace-{market}{suffix}.json",
        "cost_log": DATA / f"cost-log-{market}{suffix}.jsonl",
    }


def in_niche(business: dict, categories: dict) -> bool:
    """Is this business actually in the niche the market claims to be about?

    It was nobody's job to ask, and it cost a gate item. The med spa market ran
    1,000 businesses of which **only 31% were `medical_spa`** — the rest were
    Overture's catch-all `spas`, which is nail salons, barbershops and braiding
    studios. They do not offer Botox and their websites never mention it, so the
    engine correctly answered couldn't-tell, and the market's couldn't-tell rate
    read 44.8% against a 25% target. The engine was being blamed for being right
    about businesses that should not have been in front of it.

    The rule the dental market already followed and the others did not:
    **`expanded` means another name for the same niche, never an adjacent
    industry.** Dental's expanded list is orthodontists and endodontists and it
    runs 84% on-primary. Med spa's was day spas and float tanks.

    `rescue` exists because one case is genuinely mixed: Overture files real
    HVAC companies under the generic `contractor`. Only 2% of that category has
    an HVAC-ish name, but those 11 are real, and so are the plumbing
    dual-trades — "ABC Plumbing, Air, Heat & Electric". So the category is
    dropped and the name is checked instead.
    """
    cat = business.get("cat") or ""
    if cat in set(categories.get("primary", [])) | set(categories.get("expanded", [])):
        return True
    rescue = categories.get("rescue")
    if rescue and cat in set(rescue.get("categories", [])):
        return bool(re.search(rescue["name_pattern"], business.get("name", ""), re.I))
    return False


def pick(market_id: str, limit: int, seed: int, fixture: dict) -> list[dict]:
    """A deterministic slice of in-niche businesses with a website worth reading.

    Seeded so a re-run costs nothing new (the fetch cache hits) and so two runs
    are comparable. Businesses with no website are excluded from the *cost*
    measurement because they cost nothing to read — including them would
    flatter the per-business figure. Businesses outside the niche are excluded
    because measuring them tells you nothing about the product: see `in_niche`.
    """
    path = APP / f"{market_id}.json"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run export_app_data.py first.")
    market = json.loads(path.read_text())
    have_site = [b for b in market["businesses"] if b.get("site")]
    cats = fixture.get("categories", {})
    in_scope = [b for b in have_site if in_niche(b, cats)]
    dropped = len(have_site) - len(in_scope)
    if dropped:
        print(f"  scoped to the niche: {len(in_scope)} of {len(have_site)} "
              f"with a site ({dropped} off-niche dropped)")

    import random

    rng = random.Random(f"{seed}:{market_id}")
    rng.shuffle(in_scope)
    return in_scope[:limit], market


async def main_async(args) -> int:
    # Resolved before anything runs, because every output path uses it and
    # the first version assigned it between two of them — the run judged
    # 1,000 businesses, spent the money, then died on an UnboundLocalError
    # at the write. Output paths belong at the top, not next to their
    # first use.
    paths = output_paths(args.market, args.tag)
    spec = json.loads(FIXTURES.read_text())
    fixture = next(m for m in spec["markets"] if m["id"] == args.market)
    businesses, market = pick(args.market, args.limit, args.seed, fixture)
    criteria = fixture["criteria"]
    plan = plan_for_search(criteria)

    print(f"{args.market}: {len(businesses)} businesses, "
          f"{len(criteria)} criteria, model {MODEL_WORKER}")
    if args.dry_run:
        print("\nDry run — no fetching, no model calls, nothing spent.")
        return 0

    cache = FetchCache(ignore_version=args.frozen)
    print("Reading sites…" if not args.frozen else "Reading sites (frozen corpus)…")
    reads = await read_many(businesses, plan, concurrency=args.concurrency, cache=cache)
    outcomes = Counter(r.outcome for r in reads.values())
    print(f"  fetch cache: {cache.hits} hits, {cache.misses} misses"
          + (f" ({cache.stale} stale, re-fetched)" if cache.stale else ""))

    # Detection runs at fetch time and is stored with the read, so a cache hit
    # replays the verdicts the pattern catalogue gave when the site was
    # crawled. A frozen run over stale detection cannot evaluate a detector
    # change: it reports the old behaviour and looks like "no effect". That
    # exact mistake was made and written up once — see `tech_signals.
    # CATALOGUE_FINGERPRINT` — so this refuses rather than warns. Judging is
    # what costs money, and it has not started yet.
    if cache.stale_detection:
        print(f"  detector catalogue: {tech_signals.CATALOGUE_FINGERPRINT}")
        print(f"\n  {cache.stale_detection} cached read(s) carried detection "
              f"from a DIFFERENT pattern catalogue.")
        if args.frozen and not args.allow_stale_detection:
            raise SystemExit(
                "\nRefusing to report a frozen run over stale detection.\n"
                "  A detector change cannot be measured this way — the cached\n"
                "  reads replay the old catalogue's verdicts, so the run will\n"
                "  show no effect whether or not the change works.\n\n"
                "  Drop --frozen to re-crawl (a live run treats stale\n"
                "  detection as a cache miss, so the catalogue re-runs), or\n"
                "  pass --allow-stale-detection if the change under test is in\n"
                "  the judge and detection is deliberately being held fixed."
            )
        print("  Proceeding: detection is being held fixed on purpose."
              if args.allow_stale_detection else
              "  Re-fetching, so detection re-runs against the live catalogue.")
    failed_subpages = sum(len(r.fetch_failures) for r in reads.values())
    one_page = sum(1 for r in reads.values() if r.readable and r.whole_site)
    print(f"  sub-page fetch failures: {failed_subpages}"
          f"  ·  single-page sites: {one_page}")
    print(f"  outcomes: {dict(outcomes.most_common())}")

    meter = CostMeter()
    api = client()
    print("Judging…")
    judgments = []
    for b in businesses:
        judgments.append(
            judge_business(b, reads[b["id"]], criteria, meter=meter, api=api,
                           settle_on_generic=args.generic_settle)
        )

    # --- tally
    verdicts = Counter()
    settled_by = Counter()
    proof_checked = proof_valid = 0
    errors = 0
    error_kinds = Counter()
    for j in judgments:
        if j.error:
            errors += 1
            error_kinds[j.error[:120]] += 1
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

    # A run whose model calls mostly failed is not a measurement, and every
    # number below would still print and still look plausible. This exact run
    # happened: 143 of 229 calls failed on an exhausted credit balance, and the
    # harness reported "couldn't-tell 32.1%" and "cost per match $0.0238" as
    # results. Those are descriptions of an outage.
    #
    # A failed call becomes a couldn't-tell, so failures push couldn't-tell up
    # and matches down — the two headline numbers move in the direction that
    # looks like an engine problem. Nothing downstream can tell the difference,
    # which is why this aborts here rather than annotating the output.
    # The meter only records a call that returned, so its count is the
    # successes; the attempts are those plus the failures.
    succeeded = meter.summary(len(businesses), matches)["model_calls"]
    attempted = succeeded + errors
    if attempted and errors / attempted > MAX_ERROR_RATE:
        print(f"\n{'=' * 62}")
        print(f"ABORTED: {errors} of {attempted} model calls failed "
              f"({100 * errors / attempted:.0f}%).")
        for kind, n in error_kinds.most_common(3):
            print(f"  {n:>4}x  {kind}")
        print("\nNo verdicts and no benchmark file were written. A run that "
              "mostly did not\nhappen is not a measurement: failed calls become "
              "couldn't-tell, which pushes\nthe couldn't-tell rate up and the "
              "match count down, and both then read as\nengine problems.")
        print(f"\nThe {len(businesses)} sites are crawled and cached, so a "
              f"re-run costs only the judging.")
        return 2

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

    out = paths["benchmark"]
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
    meter.write(paths["cost_log"])

    # Per-business verdicts, for score.py to join hand labels onto. Written
    # every run rather than behind a flag: a benchmark whose verdicts are not
    # recoverable cannot be scored later, and re-running to get them back costs
    # money for an answer we already had.
    verdicts_out = paths["verdicts"]
    # A smaller run must not clobber a larger one. The enriched labelling set
    # is drawn from these verdicts, so a 100-business A/B overwriting a
    # 1,000-business run silently orphans most of the labels a human has
    # already produced — which is exactly what happened: 32 labels scored 14,
    # and precision's denominator fell to 2. The human work is the expensive
    # input here; losing its join is worse than an extra file.
    if verdicts_out.exists():
        try:
            existing = len(json.loads(verdicts_out.read_text()))
        except (OSError, ValueError):
            existing = 0
        if existing > len(judgments):
            keep = DATA / f"verdicts-{args.market}-n{existing}.json"
            if not keep.exists():
                keep.write_text(verdicts_out.read_text())
            print(f"\n  NOTE: {existing} verdicts on disk, this run has "
                  f"{len(judgments)}.\n  Preserved the larger set at "
                  f"{keep.relative_to(ROOT)} before overwriting.")
    verdicts_out.write_text(json.dumps(
        {j.business_id: {v.criterion_id: v.verdict for v in j.verdicts}
         for j in judgments}, indent=2) + "\n")

    # The same verdicts with their provenance, for diagnosing *why* a verdict
    # came out as it did. Separate file so score.py's join stays simple.
    trace_out = paths["trace"]
    trace_out.write_text(json.dumps(
        {j.business_id: {v.criterion_id: {
            "verdict": v.verdict, "settled_by": v.settled_by,
            "raw_model": v.raw_model_verdict, "proof_valid": v.proof_valid,
            "quote": v.quote[:160]} for v in j.verdicts}
         for j in judgments}, indent=2) + "\n")
    print(f"→ {verdicts_out.relative_to(ROOT)}")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="med-spa-dallas")
    ap.add_argument(
        "--generic-settle", action="store_true",
        help="A/B arm: let the detector's GENERIC booking hits settle the "
             "criterion instead of sending them to the model. This was the "
             "default until the booking rubric reached the model's prompt; "
             "measured on 1,000 businesses against corrected labels it now "
             "loses 25 points of recall (30.0%% vs 55.0%%) while costing only "
             "$0.006 less per match. Kept as a flag so the claim can be "
             "re-measured rather than re-argued.")
    ap.add_argument(
        "--tag", default="",
        help="write this run's verdicts to verdicts-<market>-<tag>.json "
             "instead of the canonical file. Use it for A/B arms: the "
             "canonical verdicts are what a hand-labelled set joins "
             "against, and an experiment that overwrites them invalidates "
             "human work that costs far more than the run.")
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--seed", type=int, default=20260921)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--frozen", action="store_true",
        help="reuse cached pages whatever their version — judge-only re-run. "
             "Use this to A/B a judging change: re-crawling moves the corpus "
             "under you and the run-to-run swing is as large as the effect. "
             "It does NOT freeze the judge alone — detection is cached too, so "
             "a detector change needs a re-crawl.")
    ap.add_argument(
        "--allow-stale-detection", action="store_true",
        help="permit a frozen run whose cached detection predates the current "
             "pattern catalogue. Correct when the change under test is in the "
             "judge and detection is deliberately held fixed; wrong, and "
             "silently so, when the change under test is the detector.")
    return asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
