"""Our failures are never cached as facts about a business.

"Never blame the environment on the business" was already the rule for the
rates in the coverage report. The fetch cache was quietly breaking it for
verdicts: a timeout was written to disk like any other outcome, so one slow
moment became a permanent `couldnt_tell` for that business and no later run
would ever retry it.

Found when two 1,000-site crawls were run concurrently and the timeout rate
went from 16 per 1,000 to 197 and 267. That is our own contention, and it was
about to be frozen into the corpus as 464 businesses that "could not be read" —
dragging recall, the gate item already failing, for a reason that has nothing
to do with the sites.

The distinction is whose fact it is. `dead`, `blocked`, `robots_blocked`,
`thin`, `js_shell`, `social_only` and `http_error` are facts about the site and
stay true until the site changes, so they cache. `timeout`, `probe_error` and
`unknown` are facts about us.

    python3 stage0/tests/test_our_failures.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.absence import UNREADABLE_OUTCOMES  # noqa: E402
from engine.fetcher import (  # noqa: E402
    CACHE_VERSION, OUR_FAILURES, FetchCache, Page, SiteRead,
)

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def fresh() -> FetchCache:
    return FetchCache(Path(tempfile.mkdtemp()))


def read(outcome: str, url: str = "https://example.com") -> SiteRead:
    pages = ([Page(url=url, status=200, text="hi", chars=2, sha256="d")]
             if outcome == "ok" else [])
    return SiteRead(url=url, outcome=outcome, pages=pages)


def main() -> int:
    # --- our failures are not written
    for outcome in sorted(OUR_FAILURES):
        cache = fresh()
        cache.put(read(outcome))
        check(f"a {outcome} is not cached",
              cache.get("https://example.com") is None,
              "it would become a permanent couldn't-tell for that business")
        check(f"and the {outcome} is counted, not silently dropped",
              cache.our_failures == 1)

    # --- the site's facts still are
    for outcome in ("ok", "dead", "blocked", "robots_blocked", "thin",
                    "js_shell", "social_only", "http_error"):
        cache = fresh()
        cache.put(read(outcome))
        got = cache.get("https://example.com")
        check(f"a {outcome} is still cached",
              got is not None and got.outcome == outcome,
              "re-crawling a site to re-learn a fact about it is impolite")

    # --- entries written before the rule are evicted, not served
    cache = fresh()
    good = read("ok")
    cache.put(good)
    path = cache._path(good.url)
    raw = json.loads(path.read_text())
    raw["outcome"] = "timeout"
    raw["v"] = CACHE_VERSION
    path.write_text(json.dumps(raw))

    after = FetchCache(cache.dir)
    check("a pre-existing cached timeout is evicted, not served",
          after.get(good.url) is None and after.evicted == 1)
    check("and it is gone from disk, so the next run re-crawls it",
          not path.exists())

    # --- the two sets have to stay coherent
    check(
        "every one of our failures is also an unreadable outcome",
        OUR_FAILURES <= UNREADABLE_OUTCOMES,
        "absence.py must never settle a criterion on a read we botched",
    )
    check(
        "the site's own unreadable outcomes are not counted as ours",
        {"dead", "blocked", "robots_blocked", "js_shell", "social_only"}
        .isdisjoint(OUR_FAILURES),
        "those are answers about the site, and re-crawling will not change them",
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
