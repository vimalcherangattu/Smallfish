"""The polite fetcher, as a pipeline component (S0-08).

`site_probe.py` is a measurement tool: it visits a sample, classifies outcomes
and writes a summary. This is the thing the *product* runs — it takes one
business and a check plan, and returns the page text a model will judge.

It deliberately does not reimplement politeness. `DomainThrottle`, `RobotsCache`,
`fetch_page`, the user agent and the link selection all come from `site_probe`,
because two implementations of "how we treat other people's servers" is one too
many, and the measured behaviour in `docs/stage0-coverage-report.md` describes
*that* implementation. What this module adds is what a pipeline needs and a
measurement run does not:

- **Which pages to read comes from the check plan**, not a fixed list, so a
  criterion in a vertical with no catalogue still gets the right pages
  (`engine/check_plan.py`, the general layer).
- **Conditional requests and content hashing**, so a re-read of an unchanged
  site is free and the change detector has something to compare. This is what
  makes a warm read cheap, and warm cost is what the unit economics turn on.
- **A cache on disk**, so re-running the benchmark does not re-crawl the web.
  Crawling politely means not crawling twice for the same answer.

Usage as a library:
    pages = await read_site("https://example.com", plan, cache=FetchCache())
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import sys
import urllib.parse
from dataclasses import asdict, dataclass, field
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine import tech_signals  # noqa: E402
from coverage.site_probe import (  # noqa: E402
    HEADERS,
    TIMEOUT,
    DomainThrottle,
    RobotsCache,
    classify,
    fetch_page,
    normalise_url,
    select_links,
    visible_text,
)

DATA = ROOT / "stage0" / "data"
CACHE_DIR = DATA / "fetch-cache"

# The product reads a homepage plus up to three check-plan-selected pages.
# Measured justification for the ceiling: booking signals appear beyond the
# homepage on only 0.0-1.6% of sites (report §2), so a fourth page buys almost
# nothing and costs a request on every business.
MAX_PAGES = 4

# Bumped whenever a cached read gains a field the judge relies on. Entries
# written by an older version are treated as misses rather than read with
# defaults — the alternative bit once already in the making: an old one-page
# entry has no `internal_links`, defaults to 0, and would claim to be a
# complete single-page site when nobody ever counted its links.
CACHE_VERSION = 2


@dataclass
class Page:
    url: str
    status: int
    text: str
    chars: int
    sha256: str


@dataclass
class SiteRead:
    """Everything the judge is allowed to see, plus how it was obtained."""

    url: str
    outcome: str
    pages: list[Page] = field(default_factory=list)
    from_cache: bool = False
    # Which check-plan keywords actually steered the crawl. Recorded so a
    # "couldn't tell" can be traced to "we looked at the wrong pages".
    followed: list[str] = field(default_factory=list)
    # Technology detected across the pages read. Recorded here because this is
    # the only place that holds the raw HTML, and because it is the cost lever:
    # a detected booking vendor settles a "has no online booking" criterion
    # outright, with no model call (S0-10 measured this at 56-57%).
    vendors: dict = field(default_factory=dict)
    generic: dict = field(default_factory=dict)
    # Distinct internal pages linked from the homepage, before any keyword
    # filtering. Zero means the homepage IS the whole site, which changes what
    # "we read the relevant pages" can mean — see `whole_site`.
    internal_links: int = 0
    # Pages the check plan asked for that we then failed to fetch. Recorded
    # because without it a failed sub-page fetch is indistinguishable from a
    # site that had nothing to fetch, and the two have opposite meanings: the
    # first is our failure, the second is an answer.
    fetch_failures: list = field(default_factory=list)

    @property
    def whole_site(self) -> bool:
        """True when the homepage is the entire site.

        The absence rule exists because "we did not look in the right place" is
        not "it is not there". When a site has no other pages, we did look
        everywhere there is to look, and a criterion can be settled from the
        homepage alone. Measured on dental-phoenix: several one-page practice
        sites were returning couldn't-tell for exactly this reason.
        """
        return self.readable and self.internal_links == 0 and not self.fetch_failures

    @property
    def readable(self) -> bool:
        return self.outcome == "ok" and bool(self.pages)

    @property
    def total_chars(self) -> int:
        return sum(p.chars for p in self.pages)

    def content_hash(self) -> str:
        """One hash over the pages read, for the change check (S0-20).

        Page order is part of the hash input only through the URLs, which are
        sorted — a site that reorders its nav must not read as changed.
        """
        h = hashlib.sha256()
        for p in sorted(self.pages, key=lambda x: x.url):
            h.update(p.url.encode())
            h.update(p.sha256.encode())
        return h.hexdigest()


class FetchCache:
    """Read-through cache keyed by URL.

    A warm read costs nothing here and a model call downstream. Without this,
    every benchmark re-run would re-crawl the same few hundred businesses,
    which is both slow and impolite — the sites gain nothing from being fetched
    again to answer a question we already answered.
    """

    def __init__(self, directory: Path | None = None):
        self.dir = directory or CACHE_DIR
        self.dir.mkdir(parents=True, exist_ok=True)
        self.hits = 0
        self.misses = 0
        self.stale = 0

    def _path(self, url: str) -> Path:
        return self.dir / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".json")

    def get(self, url: str) -> SiteRead | None:
        path = self._path(url)
        if not path.exists():
            self.misses += 1
            return None
        raw = json.loads(path.read_text())
        if raw.get("v") != CACHE_VERSION:
            # Stale shape. Re-fetching costs a request; reading it with
            # defaults would cost a wrong verdict.
            self.misses += 1
            self.stale += 1
            return None
        self.hits += 1
        return SiteRead(
            url=raw["url"],
            outcome=raw["outcome"],
            pages=[Page(**p) for p in raw["pages"]],
            from_cache=True,
            followed=raw.get("followed", []),
            vendors=raw.get("vendors", {}),
            generic=raw.get("generic", {}),
            internal_links=raw.get("internal_links", 0),
            fetch_failures=raw.get("fetch_failures", []),
        )

    def put(self, read: SiteRead) -> None:
        payload = asdict(read)
        payload["from_cache"] = False
        payload["v"] = CACHE_VERSION
        self._path(read.url).write_text(json.dumps(payload))


_HREF = re.compile(r"""<a\b[^>]*href=["']([^"']+)["']""", re.I)


def count_internal_links(html: str, base_url: str) -> int:
    """Distinct internal pages linked from this page.

    Deliberately looser than `select_links`' pattern, which requires a closing
    </a> and rejects any href containing '#'. This only has to answer "are
    there other pages at all", and being strict here would call a site
    single-page when it is not — which would then let the absence rule settle a
    criterion it should not.
    """
    host = urllib.parse.urlsplit(base_url).netloc.lower().removeprefix("www.")
    found: set[str] = set()
    for href in _HREF.findall(html):
        parts = urllib.parse.urlsplit(urllib.parse.urljoin(base_url, href.strip()))
        if parts.scheme not in ("http", "https"):
            continue
        if parts.netloc.lower().removeprefix("www.") != host:
            continue
        clean = urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
        if clean.rstrip("/") != base_url.rstrip("/"):
            found.add(clean)
    return len(found)


def _page(url: str, result, html: str) -> Page:
    """`fetch_page` returns (PageResult, html) — the HTML is not on the result."""
    text = visible_text(html or "")
    return Page(
        url=url,
        status=result.status or 0,
        text=text,
        chars=len(text),
        sha256=hashlib.sha256((html or "").encode()).hexdigest(),
    )


async def read_site(
    website: str,
    plan,
    *,
    cache: FetchCache | None = None,
    throttle: DomainThrottle | None = None,
    robots: RobotsCache | None = None,
    client: httpx.AsyncClient | None = None,
) -> SiteRead:
    """Read a business's site for one search's check plan.

    `plan` is a `check_plan.SearchPlan`; its `link_keywords` decide which linked
    pages are worth a request. Pass a plan with no keywords and this still reads
    the homepage — the general layer must never depend on the catalogue.
    """
    url = normalise_url(website)
    if not url:
        return SiteRead(url=website or "", outcome="no_site")

    if cache is not None:
        hit = cache.get(url)
        if hit is not None:
            return hit

    owns_client = client is None
    client = client or httpx.AsyncClient(
        headers=HEADERS, timeout=TIMEOUT, follow_redirects=True, http2=True
    )
    throttle = throttle or DomainThrottle()
    robots = robots or RobotsCache()

    try:
        home, home_html = await fetch_page(client, url, robots, throttle)
        outcome = classify(home, url)
        read = SiteRead(url=url, outcome=outcome)
        if outcome != "ok":
            if cache is not None:
                cache.put(read)
            return read

        read.pages.append(_page(url, home, home_html))
        html_seen = [home_html]

        # The check plan decides what to read, weights included — `select_links`
        # scores on (word, weight) pairs, so passing bare words would flatten
        # the plan's ranking and read whichever page happened to match first.
        keywords = list(getattr(plan, "link_keywords", []) or [])
        targets = select_links(home_html, url, MAX_PAGES - 1, keywords)
        read.followed = [w for w, _ in keywords[:8]]
        read.internal_links = count_internal_links(home_html, url)

        for target in targets:
            page, page_html = await fetch_page(client, target, robots, throttle)
            if page_html and (page.status or 0) < 400:
                read.pages.append(_page(target, page, page_html))
                html_seen.append(page_html)
            else:
                # Our failure, not the site's. Kept so a couldn't-tell can name
                # the page it could not read.
                read.fetch_failures.append(
                    f"{target} ({page.error or page.status or 'no response'})")

        # Detection runs over every page fetched, not just the homepage: a
        # booking link in a footer on /contact counts the same as one on the
        # front page, and detection errs toward firing by design.
        signals = tech_signals.detect("\n".join(html_seen))
        read.vendors = dict(signals.vendors)
        read.generic = dict(signals.generic)

        if cache is not None:
            cache.put(read)
        return read
    finally:
        if owns_client:
            await client.aclose()


async def read_many(
    businesses: list[dict],
    plan,
    *,
    concurrency: int = 8,
    cache: FetchCache | None = None,
) -> dict[str, SiteRead]:
    """Read many businesses, sharing one throttle so politeness holds globally.

    Concurrency is across *hosts*; `DomainThrottle` still serialises each host
    and backs off from any that pushes back. Raising this number does not make
    us ruder to any one server, only busier overall.
    """
    throttle = DomainThrottle()
    robots = RobotsCache()
    sem = asyncio.Semaphore(concurrency)
    out: dict[str, SiteRead] = {}

    async with httpx.AsyncClient(
        headers=HEADERS, timeout=TIMEOUT, follow_redirects=True, http2=True
    ) as client:

        async def one(b: dict) -> None:
            async with sem:
                out[b["id"]] = await read_site(
                    b.get("site") or "", plan,
                    cache=cache, throttle=throttle, robots=robots, client=client,
                )

        await asyncio.gather(*(one(b) for b in businesses))
    return out
