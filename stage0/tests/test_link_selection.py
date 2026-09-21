"""Link selection, which decides what the engine gets to read (S0-32, S0-08).

This is worth its own test file because it failed silently and expensively.
Two defects in one regex — an href containing '#' was rejected outright, and a
closing </a> was mandatory — meant that on many sites no page beyond the
homepage was ever fetched. The absence rule then correctly refused to settle
anything from a homepage alone, so the visible symptom was a *couldn't-tell
rate*, three layers away from the cause. Measured on dental-phoenix: one-page
reads were 91% couldn't-tell against 12% for four-page reads.

Nothing raised. Nothing logged. The engine looked like it was judging badly
when it was reading badly.

    python3 stage0/tests/test_link_selection.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from coverage.site_probe import select_links  # noqa: E402
from engine.fetcher import count_internal_links  # noqa: E402

BASE = "https://example.com/"
KW = [("book", 10), ("appointment", 10), ("contact", 5), ("services", 8)]

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def picks(html: str) -> list[str]:
    return select_links(html, BASE, 3, KW)


def main() -> int:
    # --- the two defects, as regression tests
    check(
        "an href with a fragment is read as its page",
        picks('<a href="/contact#form">Contact Us</a>') == ["https://example.com/contact"],
        "the fragment is discarded anyway; rejecting the whole href lost the page",
    )
    check(
        "an unclosed <a> does not hide the link",
        picks('<a href="/services">Services') == ["https://example.com/services"],
    )
    check(
        "an unclosed <a> does not hide every link after it",
        "https://example.com/book" in picks('<a href="/x">X<a href="/book">Book</a>'),
        "the old pattern swallowed the rest of the document",
    )

    # --- things that already worked and must keep working
    check("a plain link is picked", picks('<a href="/book">Book</a>'))
    check(
        "anchor text inside a nested element still scores",
        picks('<a href="/b"><span>Book Now</span></a>') == ["https://example.com/b"],
    )
    check("a query string is stripped to the path",
          picks('<a href="/appt?src=nav">Appointments</a>') == ["https://example.com/appt"])
    check("attributes after href do not break the match",
          picks('<a href="/contact" class="x" aria-label="c">Contact</a>'))

    # --- and the negatives, which matter more than the positives here
    check(
        "a same-page anchor is not a page",
        picks('<a href="#book">Book</a>') == [],
        "'#book' is the same document; fetching it again would waste a request",
    )
    check(
        "an off-host link is never followed",
        picks('<a href="https://elsewhere.com/book">Book</a>') == [],
        "we read the business's own site, not wherever it links",
    )
    check(
        "a mailto or tel is not a page",
        picks('<a href="mailto:a@b.com">Email</a><a href="tel:+1">Call</a>') == [],
    )
    check(
        "a link matching no keyword is not picked",
        picks('<a href="/privacy-policy">Privacy</a>') == [],
        "the check plan decides relevance; unrelated pages cost a request for nothing",
    )
    check(
        "the limit is respected",
        len(select_links(
            '<a href="/book">Book</a><a href="/contact">Contact</a>'
            '<a href="/services">Services</a><a href="/appointment">Appt</a>',
            BASE, 2, KW)) == 2,
    )

    # --- ranking: the check plan's weights must survive
    ranked = select_links(
        '<a href="/about-us">About</a><a href="/book">Book</a>',
        BASE, 2, [("book", 10), ("about", 2)])
    check("higher-weighted keywords rank first", ranked[0] == "https://example.com/book",
          f"{ranked}")

    # --- count_internal_links backs the single-page-site rule, so it must be
    #     LOOSER than select_links: calling a site single-page when it is not
    #     would let the absence rule settle a criterion nobody checked.
    check(
        "internal link counting sees pages select_links would skip",
        count_internal_links(
            '<a href="/privacy">P</a><a href="/x#y">X</a>', BASE) == 2,
        "unkeyworded and fragment links still prove the site has other pages",
    )
    check(
        "internal link counting ignores off-host and self links",
        count_internal_links(
            f'<a href="https://other.com/a">A</a><a href="{BASE}">Home</a>', BASE) == 0,
    )

    print("\n" + "=" * 50)
    if failures:
        print(f"{len(failures)} failure(s): {', '.join(failures)}")
        return 1
    print("Link selection behaves.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
