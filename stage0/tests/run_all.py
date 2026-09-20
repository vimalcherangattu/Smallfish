"""Run every Stage 0 test. No pytest needed.

    python3 stage0/tests/run_all.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

TESTS = sorted(Path(__file__).parent.glob("test_*.py"))
JS_TESTS = sorted(Path(__file__).parent.glob("test_*.mjs"))


def main() -> int:
    failed = []
    for test in TESTS:
        print(f"\n=== {test.name}")
        result = subprocess.run([sys.executable, str(test)])
        if result.returncode:
            failed.append(test.name)

    # The CSV export is TypeScript, and a quoting bug there silently corrupts a
    # user's spreadsheet rather than raising, so it is tested with the rest.
    for test in JS_TESTS:
        print(f"\n=== {test.name}")
        result = subprocess.run(["node", str(test)], cwd=test.parents[2])
        if result.returncode:
            failed.append(test.name)

    print("\n" + "=" * 50)
    if failed:
        print(f"FAILED: {', '.join(failed)}")
        return 1
    print(f"All {len(TESTS) + len(JS_TESTS)} test files passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
