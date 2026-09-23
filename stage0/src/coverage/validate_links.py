"""Does keeping link targets actually recover contacts? (S1-05b)

`fetcher.py` now stores `mailto:`, `tel:` and social links per page. The cache
was deliberately **not** invalidated to collect them: a `CACHE_VERSION` bump
would re-crawl 1,654 sites to gain one field, and this repository already
decided that crawling a hundred sites again to re-run a regex is impolite. Old
entries simply lack the field; new crawls carry it.

That leaves the claim untested, so this crawls a small sample fresh and
measures it. **Measured 2026-09-23, 25 sites read of 45 tried:**

    a social link in an href              17   68.0%
    a social URL in visible text           1    4.0%
    an email in visible text               9   36.0%
    an email only reachable via mailto:    9   36.0%
    either                                 9   36.0%

**Socials: 4% to 68%, a 17x recovery.** That is what was hiding in attributes,
and it is the whole justification for keeping link targets.

**Emails: no gain at all, and that half of the justification was wrong.** Every
mailto address on these sites was also printed in visible text — 9 sites had an
email either way, and `emails_recovered_from_mailto` is 0. The S1-05b commit
message claimed "socials and mailto-only addresses become extractable"; the
second half is measured false. `mailto:` is still worth storing because it
carries the address unambiguously where a regex over prose has to guess at
boundaries, but it finds nothing new.

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
    # (word, weight) pairs, not bare strings. Passing `["contact", "about"]`
    # makes `select_links` unpack each string into characters and raise
    # `ValueError: too many values to unpack` on every single site.
    for target in select_links(
        home_html, url, MAX_PAGES - 1, [("contact", 3), ("about", 2)]
    ):
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


async def run(sample: int, seed: int, max_attempts: int) -> dict:
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
    errors: dict[str, int] = {}
    attempts = 0
    # **Bounded, and the first version was not.** It looped until it had
    # `sample` *successful* reads, so with a slow or blocked network it could
    # grind for hours and report nothing — it ran 70 minutes for 30 sites
    # before being stopped. A measurement script that can run forever is a
    # measurement nobody gets. This one stops after a fixed number of attempts
    # and reports what it managed, with the attempt count, so a thin result is
    # visibly thin rather than silently partial.
    async with httpx.AsyncClient(
        headers=HEADERS, timeout=TIMEOUT, follow_redirects=True, http2=True
    ) as client:
        for site in pool:
            if len(got) >= sample or attempts >= max_attempts:
                break
            url = normalise_url(site or "")
            if not url:
                continue
            attempts += 1
            try:
                read = await read_one(client, url, robots, throttle)
            except Exception as exc:  # noqa: BLE001
                # **Counted and named, never swallowed.** The first version
                # turned every exception into "not readable", so a bug of mine
                # — passing bare strings where `select_links` wants (word,
                # weight) pairs — came back as the finding "no site was
                # readable". That is the failure mode this repository already
                # has a rule against: never report our own fault as a fact
                # about the businesses.
                errors[type(exc).__name__] = errors.get(type(exc).__name__, 0) + 1
                read = None
            if read:
                got.append(read)
    return {"reads": got, "attempts": attempts, "errors": errors}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=80)
    ap.add_argument("--seed", type=int, default=20260923)
    ap.add_argument("--max-attempts", type=int, default=90,
                    help="stop after this many sites tried, however few succeeded")
    args = ap.parse_args()

    out = asyncio.run(run(args.sample, args.seed, args.max_attempts))
    reads = out["reads"]
    n = len(reads)
    errors = out["errors"]
    failed = sum(errors.values())

    # Our own errors are not a measurement. Above a small rate, refuse to
    # report at all rather than publish a number that is really a bug — the
    # same guard `benchmark/run.py` grew after an outage was reported as a
    # finding.
    if failed and failed > 0.2 * out["attempts"]:
        raise SystemExit(
            f"{failed} of {out['attempts']} attempts raised: {errors}.\n"
            "That is our fault, not the sites'. Nothing is reported."
        )
    if not n:
        raise SystemExit(
            f"No site was readable in {out['attempts']} attempts, and none "
            "raised. That is a finding about the sample, not about us."
        )

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

    print(f"\n{n} sites read fresh of {out['attempts']} tried, "
          f"with link targets kept\n")
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
                "sites_attempted": out["attempts"],
                "counts": dict(tally),
                "emails_recovered_from_mailto": recovered_emails,
                "our_errors": errors,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"\n→ {dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
