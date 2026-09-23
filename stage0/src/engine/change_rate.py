"""Weekly change rate, and the noise floor underneath it (S0-20).

The alert engine's whole cost depends on one number: what fraction of watched
businesses change in a week. Change 4 exists because that cost scales with
retention — every customer who stays adds a weekly re-read forever — so getting
this wrong compounds in the direction nobody notices until the bill arrives.

**The measurement has a trap, and it is the same trap this project keeps
finding.** "Did the site change?" is not one question. Hashing raw HTML answers
"did any byte move", which is true of almost every site on almost every fetch:
CSRF tokens, session ids, rotating testimonials, a copyright year, an ad slot,
a cache-busting query string. A change rate measured that way is a measurement
of our own hashing, and it would say ~100% and send an alert for every business
every week.

So this reports the rate at **four levels**, from noisiest to most meaningful:

    raw          sha256 of the fetched HTML
    text         sha256 of the extracted visible text
    normalised   visible text with digits, dates, times and whitespace
                 flattened — a copyright year or a "posted 3 hours ago" no
                 longer counts as news
    signals      the detected vendors and affordances — what the engine
                 actually judges on, and the only level at which a change can
                 flip a verdict

The gap between `raw` and `signals` is the noise floor. Any alert built on the
wrong level either cries wolf weekly or costs a full re-judge to discover
nothing happened.

**A same-day re-run measures that noise floor directly**, because nothing real
has changed in an hour. That is the run to do first, and it needs no week of
waiting:

    python3 stage0/src/engine/change_rate.py --market dental-phoenix --snapshot
    python3 stage0/src/engine/change_rate.py --market dental-phoenix --compare --sample 60

The seven-day figure S0-20 asks for is the same `--compare` run, seven days
later, against the same snapshot. Until then the snapshot is the deliverable
and the noise floor is the finding.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import random
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine import tech_signals  # noqa: E402
from engine.check_plan import plan_for_search  # noqa: E402
from engine.fetcher import MAX_PAGES  # noqa: E402
from benchmark.run import in_niche  # noqa: E402
from coverage.site_probe import (  # noqa: E402
    HEADERS, TIMEOUT, DomainThrottle, RobotsCache, classify, fetch_page,
    normalise_url, select_links, visible_text,
)

DATA = ROOT / "stage0" / "data"
APP = ROOT / "public" / "data"
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"

# What "normalised" flattens. Each of these changes on a site that has not
# changed in any sense a buyer would care about.
# ORDER MATTERS, and getting it wrong is subtle. A first version ran a
# year rule before the general digit rule, so "1902 patients served" became
# "YEAR patients served" while "1841 patients served" became "N patients
# served" — two visitor counts normalising to different tokens purely because
# one looked like a year. The general rule already covers years, so the
# special case only has to handle what it cannot: a time carries an am/pm that
# would survive digit-flattening and read as a change.
_NOISE = [
    (re.compile(r"\b\d{1,2}:\d{2}\s*(a\.?m\.?|p\.?m\.?)?", re.I), "TIME"),
    (re.compile(r"\b\d+\b"), "N"),      # years, counts, ids, phone fragments
    (re.compile(r"\s+"), " "),
]


def digest(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8", "replace")).hexdigest()[:16]


def normalise(text: str) -> str:
    out = text.lower()
    for pattern, repl in _NOISE:
        out = pattern.sub(repl, out)
    return out.strip()


def levels(pages: list[tuple[str, str, str]], signals: dict) -> dict:
    """Four hashes over one site's read. `pages` is (url, html, text)."""
    ordered = sorted(pages, key=lambda p: p[0])
    return {
        "raw": digest("".join(u + h for u, h, _ in ordered)),
        "text": digest("".join(u + t for u, _, t in ordered)),
        "normalised": digest("".join(u + normalise(t) for u, _, t in ordered)),
        "signals": digest(json.dumps(signals, sort_keys=True)),
    }


async def read_one(client, url, plan, robots, throttle) -> dict | None:
    home, home_html = await fetch_page(client, url, robots, throttle)
    if classify(home, url) != "ok" or not home_html:
        return None
    pages = [(url, home_html, visible_text(home_html))]
    keywords = list(getattr(plan, "link_keywords", []) or [])
    for target in select_links(home_html, url, MAX_PAGES - 1, keywords):
        page, html = await fetch_page(client, target, robots, throttle)
        if html and (page.status or 0) < 400:
            pages.append((target, html, visible_text(html)))
    sig = tech_signals.detect("\n".join(h for _, h, _ in pages))
    return levels(pages, {"vendors": sig.vendors, "generic": sig.generic})


async def run(market_id: str, sample: int, seed: int) -> dict:
    spec = json.loads(FIXTURES.read_text())
    fixture = next(m for m in spec["markets"] if m["id"] == market_id)
    app = json.loads((APP / f"{market_id}.json").read_text())
    pool = [b for b in app["businesses"]
            if b.get("site") and in_niche(b, fixture["categories"])]
    rng = random.Random(f"{seed}:{market_id}")
    rng.shuffle(pool)
    plan = plan_for_search(fixture["criteria"])

    throttle, robots = DomainThrottle(), RobotsCache()
    out: dict = {}
    async with httpx.AsyncClient(headers=HEADERS, timeout=TIMEOUT,
                                 follow_redirects=True, http2=True) as client:
        for b in pool:
            if len(out) >= sample:
                break
            url = normalise_url(b.get("site") or "")
            if not url:
                continue
            try:
                got = await read_one(client, url, plan, robots, throttle)
            except Exception:
                got = None
            if got:
                out[b["id"]] = {"name": b["name"], "url": url, **got}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="dental-phoenix")
    ap.add_argument("--sample", type=int, default=60)
    ap.add_argument("--seed", type=int, default=20260921)
    ap.add_argument("--snapshot", action="store_true",
                    help="record today's hashes as the baseline")
    ap.add_argument("--compare", action="store_true",
                    help="re-read and report the change rate against the baseline")
    args = ap.parse_args()
    if args.snapshot == args.compare:
        raise SystemExit("Pass exactly one of --snapshot or --compare.")

    path = DATA / f"change-baseline-{args.market}.json"

    if args.snapshot:
        got = asyncio.run(run(args.market, args.sample, args.seed))
        path.write_text(json.dumps(
            {"market": args.market, "taken_at": datetime.now(timezone.utc).isoformat(),
             "sites": got}, indent=2) + "\n")
        print(f"baseline: {len(got)} readable sites → {path.relative_to(ROOT)}")
        print("Re-run with --compare in seven days for the S0-20 figure, and "
              "today for the noise floor.")
        return 0

    if not path.exists():
        raise SystemExit(f"No baseline at {path.relative_to(ROOT)}. Run --snapshot first.")
    base = json.loads(path.read_text())
    taken = datetime.fromisoformat(base["taken_at"])
    age_h = (datetime.now(timezone.utc) - taken).total_seconds() / 3600

    now = asyncio.run(run(args.market, args.sample, args.seed))
    shared = [b for b in base["sites"] if b in now]
    changed = Counter()
    for bid in shared:
        for lvl in ("raw", "text", "normalised", "signals"):
            if base["sites"][bid][lvl] != now[bid][lvl]:
                changed[lvl] += 1

    n = len(shared)
    print(f"\n{args.market}: {n} sites readable in both reads, "
          f"baseline {age_h:.1f}h old")
    if age_h < 24:
        print("\n  This is a NOISE FLOOR, not a change rate. Nothing real changed\n"
              "  in this interval, so every 'change' below is our own measurement.\n")
    print(f"  {'level':<12}{'changed':>9}{'rate':>8}")
    for lvl in ("raw", "text", "normalised", "signals"):
        c = changed[lvl]
        print(f"  {lvl:<12}{c:>9}{100*c/n:>7.1f}%" if n else f"  {lvl:<12} n/a")
    if n and changed["raw"]:
        print(f"\n  raw / signals ratio: {changed['raw']}:{changed['signals']} — "
              f"alerting on raw HTML would fire "
              f"{changed['raw']/max(changed['signals'],1):.0f}x more often than "
              f"anything the engine could actually re-judge differently.")

    out = DATA / f"change-rate-{args.market}.json"
    out.write_text(json.dumps({
        "market": args.market, "baseline_age_hours": round(age_h, 2),
        "sites_compared": n, "changed": dict(changed),
        "is_noise_floor": age_h < 24,
    }, indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
