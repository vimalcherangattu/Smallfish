"""A run whose model calls mostly failed must not report numbers.

It happened. A 1,000-business dental run had **143 of 229 model calls fail** on
an exhausted credit balance, and the harness printed:

    couldn't-tell         32.1% of criteria on READABLE sites (target <= 25%)
    cost per match        $0.02375   (gate item 4: <= $0.04)

Both look like findings. Both are descriptions of an outage. Worse, they are
*plausible* findings: a failed call becomes a couldn't-tell, so failures push
the couldn't-tell rate up and the match count down — the two headline numbers
move in exactly the direction that reads as an engine problem. Nothing
downstream can distinguish "the model judged this and was unsure" from "the
call never completed", which is why the run has to stop before reporting
rather than annotate its output.

The verdicts file is the sharper hazard: it is what the hand labels join
against, so a bad run silently poisons the most expensive input in Stage 0.

    python3 stage0/tests/test_outage_is_not_a_measurement.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

SRC = (ROOT / "stage0" / "src" / "benchmark" / "run.py").read_text()

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def main() -> int:
    from benchmark.run import MAX_ERROR_RATE

    check("there is an error-rate ceiling at all", MAX_ERROR_RATE > 0)
    check(
        "and it is strict, because a few percent already skews the rates",
        MAX_ERROR_RATE <= 0.05,
        f"MAX_ERROR_RATE={MAX_ERROR_RATE}",
    )

    # --- the abort must come BEFORE anything is reported or written
    abort_at = SRC.find("ABORTED:")
    check("the abort exists", abort_at != -1)
    if abort_at == -1:
        print(f"\n{len(failures)} failure(s)")
        return 1

    # Matched on the emitting code, not on the words: both phrases also appear
    # in this file's own explanation of why the guard exists, and a test that
    # matches prose passes for the wrong reason.
    for label, needle in [
        ("the cost-per-match line", 'print(f"cost per match'),
        ("the cost-per-business line", 'print(f"cost per business'),
        ("the couldn\'t-tell line", 'print(f"couldn\'t-tell'),
        ("the verdicts file write", "verdicts_out.write_text"),
        ("the benchmark file write", "out.write_text"),
        ("the cost log write", "meter.write"),
    ]:
        first = SRC.find(needle)
        check(
            f"{label} comes after the abort",
            first > abort_at,
            "an outage that still writes verdicts poisons the hand-label join",
        )

    check(
        "the abort returns non-zero, so a caller or CI notices",
        re.search(r"ABORTED:.*?return 2", SRC, re.S) is not None,
    )
    check(
        "the failure reasons are printed, not just the count",
        "error_kinds.most_common" in SRC,
        "'143 failed' does not say whether it was credits, rate limits or a bug",
    )
    check(
        "the error rate is computed over ATTEMPTS, not successes",
        "attempted = succeeded + errors" in SRC,
        "dividing failures by successes understates the rate, and understates "
        "it most exactly when the run is worst",
    )
    check(
        "the message says a re-run is cheap because the crawl is cached",
        "crawled and cached" in SRC,
        "otherwise the obvious reaction to an abort is to distrust the crawl too",
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
