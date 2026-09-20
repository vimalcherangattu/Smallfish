"""Restate the couldn't-tell target from measured outcomes (task S0-27).

The product document targets a couldn't-tell rate of ≤ 25%, and
`docs/stage0-coverage-report.md` §2 reported a measured floor near 40% and called
the target unreachable. That comparison was unfair to the target, because it
counted three different things as one:

1. **Blocked** — the site refuses automated reading. Addressable by nobody: 96%
   stay blocked under every honest strategy (S0-26). It is now its own
   user-facing answer (S0-31), not a shrug.
2. **No website / social-only** — there is nothing to read. The product document
   already proposes showing these as their own category, which web agencies
   actively want.
3. **Genuine uncertainty** — the site was reachable but too thin, dead, erroring
   or JavaScript-only to judge. *This* is what "couldn't tell" should mean, and
   it is the only part a better engine can improve.

This script reports the rate under each definition so the target can be set
against the thing it is actually measuring.

Usage:
    python3 stage0/src/coverage/couldnt_tell_target.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "stage0" / "data"

# The site refuses us, and we have measured that we cannot change that.
BLOCKED = {"blocked", "robots_blocked"}
# There is no readable site to judge — a different answer, not uncertainty.
NO_SITE = {"social_only"}
# Reachable but not judgeable. The only bucket engineering can move.
GENUINE = {"dead", "http_error", "thin", "js_shell"}
# Our own failures, never counted against a business.
# Timeouts measure crawler load, not the site — see OURS_NOT_THEIRS in
# site_probe.py for the three-run evidence.
OURS = {"probe_error", "timeout"}


def main() -> int:
    path = DATA / "siteprobe-summary.json"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run site_probe.py first.")
    summaries = json.loads(path.read_text())

    rows = []
    for s in summaries:
        o = s["outcomes"]
        total = sum(v for k, v in o.items() if k not in OURS)
        ok = o.get("ok", 0)
        blocked = sum(o.get(k, 0) for k in BLOCKED)
        no_site = sum(o.get(k, 0) for k in NO_SITE)
        genuine = sum(o.get(k, 0) for k in GENUINE)

        # Denominator for genuine uncertainty excludes businesses with nothing to
        # read at all; they are answered, not unresolved.
        judgeable_pool = total - no_site
        rows.append(
            {
                "market": s["market"],
                "scored": total,
                "everything_not_ok_pct": round(100 * (total - ok) / total, 1),
                "blocked_pct": round(100 * blocked / total, 1),
                "no_site_pct": round(100 * no_site / total, 1),
                "genuine_couldnt_tell_pct": (
                    round(100 * genuine / judgeable_pool, 1) if judgeable_pool else 0.0
                ),
            }
        )

    w = max(len(r["market"]) for r in rows)
    print(f"{'market'.ljust(w)}  scored   all-not-ok   blocked   no-site   GENUINE")
    for r in rows:
        print(
            f"{r['market'].ljust(w)}  {r['scored']:>6}   "
            f"{r['everything_not_ok_pct']:>9}%   {r['blocked_pct']:>6}%   "
            f"{r['no_site_pct']:>6}%   {r['genuine_couldnt_tell_pct']:>6}%"
        )

    genuine = [r["genuine_couldnt_tell_pct"] for r in rows]
    blended = [r["everything_not_ok_pct"] for r in rows]
    print(
        f"\nEverything-not-ok: {min(blended)}–{max(blended)}%  "
        f"(what the report called the 'floor')"
    )
    print(
        f"Genuine couldn't-tell: {min(genuine)}–{max(genuine)}%  "
        f"(reachable sites we still cannot judge)"
    )

    out = DATA / "couldnt-tell-target.json"
    out.write_text(json.dumps(rows, indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
