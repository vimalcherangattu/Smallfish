"""How much technology detection settles with no model call (S0-10).

S0-10's definition of done is a number, not a feature: *"detection settles a
measured share of criteria with no model call — record that share, it is the
main cost lever."* `tech_signals.py` has been built and used for a while; the
number was never recorded, so the task stayed open. This records it.

**What "settled" means here, precisely.** A criterion is settled when the
pipeline reaches `match` or `no_match` without a model:

- `no_match` — a positive signal was found, so an absence claim fails outright.
  This is the cheap half and it is unambiguous.
- `match` — the absence rule was satisfied: the criterion-relevant pages were
  read and no signal was found anywhere in them. Detection alone produced it.

`couldnt_tell` and `blocked` are *not* settled: they are honest non-answers the
user is not charged for. Our own timeouts and proxy errors are excluded from
the denominator entirely, per principle 4 — never blame the environment on the
business.

**What this number is not.** It is the share of criteria answered without
spending on a model. It is *not* the share answered correctly. Absence matches
from detection alone are exactly what gate item 2 exists to test, and that
precision is unmeasured until S0-16 and S0-17 run. A high share here with a low
precision there would mean the cost lever is real and the answers are wrong,
which is worse than a low share. Read them together or not at all.

Usage:
    python3 stage0/src/engine/detection_share.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.check_plan import plan_for_criterion  # noqa: E402

APP_DATA = ROOT / "public" / "data"

# Verdicts reached with no model call.
SETTLED = {"match", "no_match"}
# Honest non-answers. Not settled, and not billable.
UNSETTLED = {"couldnt_tell", "blocked"}
# Never read, so not evidence either way about the detector.
NOT_ATTEMPTED = {"unread"}
# A criterion no detector covers. The size of this bucket is the other half of
# the story: it is what a model would have to be spent on.
NEEDS_MODEL = {"needs_model"}


def main() -> int:
    index_path = APP_DATA / "index.json"
    if not index_path.exists():
        raise SystemExit(f"Missing {index_path}. Run export_app_data.py first.")
    index = json.loads(index_path.read_text())

    rows = []
    for m in index["markets"]:
        for c in m["criteria"]:
            t = m["tallies"].get(c["id"], {})
            settled = sum(t.get(k, 0) for k in SETTLED)
            unsettled = sum(t.get(k, 0) for k in UNSETTLED)
            needs_model = sum(t.get(k, 0) for k in NEEDS_MODEL)
            not_attempted = sum(t.get(k, 0) for k in NOT_ATTEMPTED)

            # Denominator: criteria the pipeline actually attempted. A business
            # never visited says nothing about the detector either way.
            attempted = settled + unsettled + needs_model

            # Whether a detector bears on this criterion at all — the engine's
            # own answer, not a second copy of the mapping. A criterion with no
            # tech family can never be settled without a model, and for an
            # *absence* criterion that does not show up as `needs_model`: the
            # absence rule returns couldn't-tell instead, so it looks like a
            # detector that is doing badly rather than one that is absent.
            covered = bool(plan_for_criterion(c["id"], c["text"], c["type"]).tech_families)

            rows.append(
                {
                    "market": m["id"],
                    "criterion": c["id"],
                    "type": c["type"],
                    "detector": covered,
                    "attempted": attempted,
                    "settled": settled,
                    "unsettled": unsettled,
                    "needs_model": needs_model,
                    "not_attempted": not_attempted,
                    "settled_pct": round(100 * settled / attempted, 1) if attempted else 0.0,
                }
            )

    w = max(len(f"{r['market']}/{r['criterion']}") for r in rows)
    print(f"{'market / criterion'.ljust(w)}  type      detector  attempted  settled  SETTLED%")
    for r in rows:
        print(
            f"{(r['market'] + '/' + r['criterion']).ljust(w)}  "
            f"{r['type']:<8}  {('yes' if r['detector'] else 'NO'):>8}  "
            f"{r['attempted']:>9}  {r['settled']:>7}  {r['settled_pct']:>7}%"
        )

    covered = [r for r in rows if r["detector"] and r["attempted"]]
    uncovered = [r for r in rows if not r["detector"]]
    total_attempted = sum(r["attempted"] for r in rows)
    total_settled = sum(r["settled"] for r in rows)

    print()
    if covered:
        pcts = [r["settled_pct"] for r in covered]
        print(
            f"Where a detector exists: {min(pcts)}–{max(pcts)}% settled with no model "
            f"call ({sum(r['settled'] for r in covered)} of "
            f"{sum(r['attempted'] for r in covered)} attempted)."
        )
    print(
        f"Where none exists: {len(uncovered)} of {len(rows)} criteria, "
        f"{sum(r['attempted'] for r in uncovered)} attempted, 0 settled."
    )
    print(
        f"\nAcross every criterion in every market: "
        f"{round(100 * total_settled / total_attempted, 1)}% "
        f"({total_settled} of {total_attempted}) settled with no model call."
    )

    # An absence criterion with no detector is the quiet failure. It never
    # reports `needs_model`, so nothing flags it — it just answers
    # "couldn't tell" to every business, forever, and looks like a hard market.
    dead = [r for r in rows if not r["detector"] and r["type"] == "absence"]
    if dead:
        print("\nAbsence criteria with no detector — these can NEVER be settled:")
        for r in dead:
            print(
                f"  {r['market']}/{r['criterion']}: couldn't-tell for all "
                f"{r['attempted']} attempted. Needs either a detector family in "
                f"check_plan.py or a model."
            )

    print(
        "\nThis is the share answered *without spending*, not the share answered\n"
        "correctly. Absence matches from detection alone are precisely what gate\n"
        "item 2 tests, and that precision is unmeasured until S0-16 and S0-17 run.\n"
        "A high share here with a low precision there is worse than a low share."
    )

    out = ROOT / "stage0" / "data" / "detection-share.json"
    out.write_text(json.dumps(rows, indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
