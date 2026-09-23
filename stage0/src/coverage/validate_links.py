"""Does keeping link targets actually recover contacts? (S1-05b)

`fetcher.py` now stores `mailto:`, `tel:` and social links per page. The cache
was deliberately **not** invalidated to collect them: a `CACHE_VERSION` bump
would re-crawl 1,654 sites to gain one field, and this repository already
decided that crawling a hundred sites again to re-run a regex is impolite. Old
entries simply lack the field; new crawls carry it.

That leaves the claim untested, so this crawls a small sample fresh and
measures it. What it answers: how much of the 0.5% social rate and the 39%
email rate were artefacts of storing visible text only.

Polite by the same rules as every other crawl here — robots.txt, per-domain
throttling, a real user agent — and it writes nothing to the shared cache.

    python3 stage0/src/coverage/validate_links.py --sample 80
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.fetcher import MAX_PAGES, SOCIAL_HOSTS, contact_links  # noqa: E402
from coverage.site_probe import (  # noqa: E402
    HEADERS, TIMEOUT, DomainThrottle, RobotsCache, classify, fetch_page,
    normalise_url, select_links, visible_text,
)

APP = ROOT / "public" / "data"
DATA = ROOT / "stage0" / "data"
EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def emails_from_links(links: list[str]) -> set[str]:
    out = set()
    for link in links:
        if link.lower().startswith("mailto:"):
            addr = link[7:].split("?")[0].strip()
            if EMAIL.fullmatch(addr):
                out.add(addr.lower())
    return out


def socials_from_links(links: list[str]) -> set[str]:
    return {
        host
        for link in links
        for host in SOCIAL_HOSTS
        if f"//{host}" in link.lower() or f".{host}" in link.lower()
    }


async def read_one(client, url, robots, throttle) -> dict | None:
    home, home_html = await fetch_page(client, url, robots, throttle)
    if classify(home, url) != "ok" or not home_html:
        return None
    pages = [(url, home_html)]
    for target in select_links(home_html, url, MAX_PAGES - 1, ["contact", "about"]):
        page, html = await fetch_page(client, target, robots, throttle)
        if html and (page.status or 0) < 400:
            pages.append((target, html))

    links: list[str] = []
    text = []
    for _, html in pages:
        for link in contact_links(html):
            if link not in links:
                links.append(link)
        text.append(visible_text(html))
    blob = " ".join(text)
    return {
        "pages": len(pages),
        "links": links,
        "emails_in_text": {m.group(0).lower() for m in EMAIL.finditer(blob)},
        "emails_in_links": emails_from_links(links),
        "socials_in_text": {
            h for h in SOCIAL_HOSTS if h in blob.lower()
        },
        "socials_in_links": socials_from_links(links),
    }


async def run(sample: int, seed: int) -> dict:
    pool: list[str] = []
    for path in sorted(APP.glob("*.json")):
        if path.name == "index.json" or path.name.startswith("contacts-"):
            continue
        market = json.loads(path.read_text())
        pool += [
            b["site"] for b in market.get("businesses", []) if b.get("site")
        ]
    rng = random.Random(seed)
    rng.shuffle(pool)

    throttle, robots = DomainThrottle(), RobotsCache()
    got: list[dict] = []
    async with httpx.AsyncClient(
        headers=HEADERS, timeout=TIMEOUT, follow_redirects=True, http2=True
    ) as client:
        for site in pool:
            if len(got) >= sample:
                break
            url = normalise_url(site or "")
            if not url:
                continue
            try:
                read = await read_one(client, url, robots, throttle)
            except Exception:
                read = None
            if read:
                got.append(read)
    return {"reads": got}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=80)
    ap.add_argument("--seed", type=int, default=20260923)
    args = ap.parse_args()

    out = asyncio.run(run(args.sample, args.seed))
    reads = out["reads"]
    n = len(reads)
    if not n:
        raise SystemExit("No site was readable. Nothing can be concluded.")

    tally = Counter()
    recovered_emails = 0
    for r in reads:
        tally["email_text"] += bool(r["emails_in_text"])
        tally["email_links"] += bool(r["emails_in_links"])
        tally["email_either"] += bool(r["emails_in_text"] or r["emails_in_links"])
        tally["social_text"] += bool(r["socials_in_text"])
        tally["social_links"] += bool(r["socials_in_links"])
        recovered_emails += len(r["emails_in_links"] - r["emails_in_text"])

    def pct(k: str) -> str:
        return f"{tally[k]:>4}  {100 * tally[k] / n:>5.1f}%"

    print(f"\n{n} sites read fresh, with link targets kept\n")
    print(f"  {'':<34}{'sites':>6}{'rate':>8}")
    print(f"  {'an email in visible text':<34}{pct('email_text')}")
    print(f"  {'an email only reachable via mailto:':<34}{pct('email_links')}")
    print(f"  {'either':<34}{pct('email_either')}")
    print(f"  {'a social URL in visible text':<34}{pct('social_text')}")
    print(f"  {'a social link in an href':<34}{pct('social_links')}")
    print(f"\n  {recovered_emails} addresses recovered that visible text alone missed.")

    lift = (tally["social_links"] / n) / max(tally["social_text"] / n, 1e-9)
    print(
        f"  Socials go from {100 * tally['social_text'] / n:.1f}% to "
        f"{100 * tally['social_links'] / n:.1f}% of sites — "
        f"{lift:.0f}x, and the difference is what was hiding in attributes."
        if tally["social_text"]
        else f"  Socials go from 0 sites to {tally['social_links']} of {n}."
    )

    dest = DATA / "link-recovery.json"
    dest.write_text(
        json.dumps(
            {
                "sites_read": n,
                "counts": dict(tally),
                "emails_recovered_from_mailto": recovered_emails,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"\n→ {dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
