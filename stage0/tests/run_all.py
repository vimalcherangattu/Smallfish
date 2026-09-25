"""Run every Stage 0 test. No pytest needed.

    python3 stage0/tests/run_all.py

**Exit 2 means "could not run", and is reported as a skip rather than a pass.**
Some tests need something the repository cannot carry — `test_home_copy.mjs`
checks the page Next.js actually renders, so it needs a build. The tempting
shortcut is to have such a test return 0 when its input is missing, and that is
how a suite ends up green on checks that have not executed for a month. A skip
is printed, counted, and named in the summary, so "not run" is never mistaken
for "passed".

Tests that need a network or live credentials are named `check_*` instead and
are not discovered here at all; `docs/LAUNCH-CHECKLIST.md` lists them.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

TESTS = sorted(Path(__file__).parent.glob("test_*.py"))
JS_TESTS = sorted(Path(__file__).parent.glob("test_*.mjs"))

SKIPPED = 2


def main() -> int:
    failed: list[str] = []
    skipped: list[str] = []

    def run(cmd: list[str], name: str, cwd: Path | None = None) -> None:
        print(f"\n=== {name}")
        result = subprocess.run(cmd, cwd=cwd)
        if result.returncode == SKIPPED:
            skipped.append(name)
        elif result.returncode:
            failed.append(name)

    for test in TESTS:
        run([sys.executable, str(test)], test.name)

    # The CSV export is TypeScript, and a quoting bug there silently corrupts a
    # user's spreadsheet rather than raising, so it is tested with the rest.
    for test in JS_TESTS:
        run(["node", str(test)], test.name, cwd=test.parents[2])

    total = len(TESTS) + len(JS_TESTS)
    print("\n" + "=" * 50)
    if skipped:
        print(f"SKIPPED ({len(skipped)}, and these checked nothing): {', '.join(skipped)}")
    if failed:
        print(f"FAILED: {', '.join(failed)}")
        return 1
    print(f"{total - len(skipped)} of {total} test files passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
