"""Find out what recovers bot-blocked sites (task S0-26).

Bot protection is the largest addressable slice of the ~40% couldn't-tell floor:
11–17% of every benchmark market returned 403 or 429, meaning a server answered and
refused us rather than the business having no readable site. Every point recovered
here comes straight off the floor.

This measures five strategies against the blocked set, from the most honest to the
least, so the recovery rate of each can be weighed against what it costs in
principle. Strategy E exists to quantify that cost, not to recommend it — see the
note on its definition.

Usage:
    python3 stage0/src/coverage/blocked_recovery.py
    python3 stage0/src/coverage/blocked_recovery.py --limit 30
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import urllib.parse
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from coverage.site_probe import (  # noqa: E402
    BLOCKED_STATUSES,
    SHELL_TEXT_CHARS,
    THIN_TEXT_CHARS,
    USER_AGENT,
    count_scripts,
    visible_text,
)

DATA = ROOT / "stage0" / "data"
MARKETS = ["med-spa-dallas", "dental-phoenix", "hvac-tampa"]

TIMEOUT = httpx.Timeout(25.0, connect=12.0)
CONCURRENCY = 8

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)

# Headers a real browser always sends. Sending them is not deception — the User-Agent
# still says who we are. Many WAFs reject requests purely for having a bare header
# set, so this is the cheapest honest thing to try.
COMPLETE_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

MINIMAL_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml",
}


@dataclass
class Strategy:
    key: str
    name: str
    note: str
    headers: dict
    http2: bool = False
    delay_s: float = 0.0


STRATEGIES = [
    Strategy(
        "A",
        "baseline",
        "What site_probe.py does today: bot UA, minimal headers, HTTP/1.1.",
        MINIMAL_HEADERS,
    ),
    Strategy(
        "B",
        "complete headers",
        "Bot UA kept, but the full header set a browser sends. Honest and cheap.",
        COMPLETE_HEADERS,
    ),
    Strategy(
        "C",
        "complete headers + HTTP/2",
        "As B over HTTP/2. Some WAFs score HTTP/1.1 requests as automated.",
        COMPLETE_HEADERS,
        http2=True,
    ),
    Strategy(
        "D",
        "patient retry",
        "As C after a delay, to separate rate limiting from a standing block.",
        COMPLETE_HEADERS,
        http2=True,
        delay_s=20.0,
    ),
    Strategy(
        "E",
        "browser user-agent",
        (
            "Measurement only. Presents as Chrome, which contradicts principle 7 "
            "(respect the businesses we read) and the promise to identify the "
            "crawler. Included to price what that principle costs, not to adopt."
        ),
        {**COMPLETE_HEADERS, "User-Agent": BROWSER_UA},
        http2=True,
    ),
]


def load_blocked() -> list[dict]:
    """Every site the main probe classified as blocked, deduplicated by host."""
    seen: set[str] = set()
    blocked: list[dict] = []
    for market in MARKETS:
        path = DATA / f"siteprobe-{market}.jsonl"
        if not path.exists():
            continue
        for line in path.open():
            row = json.loads(line)
            if row["outcome"] != "blocked" or row["host"] in seen:
                continue
            seen.add(row["host"])
            page = row["pages"][0] if row["pages"] else {}
            blocked.append(
                {
                    "market": market,
                    "host": row["host"],
                    "url": page.get("url") or row["website"],
                    "original_error": page.get("error"),
                }
            )
    return blocked


def classify_response(resp: httpx.Response) -> str:
    if resp.status_code in BLOCKED_STATUSES:
        return "blocked"
    if resp.status_code >= 400:
        return f"http_{resp.status_code}"
    text_chars = len(visible_text(resp.text))
    if text_chars < SHELL_TEXT_CHARS and count_scripts(resp.text) >= 3:
        return "js_shell"
    if text_chars < THIN_TEXT_CHARS:
        return "thin"
    return "ok"


async def try_one(
    client: httpx.AsyncClient, site: dict, strategy: Strategy, sem: asyncio.Semaphore
) -> str:
    async with sem:
        if strategy.delay_s:
            await asyncio.sleep(strategy.delay_s)
        try:
            resp = await client.get(
                site["url"], headers=strategy.headers, timeout=TIMEOUT
            )
            return classify_response(resp)
        except httpx.ProxyError:
            return "probe_error"
        except httpx.TimeoutException:
            return "timeout"
        except Exception as exc:  # noqa: BLE001
            return f"error:{type(exc).__name__}"


async def run_strategy(sites: list[dict], strategy: Strategy) -> dict:
    sem = asyncio.Semaphore(CONCURRENCY)
    limits = httpx.Limits(max_connections=CONCURRENCY * 2)
    async with httpx.AsyncClient(
        follow_redirects=True, http2=strategy.http2, limits=limits
    ) as client:
        outcomes = await asyncio.gather(
            *(try_one(client, s, strategy, sem) for s in sites)
        )

    counts = Counter(outcomes)
    # Sites our own network failed on are excluded from the rate, exactly as in
    # site_probe.py, so a proxy hiccup never looks like a recovery failure.
    scored = [o for o in outcomes if o != "probe_error"]
    recovered = sum(1 for o in scored if o in ("ok", "thin", "js_shell"))
    readable = sum(1 for o in scored if o == "ok")

    return {
        "strategy": strategy.key,
        "name": strategy.name,
        "note": strategy.note,
        "attempted": len(sites),
        "scored": len(scored),
        "recovered_any_content": recovered,
        "recovered_pct": round(100 * recovered / len(scored), 1) if scored else 0.0,
        "fully_readable": readable,
        "fully_readable_pct": round(100 * readable / len(scored), 1) if scored else 0.0,
        "outcomes": dict(counts),
        "per_site": dict(zip((s["host"] for s in sites), outcomes)),
    }


async def main_async(args) -> int:
    sites = load_blocked()
    if not sites:
        raise SystemExit(
            "No blocked sites found. Run stage0/src/coverage/site_probe.py first."
        )
    if args.limit:
        sites = sites[: args.limit]

    print(f"{len(sites)} blocked hosts from the benchmark markets\n")

    results = []
    for strategy in STRATEGIES:
        print(f"→ {strategy.key}. {strategy.name}", flush=True)
        result = await run_strategy(sites, strategy)
        results.append(result)
        print(
            f"   recovered {result['recovered_pct']}% "
            f"({result['recovered_any_content']}/{result['scored']}), "
            f"fully readable {result['fully_readable_pct']}%\n",
            flush=True,
        )

    # Which hosts stayed blocked no matter what we did honestly (A-D)?
    honest = [r for r in results if r["strategy"] in ("A", "B", "C", "D")]
    hard_blocked = [
        host
        for host in (s["host"] for s in sites)
        if all(r["per_site"].get(host) == "blocked" for r in honest)
    ]

    summary = {
        "blocked_hosts_tested": len(sites),
        "strategies": [{k: v for k, v in r.items() if k != "per_site"} for r in results],
        "hard_blocked_under_honest_strategies": len(hard_blocked),
        "hard_blocked_pct": round(100 * len(hard_blocked) / len(sites), 1),
        "hard_blocked_sample": hard_blocked[:15],
    }
    out = DATA / "blocked-recovery.json"
    out.write_text(json.dumps(summary, indent=2) + "\n")

    print(
        f"Hard-blocked under every honest strategy: {len(hard_blocked)}/{len(sites)} "
        f"({summary['hard_blocked_pct']}%)"
    )
    print(f"Summary → {out.relative_to(ROOT)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, help="Cap hosts tested, for a quick run")
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
