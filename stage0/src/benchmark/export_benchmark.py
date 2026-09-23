"""Export the measured benchmark numbers for the public page (S2-04).

The plan asks for "a published benchmark page kept current". The failure mode
is obvious and common: the numbers get typed into the page once, the engine
improves, and the public claim quietly becomes a historical one. Nobody
notices, because a stale number looks exactly like a fresh one.

So the page is not allowed to carry numbers. This script reads the **Live
numbers** table in `PROJECT_PLAN.md` — the single place measurements are
recorded — and writes `public/data/benchmark.json`. The page renders that. A
measurement that is not in the plan cannot appear on the site, and a plan edit
that is not re-exported fails `stage0/tests/test_benchmark_export.py`, which
runs this and diffs the result against what is committed.

Parsing a markdown table is brittle on purpose here. Every required row is
named below; if the plan renames one, this exits non-zero and says which,
rather than publishing a page with a hole in it.

    python3 stage0/src/benchmark/export_benchmark.py
    python3 stage0/src/benchmark/export_benchmark.py --check   # no write, exit 1 on drift
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLAN = ROOT / "PROJECT_PLAN.md"
OUT = ROOT / "public" / "data" / "benchmark.json"

# The rows the public page is built from, keyed by the id the page uses. The
# match is a substring of the plan's metric cell, after stripping markdown
# emphasis — chosen to be the part least likely to be reworded.
REQUIRED: list[tuple[str, str, str]] = [
    # (id, substring of the metric cell, what the page calls it)
    ("precision", "Match precision, blended", "Precision on matches we charge for"),
    ("precision_absence", "Match precision, absence criteria only",
     "Precision on absence criteria alone"),
    ("recall", "Known-match recall (delivered)", "Recall against a hand-built true-match set"),
    ("recall_ceiling", "Recall ceiling with the current crawl",
     "The ceiling the crawl imposes on recall"),
    ("couldnt_tell", "Couldn't-tell on **readable** sites", "Couldn't-tell, on sites we could read"),
    ("genuine_couldnt_tell", "Genuine couldn't-tell", "Couldn't-tell, all causes separated"),
    ("proof_validity", "Proof validity", "Proofs found verbatim in the fetched page"),
    ("cost_cold", "Cold cost per business", "Cost to read and judge one business, cold"),
    ("cost_per_credit", "Cost per credit, by band", "What a credit costs us, by band"),
    ("coverage", "Open-data coverage vs Google", "Open-data coverage against Google"),
    ("wrong_website", "Source data has the wrong website",
     "Businesses whose listed website is wrong — a ceiling on precision"),
    ("noise_floor", "measurement noise floor",
     "Run-to-run noise: the same code, the same corpus, twice"),
    ("settled_no_model", "Criteria settled with no model call",
     "Criteria settled with no model call at all"),
]

CELL_RE = re.compile(r"^\|(.+)\|\s*$")


def strip_md(s: str) -> str:
    """Markdown to plain text, keeping the ✓/✗/? marks — they are the verdict."""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    s = re.sub(r"`(.+?)`", r"\1", s)
    return s.strip()


def read_table(text: str) -> list[dict[str, str]]:
    """The Live numbers table, as a list of {metric, target, measured, date}."""
    start = text.find("### Live numbers")
    if start < 0:
        raise SystemExit("PROJECT_PLAN.md: no '### Live numbers' heading")
    rows: list[dict[str, str]] = []
    for line in text[start:].splitlines()[1:]:
        m = CELL_RE.match(line)
        if not m:
            if rows:  # the table has ended
                break
            continue
        cells = [c.strip() for c in m.group(1).split("|")]
        if len(cells) != 4 or set(cells[0]) <= set("-: "):
            continue
        if cells[0] == "Metric":
            continue
        rows.append(
            {
                "metric": strip_md(cells[0]),
                "target": strip_md(cells[1]),
                "measured": strip_md(cells[2]),
                "date": strip_md(cells[3]),
            }
        )
    if not rows:
        raise SystemExit("PROJECT_PLAN.md: the Live numbers table parsed to nothing")
    return rows


def build() -> dict:
    rows = read_table(PLAN.read_text())
    by_metric = {r["metric"]: r for r in rows}

    out = []
    missing = []
    for key, needle, label in REQUIRED:
        plain = strip_md(needle)
        hit = next((r for m, r in by_metric.items() if plain.lower() in m.lower()), None)
        if hit is None:
            missing.append(needle)
            continue
        out.append({"id": key, "label": label, **hit})

    if missing:
        raise SystemExit(
            "PROJECT_PLAN.md: the Live numbers table no longer carries "
            + "; ".join(missing)
            + "\nEither the row was renamed (update REQUIRED) or the measurement "
            "was dropped (the page must not keep publishing it)."
        )

    dates = sorted({r["date"] for r in out if re.match(r"^\d{4}-\d{2}-\d{2}$", r["date"])})
    unmeasured = [
        r["metric"] for r in rows if r["measured"] in {"—", "-", ""} and r["target"] not in {"—", "-", ""}
    ]

    return {
        "generatedFrom": "PROJECT_PLAN.md · Live numbers",
        "oldest": dates[0] if dates else None,
        "newest": dates[-1] if dates else None,
        "rows": out,
        # Published deliberately: a benchmark page that lists only what has been
        # measured reads as complete. These are the targets with no number yet.
        "notYetMeasured": unmeasured,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="exit 1 if the file on disk is stale")
    args = ap.parse_args()

    data = build()
    text = json.dumps(data, indent=2) + "\n"

    if args.check:
        current = OUT.read_text() if OUT.exists() else ""
        if current != text:
            print("public/data/benchmark.json is stale — re-run without --check")
            return 1
        print(f"benchmark.json current · {len(data['rows'])} rows · newest {data['newest']}")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(ROOT)} · {len(data['rows'])} rows · "
          f"measured {data['oldest']} to {data['newest']} · "
          f"{len(data['notYetMeasured'])} target(s) still unmeasured")
    return 0


if __name__ == "__main__":
    sys.exit(main())
