"""Change detection must not measure itself (S0-20).

The alert engine's cost scales with retention — every customer who stays adds a
weekly re-read forever — so the weekly change rate is the number Change 4 turns
on. Measuring it naively answers the wrong question.

Measured same-day, minutes apart, on 60 dental sites where **nothing real
changed**:

    raw HTML          31.7%  "changed"
    visible text       6.7%
    normalised text    5.0%
    detected signals   0.0%

A third of the alert volume would be phantom if built on raw HTML — CSRF
tokens, session ids, rotating testimonials, a copyright year. And the level the
engine actually judges on did not move at all, which is what makes a cheap
alert possible: re-crawl, compare signals, and only pay for a re-judge when
something the rubric could care about moved.

    python3 stage0/tests/test_change_rate.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.change_rate import digest, levels, normalise  # noqa: E402

DATA = ROOT / "stage0" / "data"
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def page(url, html, text):
    return (url, html, text)


def main() -> int:
    # --- normalisation flattens exactly the things that change without changing
    same = [
        ("a copyright year", "© 2025 Smile Dental", "© 2026 Smile Dental"),
        ("a posted time", "Updated 9:15 am", "Updated 11:42 pm"),
        ("a visitor counter", "1841 patients served", "1902 patients served"),
        ("whitespace", "Book  an\n\nappointment", "Book an appointment"),
    ]
    for label, a, b in same:
        check(f"{label} is not a change", normalise(a) == normalise(b))

    real = [
        ("a new dentist", "Dr. Haddad welcomes patients",
         "Dr. Haddad, Dr. Lin and Dr. Okafor welcome patients"),
        ("a service added", "We offer cleanings",
         "We offer cleanings and Botox"),
        ("booking language", "Call us to schedule",
         "Book online and choose your time"),
    ]
    for label, a, b in real:
        check(f"{label} IS a change", normalise(a) != normalise(b),
              "over-normalising would hide the thing the alert exists for")

    # --- the four levels move independently, noisiest to most meaningful
    html_a = '<html><meta name="csrf" content="abc123"><body>Call us to schedule</body></html>'
    html_b = '<html><meta name="csrf" content="zzz999"><body>Call us to schedule</body></html>'
    txt = "Call us to schedule"
    sig = {"vendors": {}, "generic": {"booking": False}}
    a = levels([page("/", html_a, txt)], sig)
    b = levels([page("/", html_b, txt)], sig)
    check("a rotated CSRF token changes the raw hash", a["raw"] != b["raw"])
    check("and does NOT change the text hash", a["text"] == b["text"])
    check("and does NOT change the signals hash", a["signals"] == b["signals"],
          "this is the whole reason a cheap alert is possible")

    c = levels([page("/", html_a, txt)], {"vendors": {"booking": ["calendly"]},
                                          "generic": {"booking": True}})
    check("a booking vendor appearing DOES change the signals hash",
          a["signals"] != c["signals"])

    # --- page order must not read as a change
    two = [page("/a", "<i>A</i>", "A"), page("/b", "<i>B</i>", "B")]
    check("re-ordering the pages read is not a change",
          levels(two, sig) == levels(list(reversed(two)), sig))

    # --- the measured floor is on disk and labelled as a floor, not a rate
    p = DATA / "change-rate-dental-phoenix.json"
    if p.exists():
        m = json.loads(p.read_text())
        check("the same-day run is recorded as a noise floor, not a change rate",
              m.get("is_noise_floor") is True,
              "a floor reported as a rate would inflate every alert estimate")
        ch = m.get("changed", {})
        check("signals were perfectly stable across a same-day re-read",
              ch.get("signals", 0) == 0)
        check("raw HTML was not",
              ch.get("raw", 0) > 0,
              "if raw were stable too, the levels would be measuring nothing")
    else:
        print("  skip  no measured run on disk yet")

    check("digest is stable and short", digest("x") == digest("x") and len(digest("x")) == 16)

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
