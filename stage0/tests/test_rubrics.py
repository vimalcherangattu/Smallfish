"""Every criterion carries a rubric, and both judges are shown the same one.

A criterion phrase is not self-defining. "Has no online booking" was the whole
benchmark's headline criterion for days before anyone asked what a form that
says *"fill out the short form and we'll contact you to confirm your
appointment time"* counts as. S&C Dental Scottsdale Ranch has a BOOK NOW
button in its navigation that leads to exactly that form.

Both answers are defensible. What is not defensible is the human and the model
each picking one privately: then every disagreement is scored as an engine
error when the two are answering different questions, and no amount of engine
work fixes it because nothing is wrong with the engine.

So the definition lives once, in `benchmarks.json`, and is rendered to the
labeller (`labelling_set.py`) and to the model (`judge.build_prompt`). This
file exists because the failure mode of that arrangement is drift, and drift
is invisible in every number the benchmark produces.

    python3 stage0/tests/test_rubrics.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from benchmark.labelling_set import build_tasks  # noqa: E402
from engine.judge import build_prompt  # noqa: E402
from engine.fetcher import Page, SiteRead  # noqa: E402

FIXTURES = ROOT / "stage0" / "fixtures"
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def main() -> int:
    spec = json.loads((FIXTURES / "benchmarks.json").read_text())
    all_criteria = [(m["id"], c) for m in spec["markets"] for c in m["criteria"]]

    # --- every criterion is defined, not just named
    for market, c in all_criteria:
        check(
            f"{market}/{c['id']} has a rubric",
            bool(c.get("rubric", "").strip()),
            "an undefined criterion is scored against whatever the labeller "
            "privately assumed",
        )
        check(
            f"{market}/{c['id']} rubric says more than the criterion text",
            len(c.get("rubric", "")) > len(c["text"]) + 40,
            "restating the phrase is not a definition",
        )

    # --- the booking rubric answers the case that prompted it
    booking = next(c for _, c in all_criteria if c["id"] == "no_online_booking")
    r = booking["rubric"].lower()
    check("the booking rubric rules on a request form",
          "request" in r and "confirm" in r,
          "the 'we will contact you to confirm' form is the common case")
    check("and tells the judge to ignore the button label",
          "button" in r or "destination" in r,
          "'Book Now' leading to a contact form is what fooled the detector")

    # --- the model is shown it
    read = SiteRead(
        url="https://example.com", outcome="ok",
        pages=[Page(url="https://example.com", status=200,
                    text="Call us to schedule.", chars=20, sha256="d")],
    )
    prompt, _ = build_prompt(read, [booking])
    check("the rubric reaches the model's prompt",
          booking["rubric"][:60] in prompt)
    check("and is labelled as the deciding rule, not as page text",
          "HOW TO DECIDE" in prompt)

    # --- and so is the labeller
    _, criteria, _ = build_tasks("dental-phoenix", 3, 20260921)
    check("the rubric reaches the labelling tool's criteria",
          all(c.get("rubric") for c in criteria))

    html = (ROOT / "stage0" / "src" / "benchmark" / "labelling_set.py").read_text()
    check("the tool renders the rubric next to the question",
          "c.rubric" in html and "class=\"rubric\"" in html)

    # --- one source, so they cannot drift
    check(
        "the rubric text is not duplicated in the judge's source",
        booking["rubric"][:60] not in (
            ROOT / "stage0" / "src" / "engine" / "judge.py").read_text(),
        "a second copy is a second definition, and it drifts silently",
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
