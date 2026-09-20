"""The crawler's user agent must point at a page that exists (S0-30).

Principle 7, "crawl politely and identify honestly", was measured rather than
assumed: S0-26 found that presenting as a browser instead would recover exactly
one readable site in 78, so honest identification costs almost nothing and
stays. But for a session the user agent pointed at `smallfish.example/bot`, a
domain that does not exist — thousands of site owners were asked to trust a URL
they could not open. That is the same class of failure as an invented verdict:
a claim with nothing behind it.

These tests pin the two halves together, because the failure mode is silent.
The crawler keeps working perfectly while the identity it advertises rots.

    python3 stage0/tests/test_crawler_identity.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from coverage import site_probe  # noqa: E402

PAGE = ROOT / "src" / "app" / "bot" / "page.tsx"

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def main() -> int:
    ua = site_probe.USER_AGENT

    # --- the user agent says who we are, where to read about it, how to reach us
    check("the user agent names the crawler", "SmallFishBot" in ua, ua)

    url_match = re.search(r"\+(\S+?);", ua)
    check("the user agent carries a URL", bool(url_match), ua)
    url = url_match.group(1) if url_match else ""

    check(
        "the URL is not a placeholder domain",
        ".example" not in urlparse(url).netloc,
        f"{url} — example domains do not resolve, so the identity is unverifiable",
    )
    check("the URL points at the identity page", url.endswith("/bot"), url)
    check("the user agent carries a contact", "contact:" in ua, ua)

    contact_match = re.search(r"contact:\s*(\S+?)\)", ua)
    check("the contact is an address, not a description", bool(contact_match), ua)
    contact = contact_match.group(1) if contact_match else ""
    check(
        "the contact is not a placeholder address",
        "@" in contact and not contact.endswith((".example", ".invalid", ".test")),
        f"{contact} — the page offers this as the route to have a business "
        f"removed, so a removal route that bounces is worse than none",
    )

    # --- the page the URL points at actually exists in this repo
    check("the identity page exists", PAGE.exists(), str(PAGE))
    if not PAGE.exists():
        return 1
    page = PAGE.read_text()

    # --- and it does not drift from the crawler's actual behaviour
    check(
        "the page and the probe agree on the contact address",
        site_probe.CONTACT in page,
        "site_probe.CONTACT and the page's CONTACT must match",
    )
    check(
        "the page states the per-host delay the probe uses",
        str(site_probe.PER_DOMAIN_DELAY) in page,
        f"probe waits {site_probe.PER_DOMAIN_DELAY}s; the page must say so",
    )
    check(
        "the page tells a site owner how to block us",
        "robots.txt" in page and "Disallow" in page,
    )
    check(
        "the page says we honour Retry-After, which the probe does",
        "Retry-After" in page and bool(site_probe.RETRY_AFTER_STATUSES),
    )
    check(
        "the page promises facts are stored, not page copies",
        "not copies of your pages" in page or "not page copies" in page,
    )
    check(
        "the page does not claim an unbuilt opt-out form is live",
        "planned and not yet built" in page,
        "S1-09 is not built; the page must not imply otherwise",
    )

    print("\n" + "=" * 50)
    if failures:
        print(f"{len(failures)} failure(s): {', '.join(failures)}")
        return 1
    print("Crawler identity is honest and resolvable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
