"""Rebuild the combined probe summary from the per-market detail files.

`site_probe.py --market X` used to overwrite the combined summary with just that
market. That is fixed, but the per-market `siteprobe-*.jsonl` files are the real
record either way, so the summary can always be reconstructed from them without
re-crawling anyone.

Usage:
    python3 stage0/src/coverage/rebuild_summary.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from coverage.site_probe import SiteResult, summarise  # noqa: E402

DATA = ROOT / "stage0" / "data"
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"


def main() -> int:
    order = [m["id"] for m in json.loads(FIXTURES.read_text())["markets"]]
    summaries = []

    for market_id in order:
        path = DATA / f"siteprobe-{market_id}.jsonl"
        if not path.exists():
            print(f"  skip {market_id}: no detail file")
            continue
        results = [SiteResult(**json.loads(line)) for line in path.open()]
        summary = summarise(market_id, results)
        summary["detail"] = str(path.relative_to(ROOT))
        summaries.append(summary)
        print(
            f"  {market_id:16} {summary['scored']:>4} scored, "
            f"judgeable {summary['judgeable_pct']}%, "
            f"booking {summary['booking']['booking_signal_pct']}%"
        )

    out = DATA / "siteprobe-summary.json"
    out.write_text(json.dumps(summaries, indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)} ({len(summaries)} markets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
