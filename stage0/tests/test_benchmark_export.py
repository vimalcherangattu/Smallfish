"""The published benchmark cannot go stale silently (S2-04).

"Kept current" is a promise nobody keeps by intention. So it is made
mechanical: the page carries no numbers of its own, the numbers come from
`public/data/benchmark.json`, and that file is generated from the Live numbers
table in `PROJECT_PLAN.md`. This test re-runs the generator and fails if what
is committed differs — so editing a measurement in the plan without
re-exporting is a failing test, not a quietly wrong public page.

The other half is the harder one. A benchmark page has an obvious gradient: the
flattering rows survive edits and the awkward ones get reworded into
insignificance. The checks below pin the specific rows that undercut the
headline — the noise floor, the wrong-website ceiling, the one-niche caveat —
so removing any of them takes a deliberate edit to this file.

    python3 stage0/tests/test_benchmark_export.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPORT = ROOT / "stage0" / "src" / "benchmark" / "export_benchmark.py"
DATA = ROOT / "public" / "data" / "benchmark.json"
PAGE = ROOT / "src" / "app" / "benchmark" / "page.tsx"
PLAN = ROOT / "PROJECT_PLAN.md"

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def main() -> int:
    # --- the file on disk is what the plan currently says ------------------
    result = subprocess.run(
        [sys.executable, str(EXPORT), "--check"], capture_output=True, text=True
    )
    check(
        "benchmark.json matches PROJECT_PLAN.md",
        result.returncode == 0,
        (result.stdout + result.stderr).strip()
        + " — run python3 stage0/src/benchmark/export_benchmark.py",
    )

    data = json.loads(DATA.read_text())
    rows = {r["id"]: r for r in data["rows"]}
    page = PAGE.read_text()

    # --- the page cannot carry a number of its own ------------------------
    # Percentages and dollar figures in the JSX would be a second source of
    # truth, and the second one is always the one that goes stale.
    import re

    body = re.sub(r"/\*.*?\*/", "", page, flags=re.S)  # docstring explains the rule
    stray = [
        m
        for m in re.findall(r"\b\d+\.\d+%|\$\d+\.\d+", body)
    ]
    check(
        "the page hardcodes no measured figure",
        not stray,
        f"found {stray} — these belong in PROJECT_PLAN.md, not in JSX",
    )
    # The caveats are prose and the figures they refer to are rendered from the
    # JSON beside them. The first draft of this page typed 71.4% and 83.3% into
    # the JSX and the check above caught it, which is the check earning its
    # place: those two numbers move every time the benchmark is re-run.
    check(
        "the noise floor is explained in prose, not only tabulated",
        "identical runs" in page.lower(),
        "a row reading '71.4% then 83.3%' means nothing without the sentence "
        "that says the two runs differed in nothing",
    )

    # --- the rows that undercut the headline are all still published ------
    for key, why in [
        ("noise_floor", "no engine change smaller than this is distinguishable"),
        ("wrong_website", "a hard ceiling on precision that better reading cannot fix"),
        ("recall_ceiling", "the crawl's own limit on recall"),
        ("genuine_couldnt_tell", "the honest denominator for couldn't-tell"),
    ]:
        check(f"the page still publishes {key}", key in rows, why)
        check(f"and {key} is rendered, not just exported", key in page)

    # --- a measurement must not vanish by being measured -------------------
    #
    # The weekly change rate sat on /benchmark for weeks as a target with no
    # number — `notYetMeasured` is derived from the whole Live numbers table —
    # and the day it was measured it **disappeared**, because `rows` is built
    # from `REQUIRED` in the exporter and `change_rate` was not in it. Measuring
    # something removed it from the page.
    #
    # So: everything the page currently advertises as still to be measured must
    # already have a home to arrive in. Checked against the exporter's own
    # `REQUIRED`, because a second copy of that list here would be the same
    # defect one layer further out.
    sys.path.insert(0, str(ROOT / "stage0" / "src" / "benchmark"))
    import importlib.util as _ilu
    _spec = _ilu.spec_from_file_location("_exp", EXPORT)
    _exp = _ilu.module_from_spec(_spec)
    _spec.loader.exec_module(_exp)
    needles = [_exp.strip_md(n).lower() for _, n, _ in _exp.REQUIRED]
    homeless = [
        m for m in data["notYetMeasured"]
        if not any(n in _exp.strip_md(m).lower() for n in needles)
    ]
    check(
        "every target still to be measured has somewhere to appear when it is",
        not homeless,
        "these are advertised as pending and would vanish on being measured — "
        "add them to REQUIRED in export_benchmark.py: " + "; ".join(homeless),
    )

    # And the page can place a row nobody listed, rather than dropping it.
    check(
        "the page falls back for an id its own groups do not name",
        "PLACED" in page and "!PLACED.has" in page,
        "without a fallback, a new measurement renders nowhere",
    )

    check(
        "precision is published with its interval, not as a bare number",
        "CI" in rows["precision"]["measured"] or "–" in rows["precision"]["measured"],
        f"measured cell reads {rows['precision']['measured']!r}",
    )
    check(
        "the one-niche caveat on precision survives",
        "one niche of three" in page.lower() or "dental" in page.lower(),
        "100% precision on dental only is not a cross-niche claim",
    )

    # --- targets with no measurement are published too --------------------
    check(
        "targets with no number yet are listed",
        len(data["notYetMeasured"]) > 0 and "notYetMeasured" in page,
        "a page listing only what was measured reads as complete",
    )
    check(
        "and the unmeasured list is derived, not typed",
        all(m not in page for m in data["notYetMeasured"]),
        "a hardcoded list stops growing when the plan does",
    )

    check(
        "every published row carries the date it was measured",
        all(r["date"] and r["date"] != "—" for r in data["rows"]),
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

