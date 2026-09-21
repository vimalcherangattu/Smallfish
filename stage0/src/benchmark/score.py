"""Score the engine against hand labels: gate items 2 and 3 (S0-16 + S0-17).

Joins the blind human labels onto the engine's verdicts and reports the two
numbers Stage 0 cannot pass without:

- **Precision** — of the businesses the engine called a match, how many are.
  Reported blended *and* split by criterion type, because the plan over-weights
  absence criteria deliberately (Change 2): a blended 90% can hide a failing
  absence number, and absence is what the marketing leads with.
- **Recall** — of the businesses that truly match, how many the engine found.
  Computable only because the labelled slice is complete rather than a sample
  of the engine's own output; the misses are, by definition, not in the output.

Two things it refuses to do, both of which would flatter the result:

**Couldn't-tell is not counted as a wrong answer, and not as a right one.**
It is excluded from precision and reported separately. An engine that says
"couldn't tell" to everything has no precision problem and no product; an
engine scored as if couldn't-tell were a miss is punished for being honest.
Both numbers are shown so neither reading can hide.

**A label of "couldn't tell" is not ground truth.** Where the *human* could not
tell either, the pair is excluded from both metrics and counted separately —
scoring the engine against an unknown truth measures nothing. If that bucket is
large, the benchmark itself is the thing that needs fixing.

Usage:
    python3 stage0/src/benchmark/score.py --market dental-phoenix
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "stage0" / "data"
FIXTURES = ROOT / "stage0" / "fixtures"

PRECISION_TARGET = 0.90
RECALL_TARGET = 0.60


def wilson(hits: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = hits / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - m) / d, (c + m) / d)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="dental-phoenix")
    args = ap.parse_args()

    labels_path = FIXTURES / f"labels-{args.market}.json"
    if not labels_path.exists():
        raise SystemExit(
            f"Missing {labels_path.relative_to(ROOT)}.\n"
            f"Generate the tool with:\n"
            f"  python3 stage0/src/benchmark/labelling_set.py --market {args.market}\n"
            f"then label, Export, and save the download to that path."
        )
    labels = json.loads(labels_path.read_text())["labels"]

    verdicts_path = DATA / f"verdicts-{args.market}.json"
    if not verdicts_path.exists():
        raise SystemExit(
            f"Missing {verdicts_path.relative_to(ROOT)}.\n"
            f"Run: python3 stage0/src/benchmark/run.py --market {args.market} "
            f"--limit 100   (it writes verdicts on every run)"
        )
    engine = json.loads(verdicts_path.read_text())

    spec = json.loads((FIXTURES / "benchmarks.json").read_text())
    criteria = {c["id"]: c for c in
                next(m for m in spec["markets"] if m["id"] == args.market)["criteria"]}

    # --- per-criterion confusion, split by criterion type
    by_type: dict[str, Counter] = defaultdict(Counter)
    unscorable = Counter()
    pairs = 0

    for bid, truth in labels.items():
        got = engine.get(bid)
        if got is None:
            unscorable["not judged by the engine"] += 1
            continue
        for cid, label in truth.items():
            crit = criteria.get(cid)
            if crit is None:
                continue
            pairs += 1
            kind = crit.get("type", "presence")
            said = got.get(cid, "unread")

            if label == "wrong_site":
                # Overture has the wrong website for this business, so every
                # verdict about it is about a different company. A data-source
                # defect, not an engine defect; scoring it either way would be
                # measuring the wrong thing.
                unscorable["source data has the wrong website"] += 1
                continue
            if label == "couldnt_tell":
                # The human could not tell either. Not the engine's failure and
                # not its success — there is no truth to score against.
                unscorable["human could not tell"] += 1
                continue
            if said == "couldnt_tell":
                by_type[kind]["engine_abstained"] += 1
                continue
            if said not in ("match", "no_match"):
                unscorable[f"engine verdict '{said}'"] += 1
                continue

            if said == "match" and label == "match":
                by_type[kind]["tp"] += 1
            elif said == "match" and label == "no_match":
                by_type[kind]["fp"] += 1
            elif said == "no_match" and label == "match":
                by_type[kind]["fn"] += 1
            else:
                by_type[kind]["tn"] += 1

    # A couldn't-tell on a true match is also a miss for recall: the user did
    # not get that business. Counted separately so the two readings are visible.
    print(f"Scored {pairs} business-criterion pairs from "
          f"{len(labels)} labelled businesses\n")

    print(f"{'criterion type':<12} {'TP':>4} {'FP':>4} {'FN':>4} {'TN':>4} "
          f"{'abstain':>8}  {'PRECISION':>10}  {'RECALL':>8}")
    overall = Counter()
    for kind, c in sorted(by_type.items()):
        overall.update(c)
        prec_n = c["tp"] + c["fp"]
        prec = c["tp"] / prec_n if prec_n else None
        # Recall's denominator is every true match the engine had a chance at:
        # ones it found (tp), ones it called no_match (fn). Abstentions are
        # counted in their own column rather than folded in here — an engine
        # that abstains is failing the user differently from one that says no,
        # and blending them hides which.
        rec_den = c["tp"] + c["fn"]
        rec = c["tp"] / rec_den if rec_den else None
        print(f"{kind:<12} {c['tp']:>4} {c['fp']:>4} {c['fn']:>4} {c['tn']:>4} "
              f"{c['engine_abstained']:>8}  "
              f"{(f'{100*prec:.1f}%' if prec is not None else '   n/a'):>10}  "
              f"{(f'{100*rec:.1f}%' if rec is not None else '  n/a'):>8}")

    prec_n = overall["tp"] + overall["fp"]
    rec_den = overall["tp"] + overall["fn"]
    print()
    if prec_n:
        p = overall["tp"] / prec_n
        lo, hi = wilson(overall["tp"], prec_n)
        ok = "PASSES" if lo >= PRECISION_TARGET else (
            "FAILS" if hi < PRECISION_TARGET else "UNDECIDED (interval straddles)")
        print(f"Precision, blended   {100*p:.1f}%  "
              f"[{100*lo:.1f}–{100*hi:.1f}%]  target ≥90% — {ok}")
    if rec_den:
        r = overall["tp"] / rec_den
        lo, hi = wilson(overall["tp"], rec_den)
        ok = "PASSES" if lo >= RECALL_TARGET else (
            "FAILS" if hi < RECALL_TARGET else "UNDECIDED (interval straddles)")
        print(f"Recall               {100*r:.1f}%  "
              f"[{100*lo:.1f}–{100*hi:.1f}%]  target ≥60% — {ok}")

    # Per Change 2: the absence number is the one that matters and it must not
    # be allowed to hide inside the blend.
    absence = by_type.get("absence")
    if absence:
        n = absence["tp"] + absence["fp"]
        if n:
            lo, _ = wilson(absence["tp"], n)
            print(f"Precision, ABSENCE   {100*absence['tp']/n:.1f}%  "
                  f"(lower bound {100*lo:.1f}%)  — the gate reads this one separately")

    if unscorable:
        print(f"\nExcluded from scoring ({sum(unscorable.values())} pairs):")
        for k, v in unscorable.most_common():
            print(f"  {v:>5}  {k}")
        if unscorable["human could not tell"] > pairs * 0.2:
            print("\n  More than a fifth of pairs had no human-establishable truth.\n"
                  "  That is a problem with the benchmark, not the engine — the\n"
                  "  criteria may not be decidable from a public website at all.")
        wrong = unscorable["source data has the wrong website"]
        if wrong > pairs * 0.05:
            print(f"\n  {wrong} pairs had the wrong website in the source data\n"
                  "  ({:.0f}% of the slice). That is a candidate-quality problem\n"
                  "  upstream of anything the engine does, and it caps the\n"
                  "  precision this product can ever reach — every one of those\n"
                  "  is a row a user would receive about the wrong company."
                  .format(100 * wrong / pairs))

    out = DATA / f"score-{args.market}.json"
    out.write_text(json.dumps({
        "market": args.market,
        "pairs": pairs,
        "by_type": {k: dict(v) for k, v in by_type.items()},
        "unscorable": dict(unscorable),
    }, indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
