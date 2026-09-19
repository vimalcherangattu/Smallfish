"""Measure how readable local business websites actually are (task S0-05).

This answers two Stage 0 questions at once:

1. What share of candidates have a website with enough text to judge? That share is
   the hard ceiling on the couldn't-tell rate — no prompt can beat it.
2. What share of criteria can technology detection settle with no model call? That
   is the main cost lever in the whole unit-economics model.

It also gives the first honest read on absence criteria, which `docs/critique.md`
argues are the riskiest part of the plan: for every site where a booking signal is
found only on a page beyond the homepage, a homepage-only judgment would have
produced a false match.

Crawling is deliberately polite. robots.txt is honoured, the crawler identifies
itself, requests are throttled per domain, and only public pages are read.

Usage:
    python3 stage0/src/coverage/site_probe.py --sample 300
    python3 stage0/src/coverage/site_probe.py --market hvac-tampa --sample 150
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import re
import sys
import time
import urllib.parse
import urllib.robotparser
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path

import duckdb
import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine import tech_signals  # noqa: E402

FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"
DATA = ROOT / "stage0" / "data"

USER_AGENT = (
    "SmallFishBot/0.1 (+https://smallfish.example/bot; "
    "local business relevance research; contact: hello@smallfish.example)"
)
HEADERS = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}

TIMEOUT = httpx.Timeout(20.0, connect=10.0)
GLOBAL_CONCURRENCY = 12
PER_DOMAIN_DELAY = 1.5  # seconds between requests to the same host

# A page with less than this much visible text cannot support an honest judgment.
THIN_TEXT_CHARS = 400
# Below this, with scripts present, the plain fetch almost certainly got a JS shell.
SHELL_TEXT_CHARS = 250

SOCIAL_HOSTS = (
    "facebook.com",
    "instagram.com",
    "linktr.ee",
    "linkedin.com",
    "twitter.com",
    "x.com",
    "yelp.com",
    "tiktok.com",
    "business.site",  # Google's own hosted mini-sites
)

# Fallback paths, used only when the homepage yields no matching link. Guessing
# paths is poor on its own — an early run had 18 of 24 guesses return 404 — so
# the real selection is link extraction below, which is what the engine's check
# plan will do too.
CANDIDATE_PATHS = [
    "/contact",
    "/services",
    "/book",
    "/appointments",
]

# Anchor text and href keywords that mark a page worth reading for the criteria
# in `benchmarks.json`, highest value first. Used to pick real links off the
# homepage rather than guessing URLs.
LINK_KEYWORDS: list[tuple[str, int]] = [
    ("book", 10),
    ("appointment", 10),
    ("schedule", 9),
    ("reserve", 7),
    ("quote", 8),
    ("estimate", 8),
    ("contact", 6),
    ("services", 5),
    ("treatments", 5),
    ("pricing", 3),
    ("about", 2),
]

_LINK = re.compile(r"<a\b[^>]*href=[\"']([^\"'#]+)[\"'][^>]*>(.*?)</a>", re.I | re.S)

_SCRIPT_STYLE = re.compile(r"<(script|style|noscript)\b.*?</\1>", re.I | re.S)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def visible_text(html: str) -> str:
    """Strip markup to roughly what a reader would see. No bs4 dependency."""
    stripped = _SCRIPT_STYLE.sub(" ", html)
    stripped = _TAG.sub(" ", stripped)
    return _WS.sub(" ", stripped).strip()


def count_scripts(html: str) -> int:
    return len(re.findall(r"<script\b", html, re.I))


def select_links(html: str, base_url: str, limit: int) -> list[str]:
    """Pick the pages most likely to carry criterion evidence, off the homepage.

    Scores same-host links by keywords in the href and the anchor text, which is
    what the engine's check plan does. Returns at most `limit` distinct URLs.
    """
    base_host = urllib.parse.urlsplit(base_url).netloc.lower().removeprefix("www.")
    scored: dict[str, int] = {}

    for href, anchor in _LINK.findall(html):
        url = urllib.parse.urljoin(base_url, href.strip())
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ("http", "https"):
            continue
        host = parts.netloc.lower().removeprefix("www.")
        if host != base_host:
            continue
        clean = urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
        if clean.rstrip("/") == base_url.rstrip("/"):
            continue

        haystack = f"{parts.path.lower()} {visible_text(anchor).lower()}"
        score = sum(weight for word, weight in LINK_KEYWORDS if word in haystack)
        if score:
            scored[clean] = max(scored.get(clean, 0), score)

    ranked = sorted(scored.items(), key=lambda kv: (-kv[1], len(kv[0])))
    return [url for url, _ in ranked[:limit]]


@dataclass
class PageResult:
    url: str
    status: int | None = None
    error: str | None = None
    text_chars: int = 0
    script_count: int = 0
    signals: dict = field(default_factory=dict)


@dataclass
class SiteResult:
    """One business's website, as the engine would see it."""

    place_id: str
    name: str
    category: str
    website: str
    host: str = ""
    outcome: str = "unknown"
    # unknown | ok | thin | js_shell | social_only | robots_blocked
    # | dead | timeout | tls_error | http_error
    homepage_text_chars: int = 0
    pages_fetched: int = 0
    links_from_homepage: int = 0
    booking_signal: bool = False
    booking_on_homepage: bool = False
    booking_only_beyond_homepage: bool = False
    booking_vendors: list[str] = field(default_factory=list)
    quote_form_signal: bool = False
    chat_signal: bool = False
    cms: list[str] = field(default_factory=list)
    elapsed_s: float = 0.0
    pages: list[PageResult] = field(default_factory=list)


class DomainThrottle:
    """One in-flight request per host, spaced by PER_DOMAIN_DELAY."""

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}
        self._last: dict[str, float] = {}

    async def wait(self, host: str) -> None:
        lock = self._locks.setdefault(host, asyncio.Lock())
        async with lock:
            last = self._last.get(host)
            if last is not None:
                delay = PER_DOMAIN_DELAY - (time.monotonic() - last)
                if delay > 0:
                    await asyncio.sleep(delay)
            self._last[host] = time.monotonic()


class RobotsCache:
    """robots.txt per host, fetched once, failing open only on network errors."""

    def __init__(self) -> None:
        self._cache: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def allowed(self, client: httpx.AsyncClient, url: str) -> bool:
        parts = urllib.parse.urlsplit(url)
        host = parts.netloc
        lock = self._locks.setdefault(host, asyncio.Lock())
        async with lock:
            if host not in self._cache:
                self._cache[host] = await self._fetch(client, parts)
        parser = self._cache[host]
        if parser is None:
            # No reachable robots.txt means no stated restriction.
            return True
        return parser.can_fetch(USER_AGENT, url)

    async def _fetch(
        self, client: httpx.AsyncClient, parts: urllib.parse.SplitResult
    ) -> urllib.robotparser.RobotFileParser | None:
        robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
        try:
            resp = await client.get(robots_url, headers=HEADERS, timeout=TIMEOUT)
        except Exception:
            return None
        if resp.status_code != 200 or not resp.text.strip():
            return None
        parser = urllib.robotparser.RobotFileParser()
        parser.parse(resp.text.splitlines())
        return parser


def normalise_url(raw: str) -> str | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parts = urllib.parse.urlsplit(raw)
    if not parts.netloc or "." not in parts.netloc:
        return None
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path or "/", "", ""))


def is_social(url: str) -> bool:
    host = urllib.parse.urlsplit(url).netloc.lower().removeprefix("www.")
    return any(host == s or host.endswith("." + s) for s in SOCIAL_HOSTS)


async def fetch_page(
    client: httpx.AsyncClient,
    url: str,
    robots: RobotsCache,
    throttle: DomainThrottle,
) -> tuple[PageResult, str]:
    """Fetch one page. Returns the result and the raw HTML (empty on failure)."""
    result = PageResult(url=url)
    host = urllib.parse.urlsplit(url).netloc
    try:
        if not await robots.allowed(client, url):
            result.error = "robots_blocked"
            return result, ""
        await throttle.wait(host)
        resp = await client.get(url, headers=HEADERS, timeout=TIMEOUT)
        result.status = resp.status_code
        if resp.status_code >= 400:
            result.error = f"http_{resp.status_code}"
            return result, ""
        ctype = resp.headers.get("content-type", "")
        if "html" not in ctype and ctype:
            result.error = "not_html"
            return result, ""
        html = resp.text
        result.text_chars = len(visible_text(html))
        result.script_count = count_scripts(html)
        result.signals = tech_signals.detect(html).as_dict()
        return result, html
    except httpx.TimeoutException:
        result.error = "timeout"
    except httpx.ProxyError as exc:
        # Our own network path, not the site. Must not be counted against the
        # site, or the couldn't-tell floor is inflated by our environment.
        result.error = f"proxy_error:{type(exc).__name__}"
    except (httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError) as exc:
        result.error = f"connect_error:{type(exc).__name__}"
    except Exception as exc:  # noqa: BLE001 — probe must never die on one site
        result.error = f"error:{type(exc).__name__}"
    return result, ""


# Status codes that mean "a server answered and refused us", which is bot
# protection far more often than a missing site. Worth its own outcome: it is
# addressable (identify the crawler, back off, negotiate) in a way death is not.
BLOCKED_STATUSES = {401, 402, 403, 405, 406, 409, 418, 429, 451}


def classify(homepage: PageResult, url: str) -> str:
    if is_social(url):
        return "social_only"
    error = homepage.error or ""
    if error == "robots_blocked":
        return "robots_blocked"
    if error.startswith("proxy_error"):
        return "probe_error"
    if error == "timeout":
        return "timeout"
    if error.startswith("http_"):
        try:
            code = int(error.removeprefix("http_"))
        except ValueError:
            return "http_error"
        return "blocked" if code in BLOCKED_STATUSES else "http_error"
    if error.startswith("connect_error"):
        return "dead"
    if error:
        return "dead"
    if homepage.text_chars < SHELL_TEXT_CHARS and homepage.script_count >= 3:
        return "js_shell"
    if homepage.text_chars < THIN_TEXT_CHARS:
        return "thin"
    return "ok"


async def probe_site(
    client: httpx.AsyncClient,
    row: dict,
    robots: RobotsCache,
    throttle: DomainThrottle,
    sem: asyncio.Semaphore,
    extra_pages: int,
) -> SiteResult:
    url = normalise_url(row["website"])
    site = SiteResult(
        place_id=row["id"],
        name=row["name"] or "",
        category=row["category"] or "",
        website=row["website"],
    )
    if url is None:
        site.outcome = "dead"
        return site
    site.host = urllib.parse.urlsplit(url).netloc

    started = time.monotonic()
    async with sem:
        homepage, html = await fetch_page(client, url, robots, throttle)
        site.pages.append(homepage)
        site.homepage_text_chars = homepage.text_chars
        site.outcome = classify(homepage, url)

        merged = (
            tech_signals.TechSignals(**homepage.signals)
            if homepage.signals
            else tech_signals.TechSignals()
        )
        site.booking_on_homepage = merged.has("booking")

        # Only walk further when the homepage was readable. This mirrors the
        # engine's check plan: go to the pages a criterion needs, no further.
        if site.outcome in ("ok", "thin") and extra_pages:
            targets = select_links(html, url, extra_pages)
            site.links_from_homepage = len(targets)
            if not targets:
                targets = [
                    urllib.parse.urljoin(url, p) for p in CANDIDATE_PATHS[:extra_pages]
                ]
            for page_url in targets:
                page, _ = await fetch_page(client, page_url, robots, throttle)
                site.pages.append(page)
                if page.signals:
                    merged = merged.merge(tech_signals.TechSignals(**page.signals))

        site.booking_signal = merged.has("booking")
        site.booking_only_beyond_homepage = (
            site.booking_signal and not site.booking_on_homepage
        )
        site.booking_vendors = merged.vendors.get("booking", [])
        site.quote_form_signal = merged.has("quote_form")
        site.chat_signal = merged.has("chat")
        site.cms = merged.vendors.get("cms", [])

    site.pages_fetched = sum(1 for p in site.pages if p.status == 200)
    site.elapsed_s = round(time.monotonic() - started, 2)
    return site


def load_sample(market_id: str, sample: int, seed: int) -> list[dict]:
    path = DATA / f"overture-{market_id}.parquet"
    if not path.exists():
        raise SystemExit(
            f"Missing {path}. Run stage0/src/coverage/overture_extract.py first."
        )
    con = duckdb.connect()
    rows = con.execute(
        f"""
        SELECT id, name, category, websites[1] AS website
        FROM read_parquet('{path}')
        WHERE len(websites) > 0
          AND trim(coalesce(websites[1], '')) <> ''
          AND is_primary_category
        """
    ).fetchall()
    cols = ["id", "name", "category", "website"]
    records = [dict(zip(cols, r)) for r in rows]
    random.Random(seed).shuffle(records)
    return records[:sample]


def summarise(market_id: str, results: list[SiteResult]) -> dict:
    outcomes = Counter(r.outcome for r in results)

    # Sites our own environment failed on are excluded from every rate, so a
    # proxy hiccup never shows up as a business having no readable website.
    scored = [r for r in results if r.outcome != "probe_error"]
    n = len(scored)
    judgeable = outcomes["ok"]
    booking = [r for r in scored if r.outcome in ("ok", "thin")]
    with_booking = [r for r in booking if r.booking_signal]
    hidden = [r for r in booking if r.booking_only_beyond_homepage]

    return {
        "market": market_id,
        "sampled": len(results),
        "scored": n,
        "excluded_probe_errors": outcomes.get("probe_error", 0),
        "outcomes": dict(outcomes),
        "judgeable_pct": round(100 * judgeable / n, 1) if n else 0.0,
        "couldnt_tell_floor_pct": round(100 * (n - judgeable) / n, 1) if n else 0.0,
        "booking": {
            "sites_considered": len(booking),
            "booking_signal_found": len(with_booking),
            "booking_signal_pct": (
                round(100 * len(with_booking) / len(booking), 1) if booking else 0.0
            ),
            "found_only_beyond_homepage": len(hidden),
            "homepage_only_false_match_pct": (
                round(100 * len(hidden) / len(booking), 1) if booking else 0.0
            ),
            "top_vendors": Counter(
                v for r in with_booking for v in r.booking_vendors
            ).most_common(10),
        },
        "quote_form_signal_pct": (
            round(100 * sum(r.quote_form_signal for r in booking) / len(booking), 1)
            if booking
            else 0.0
        ),
        "chat_signal_pct": (
            round(100 * sum(r.chat_signal for r in booking) / len(booking), 1)
            if booking
            else 0.0
        ),
        "top_cms": Counter(c for r in scored for c in r.cms).most_common(8),
        "mean_homepage_text_chars": (
            round(sum(r.homepage_text_chars for r in scored) / n) if n else 0
        ),
        "link_selection": {
            "sites_with_matching_links": sum(1 for r in booking if r.links_from_homepage),
            "mean_links_selected": (
                round(sum(r.links_from_homepage for r in booking) / len(booking), 1)
                if booking
                else 0.0
            ),
        },
        "total_pages_fetched": sum(r.pages_fetched for r in results),
    }


async def run_market(market_id: str, sample: int, seed: int, extra_pages: int) -> dict:
    records = load_sample(market_id, sample, seed)
    print(f"→ {market_id}: probing {len(records)} sites", flush=True)

    robots = RobotsCache()
    throttle = DomainThrottle()
    sem = asyncio.Semaphore(GLOBAL_CONCURRENCY)

    limits = httpx.Limits(max_connections=GLOBAL_CONCURRENCY * 2)
    async with httpx.AsyncClient(
        follow_redirects=True, limits=limits, verify=True
    ) as client:
        tasks = [
            probe_site(client, r, robots, throttle, sem, extra_pages) for r in records
        ]
        results: list[SiteResult] = []
        for i, coro in enumerate(asyncio.as_completed(tasks), 1):
            results.append(await coro)
            if i % 25 == 0:
                print(f"   {i}/{len(records)}", flush=True)

    out = DATA / f"siteprobe-{market_id}.jsonl"
    with out.open("w") as fh:
        for r in results:
            fh.write(json.dumps(asdict(r)) + "\n")

    summary = summarise(market_id, results)
    summary["detail"] = str(out.relative_to(ROOT))
    return summary


async def main_async(args) -> int:
    spec = json.loads(FIXTURES.read_text())
    markets = spec["markets"]
    if args.market:
        markets = [m for m in markets if m["id"] == args.market]
        if not markets:
            raise SystemExit(f"Unknown market: {args.market}")

    summaries = []
    for market in markets:
        summary = await run_market(
            market["id"], args.sample, args.seed, args.extra_pages
        )
        summaries.append(summary)
        print(
            f"   judgeable {summary['judgeable_pct']}% · "
            f"booking signal {summary['booking']['booking_signal_pct']}% · "
            f"hidden beyond homepage {summary['booking']['homepage_only_false_match_pct']}%\n",
            flush=True,
        )

    out = DATA / "siteprobe-summary.json"
    out.write_text(json.dumps(summaries, indent=2) + "\n")
    print(f"Summary → {out.relative_to(ROOT)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--market", help="Limit to one market id")
    parser.add_argument("--sample", type=int, default=200, help="Sites per market")
    parser.add_argument("--seed", type=int, default=1, help="Sampling seed")
    parser.add_argument(
        "--extra-pages",
        type=int,
        default=4,
        help="Pages beyond the homepage to try, from the check-plan list",
    )
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
