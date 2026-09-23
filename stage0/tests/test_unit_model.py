"""The unit-economics model must not flatter the business (S0-22).

The model it replaces was built from estimates, and the estimate that mattered
was wrong by 5×: `$0.010 per business cold` against a measured $0.0168. A model
that accepts a plausible number where a measurement is missing will always be
available to tell you what you hoped.

Three properties are pinned here, each guarding a specific way this file could
quietly become marketing:

1. **It reads measurements off disk and refuses when they are absent.** No
   default, no fallback, no "approximately".
2. **No breakage.** Every allowance unit is assumed consumed. Counting unused
   allowance as margin is how a thin business is made to look healthy, and the
   plan's Change 5 exists because the founding documents leaned on retention
   and breakage simultaneously.
3. **It prices against the worst niche, not the mean.** A plan sold to a med
   spa and an HVAC firm has to hold for both.

    python3 stage0/tests/test_unit_model.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

import ast
import re

_PATH = ROOT / "stage0" / "src" / "economics" / "unit_model.py"
SRC = _PATH.read_text()
# Prose wraps, so a literal phrase search against raw source fails on a line
# break rather than on a missing explanation. Both checks below want meaning,
# not formatting.
PROSE = re.sub(r"\s+", " ", SRC)
# The module docstring quotes measured figures to explain the finding. That is
# documentation, not a constant: the distinction is whether the number is
# reachable by the code. Strip every docstring and check what is left.
_TREE = ast.parse(SRC)
_DOCSTRINGS = [
    ast.get_docstring(n) or ""
    for n in ast.walk(_TREE)
    if isinstance(n, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
]
CODE = SRC
for d in _DOCSTRINGS:
    CODE = CODE.replace(d, "")
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def run(*args) -> str:
    p = subprocess.run(
        [sys.executable, str(ROOT / "stage0/src/economics/unit_model.py"), *args],
        capture_output=True, text=True)
    return p.stdout + p.stderr


def main() -> int:
    from economics.unit_model import DEFAULT_MARGIN, RUNS, TIERS, UNITS, measured

    # --- it refuses rather than guesses
    check("a missing market returns None, not an estimate",
          measured.__doc__ and "None rather than guessing" in measured.__doc__)
    check("no measured cost is reachable as a constant in the code",
          not any(s in CODE for s in ("0.0168", "0.0170", "0.1787", "0.0294")),
          "a number typed into the code stops tracking the runs it describes; "
          "the same numbers in the docstring are documentation and are fine")

    out = run()
    check("it runs and produces a table", "Measured inputs" in out)

    # --- no breakage, stated where a reader will see it
    check("the headline says margin is without breakage",
          "WITHOUT breakage" in out)
    check("and the allowance table repeats it",
          "no breakage" in out and "assumed consumed" in out,
          "a caveat only in a docstring is a caveat nobody reads")
    check("the source explains why breakage is excluded",
          "Change 5" in PROSE and "does not work" in PROSE)

    # --- the worst niche carries the price
    check("allowances are computed against the worst niche as well as the best",
          "units @ worst" in out and "units @ best" in out)
    check("the source says why the worst niche is the one that matters",
          "worst niche, not the mean" in SRC)

    # --- the four units are all priced, including the one in use
    for label, _, _ in UNITS:
        check(f"'{label}' is priced", label.upper() in out)
    check("the unit the product bills today is named as such",
          "what the product bills today" in out)

    # --- the spread is reported, because it is the finding
    check("the per-niche spread is reported for every unit",
          "spread" in out and out.count("x spread") == len(UNITS))

    # --- what it cannot settle is stated as loudly as what it can
    check("unsettled items are listed, not omitted",
          "NOT SETTLED" in out)
    for item in ("What a buyer pays", "S0-20", "Gap-fill"):
        check(f"it admits {item!r} is unmodelled", item in out)
    check("it says the alert cost makes these figures UNDERSTATE the truth",
          "UNDERSTATES" in out,
          "an incomplete cost model must say which direction it is wrong in")

    # --- the margin is an input, not a buried constant
    check("margin defaults to 80% and is overridable",
          DEFAULT_MARGIN == 0.80 and "--margin" in out or "--margin" in SRC)
    tight = run("--margin", "0.9")
    check("a tighter margin yields smaller allowances",
          "90% gross margin" in tight)

    # --- the free tier is costed, not ignored
    check("the free tier is shown as a cost to honour",
          "to honour" in out,
          "a free plan is pure cost and a model that omits it is incomplete")
    check("every plan tier appears", all(n in out for n, _ in TIERS))

    # --- markets are read on one engine
    check("dental is read from the escalate run, matching the shipped engine",
          RUNS["dental-phoenix"].endswith("-escalate.json"),
          "comparing markets across different engines already produced one "
          "wrong table today")

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
