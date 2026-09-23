"""Link targets kept by the fetcher, and kept narrowly (S1-05b).

A social URL appears in visible text on 9 of 1,654 readable sites — 0.5% —
because social links are icon anchors and the URL lives in the attribute. The
fetcher now keeps those attributes. What it must not do is keep everything:
a business's whole link graph is not a fact about the business, and storing it
would be storing a page copy by instalments, which this repository's data rules
forbid.

    python3 stage0/tests/test_contact_links.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.fetcher import CACHE_VERSION, contact_links  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def main() -> int:
    kept = contact_links(
        '<a href="mailto:hi@clinic.com?subject=Hi">Email</a>'
        '<a href="tel:+14805551234">Call</a>'
        '<a href="https://www.facebook.com/theclinic"><img src="fb.png"></a>'
        '<a href="https://instagram.com/theclinic/">IG</a>'
        "<a href='https://www.yelp.com/biz/theclinic'>Reviews</a>"
    )
    check("a mailto behind an icon is kept", "mailto:hi@clinic.com?subject=Hi" in kept)
    check("a tel: link is kept", "tel:+14805551234" in kept)
    check("a social profile is kept, though its anchor is an image",
          any("facebook.com/theclinic" in k for k in kept))
    check("single quotes are handled too", any("yelp.com" in k for k in kept))
    check("everything wanted was found", len(kept) == 5, f"got {len(kept)}")

    # --- and nothing else
    noise = contact_links(
        '<a href="/services">Services</a>'
        '<a href="https://cdn.example.com/style.css">css</a>'
        '<a href="https://competitor.com">A partner</a>'
        '<a href="/blog/2024/why-we-love-facebook.com-marketing">post</a>'
    )
    check("ordinary navigation is not stored", noise == [],
          f"kept {noise} — the link graph is not a fact about the business")

    check("a path that merely mentions a social host is not a social link",
          not any("facebook" in k for k in noise),
          "substring matching would have stored a blog post as a profile")

    dupes = contact_links(
        '<a href="mailto:hi@x.com">a</a><a href="mailto:hi@x.com">b</a>'
    )
    check("a link repeated in a header and a footer is stored once", len(dupes) == 1)

    check("order is the order it appears, so a header link comes first",
          contact_links(
              '<a href="tel:+1">t</a><a href="mailto:a@b.com">m</a>'
          ) == ["tel:+1", "mailto:a@b.com"])

    long_url = "https://facebook.com/" + "x" * 600
    check("a hostile length is truncated rather than stored whole",
          len(contact_links(f'<a href="{long_url}">x</a>')[0]) <= 300)

    check("no HTML at all is not an error", contact_links("") == []
          and contact_links(None) == [])

    # --- the cache was deliberately not invalidated
    check("CACHE_VERSION was not bumped for this field", CACHE_VERSION == 3,
          "a bump re-crawls 1,654 sites to collect one attribute")

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
