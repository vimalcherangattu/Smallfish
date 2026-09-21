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

**Couldn't-tell is excluded from precision but counted against recall.**
That asymmetry is the point, and the first version of this file got it wrong.
Abstaining is not a precision error — we did not tell the user something
false. It is squarely a recall error: the business never reached them, and
"we said not sure" is indistinguishable from "we said no" from where they sit.
Leaving abstentions out of the recall denominator reported 1-of-15 as "33%"
on the first real run, which is exactly the flattery this file exists to
prevent. Delivered recall is the headline; the decided-only figure is kept
as a diagnostic and labelled as one.

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
    ap.add_argument(
        "--enriched", action="store_true",
        help="score labels-<market>-enriched.json, the set oversampled on "
             "the engine's positive calls. Precision only — recall is "
             "refused for it whether or not this flag is passed, on the "
             "design recorded inside the file.")
    args = ap.parse_args()

    # Two datasets per market, measuring different things. Selected by flag
    # rather than by overwriting one file with the other: the complete
    # slice is the only set that can measure recall and the more expensive
    # to rebuild, and losing it would not show up as a wrong number
    # anywhere — just a missing one.
    suffix = "-enriched" if args.enriched else ""
    labels_path = FIXTURES / f"labels-{args.market}{suffix}.json"
    if not labels_path.exists():
        raise SystemExit(
            f"Missing {labels_path.relative_to(ROOT)}.\n"
            f"Generate the tool with:\n"
            f"  python3 stage0/src/benchmark/labelling_set.py --market {args.market}\n"
            f"then label, Export, and save the download to that path."
        )
    labelled = json.loads(labels_path.read_text())
    labels = labelled["labels"]

    # Which sampling design produced these labels decides which metrics they
    # can carry. A set enriched on the engine's positive calls measures
    # precision correctly — that metric is already conditioned on the engine
    # having said match — and cannot measure recall at all, because the
    # businesses the engine missed are absent from it by construction. Recall
    # computed from such a set is not noisy, it is structurally wrong, and it
    # would read HIGH, which is the direction that gets believed.
    #
    # Read from the file rather than passed as a flag: the person running
    # score.py months from now is not the person who chose the sampling, and a
    # flag they forget produces a number nobody can tell is wrong by looking
    # at it.
    design = labelled.get("design") or {"sampling": "complete_slice"}
    enriched = design.get("sampling") == "enriched_on_engine_positives"
    if enriched:
        print(f"Sampling: ENRICHED on the engine's positive calls "
              f"({design.get('positives', '?')} positives + "
              f"{design.get('filler', '?')} filler).")
        print("  Precision below is valid. RECALL IS NOT REPORTED — the true "
              "matches the\n  engine missed are not in this sample.\n")

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
                # An abstention on a business that truly matches is a business
                # the user never receives. It is not a precision error, but it
                # is absolutely a recall error, and the first version of this
                # scorer hid that by leaving abstentions out of the recall
                # denominator entirely — turning 1-of-15 into "33%".
                if label == "match":
                    by_type[kind]["abstained_on_match"] += 1
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
    # DELIVERED recall is the gate number. Gate item 3 asks "of the businesses
    # that truly match, how many did the engine find?" — and a business the
    # engine abstained on is one the user did not get. Whether we said "no" or
    # said "not sure" is invisible to them.
    delivered_den = overall["tp"] + overall["fn"] + overall["abstained_on_match"]
    if enriched:
        print("Recall, DELIVERED    not computable from this sample — "
              "enriched on engine positives")
        print(f"  {design.get('why', '')}")
    elif delivered_den:
        r = overall["tp"] / delivered_den
        lo, hi = wilson(overall["tp"], delivered_den)
        ok = "PASSES" if lo >= RECALL_TARGET else (
            "FAILS" if hi < RECALL_TARGET else "UNDECIDED (interval straddles)")
        print(f"Recall, DELIVERED    {100*r:.1f}%  "
              f"[{100*lo:.1f}–{100*hi:.1f}%]  target ≥60% — {ok}")
        print(f"  {overall['tp']} of {delivered_den} true matches reached the user; "
              f"{overall['abstained_on_match']} were abstained on, "
              f"{overall['fn']} wrongly rejected")
    if rec_den and not enriched:
        r = overall["tp"] / rec_den
        print(f"Recall, decided-only {100*r:.1f}%  "
              f"— diagnostic only: excludes abstentions, so it flatters an\n"
              f"                     engine that avoids being wrong by not answering")

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

    out = DATA / f"score-{args.market}{suffix}.json"
    out.write_text(json.dumps({
        "market": args.market,
        "design": design,
        "recall_reported": not enriched,
        "pairs": pairs,
        "by_type": {k: dict(v) for k, v in by_type.items()},
        "unscorable": dict(unscorable),
    }, indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
