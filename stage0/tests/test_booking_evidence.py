"""A vendor hit must prove a customer can book, not that a business buys software.

Found by reading false negatives in the first hand-labelled run, not by a test.
Two of the three businesses the engine wrongly rejected on "has no online
booking" were rejected by the *detector*, before any model saw them:

- Palm Valley Pediatric Dentistry — `dentrix.com` appeared on the page. Dentrix
  is dental practice-management software. A footer "powered by" link says
  nothing about whether a patient can book.
- Wright Orthodontics — a generic booking word, no vendor. Not fixed here; the
  generic patterns are the other half of the problem and this file does not
  claim otherwise.

The category error ran through the whole niche catalogue: analytics
(dental_intelligence), patient messaging (solutionreach, lighthouse360,
revenuewell, modento, allydvm, patientnow) and distribution (covetrus) were all
being read as booking evidence. A comment in the file already said exactly this
about Weave and the lesson had not been generalised.

This file pins the distinction in both directions, because both directions are
easy to break by adding one hostname:

    python3 stage0/tests/test_booking_evidence.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.tech_signals import BOOKING_VENDORS, detect  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def fires(html: str) -> bool:
    return bool(detect(html).vendors.get("booking"))


def main() -> int:
    # --- back office is not booking evidence
    # Each of these is the shape that actually appears on a practice site: a
    # vendor credit or a script tag, with no patient-facing route.
    back_office = [
        ("dentrix", '<a href="https://www.dentrix.com">Powered by Dentrix</a>'),
        ("open dental", '<!-- site data from opendental.com -->'),
        ("kareo/tebra", '<script src="https://kareo.com/widget.js"></script>'),
        ("athenahealth", '<p>Records managed via athenahealth.com</p>'),
        ("practice fusion", '<a href="https://practicefusion.com">EHR</a>'),
        ("denticon", '<a href="https://denticon.com">Denticon</a>'),
        ("curve dental", '<a href="https://curvedental.com">Curve</a>'),
        ("ezyvet", '<a href="https://ezyvet.com">ezyVet</a>'),
        ("covetrus", '<img src="https://covetrus.com/logo.png">'),
    ]
    for name, html in back_office:
        check(f"bare {name} host is not booking", not fires(html), html)

    # --- the same vendor on a patient-facing route IS booking evidence
    # Detection errs toward firing: when the path says the patient goes there
    # to book, a false positive costs a missed match and a false negative
    # costs a false match. Only the second is expensive.
    patient_facing = [
        ("dentrix portal", 'href="https://www.dentrixascend.com/portal/xyz"'),
        ("open dental scheduling", 'href="https://opendental.com/appointment/new"'),
        ("tebra booking", 'href="https://tebra.com/book/dr-smith"'),
        ("athena scheduling", 'href="https://athenahealth.com/schedule/1234"'),
        ("curve hero booking", 'href="https://curvehero.com/book/abc"'),
        ("ezyvet appointments", 'href="https://ezyvet.com/appointment"'),
    ]
    for name, html in patient_facing:
        check(f"{name} is booking", fires(html), html)

    # --- real booking vendors are untouched by the retune
    # These are the ones whose entire product is "a customer picks a slot", so
    # a bare hostname is proof. Scoping them to a path would lose real matches.
    for name, html in [
        ("calendly", '<div class="calendly-inline-widget" data-url="https://calendly.com/x">'),
        ("zocdoc", '<a href="https://www.zocdoc.com/practice/x">Book online</a>'),
        ("acuity", '<script src="https://acuityscheduling.com/js/embed.js">'),
        ("nexhealth", '<iframe src="https://nexhealth.com/book/x">'),
        ("booksy", '<a href="https://booksy.com/en-us/1234">'),
    ]:
        check(f"{name} still fires on a bare host", fires(html), html)

    # --- pure comms, marketing and analytics are gone from the catalogue
    # Dropped rather than path-scoped: there is no path on these that means a
    # customer booked. Keeping them with a narrower pattern would imply there
    # is one.
    dropped = [
        "lighthouse360", "revenuewell", "solutionreach",
        "dental_intelligence", "modento", "allydvm", "patientnow",
    ]
    for vendor in dropped:
        check(
            f"{vendor} is not in the booking catalogue",
            vendor not in BOOKING_VENDORS,
            "it is messaging/analytics, not proof a customer can book",
        )

    # --- the rule itself, stated as a test
    # Any pattern that is a bare vendor hostname claims booking from the mere
    # presence of a business relationship. New entries have to be one of the
    # two kinds above, and this catches a third being added by accident.
    check(
        "no niche PMS/EHR vendor was re-added as a bare host",
        not any(
            any(p == rf"{v}\.com" for p in BOOKING_VENDORS.get(v, []))
            for v in ("dentrix", "opendental", "practicefusion", "athenahealth")
        ),
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
