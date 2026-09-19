"""Tests for check plans (task S0-32).

The point of these tests is the *unrecognised* cases. Anyone can make a plan for
"no online booking"; the product only generalises if a criterion nobody anticipated
still directs the crawler somewhere sensible and still reports honestly that it
needs a model.

Run:  python3 -m pytest stage0/tests/ -q
  or: python3 stage0/tests/test_check_plan.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.check_plan import (  # noqa: E402
    infer_kind,
    plan_for_criterion,
    plan_for_search,
)


def words(plan) -> set[str]:
    return {w for w, _ in plan.link_keywords}


# --- Absence detection -------------------------------------------------------


def test_infers_absence_from_wording():
    for text in [
        "has no online booking",
        "without a quote form",
        "doesn't offer implants",
        "not part of a group",
        "lacks a service area page",
    ]:
        assert infer_kind(text) == "absence", text


def test_infers_presence_by_default():
    for text in ["offers Botox", "does commercial work", "has 5+ practitioners"]:
        assert infer_kind(text) == "presence", text


# --- Recognised criteria get the cheap path ----------------------------------


def test_recognised_booking_criterion_gets_tech_family():
    plan = plan_for_criterion("c1", "has online booking")
    assert plan.recognised
    assert "booking" in plan.tech_families
    assert {"book", "appointment", "schedule"} <= words(plan)
    assert plan.settleable_without_model


def test_absence_is_never_settleable_without_a_model():
    """The absence of a signal is not proof of absence — only that we did not
    find one. This is the rule the whole honesty position rests on."""
    plan = plan_for_criterion("c1", "has no online booking")
    assert plan.recognised
    assert "booking" in plan.tech_families
    assert plan.kind == "absence"
    assert not plan.settleable_without_model


# --- Unrecognised criteria still produce a usable plan -----------------------


def test_unknown_vertical_criterion_derives_keywords_from_its_own_words():
    plan = plan_for_criterion("c1", "offers exotic-pet care")
    assert "exotic" in words(plan)
    assert "pet" in words(plan) or "care" in words(plan)


def test_wholly_unrecognised_criterion_still_has_a_plan():
    plan = plan_for_criterion("c1", "restores vintage motorcycle carburettors")
    assert not plan.recognised
    assert "vintage" in words(plan)
    assert "motorcycle" in words(plan)
    # Falls back to the baseline pages rather than nothing.
    assert "services" in words(plan)
    # And is honest that it needs a model.
    assert not plan.settleable_without_model
    assert plan.explain()


def test_unrecognised_criterion_explains_itself_to_the_user():
    plan = plan_for_criterion("c1", "runs a mobile grooming van")
    assert "mobile" in plan.explain() or "grooming" in plan.explain()


def test_stopwords_do_not_become_link_keywords():
    plan = plan_for_criterion("c1", "does not have any of the online booking")
    assert "the" not in words(plan)
    assert "any" not in words(plan)
    assert "have" not in words(plan)


# --- Search-level merging ----------------------------------------------------


def test_search_plan_merges_criteria_and_keeps_strongest_weight():
    plan = plan_for_search(
        [
            {"id": "a", "text": "offers Botox"},
            {"id": "b", "text": "has no online booking"},
        ]
    )
    merged = dict(plan.link_keywords)
    assert "botox" in merged
    assert "book" in merged
    # Sorted strongest first, so the crawler's limited page budget goes to the
    # most promising pages.
    weights = [w for _, w in plan.link_keywords]
    assert weights == sorted(weights, reverse=True)


def test_search_plan_reports_what_needs_a_model():
    plan = plan_for_search(
        [
            {"id": "a", "text": "has online booking"},
            {"id": "b", "text": "offers exotic-pet care"},
        ]
    )
    needs = {c.criterion_id for c in plan.needs_model}
    assert needs == {"b"}


def test_search_plan_always_includes_baseline_pages():
    plan = plan_for_search([{"id": "a", "text": "sells handmade ceramics"}])
    merged = dict(plan.link_keywords)
    assert "services" in merged and "about" in merged


def test_every_benchmark_criterion_produces_a_plan():
    import json

    spec = json.loads((ROOT / "stage0" / "fixtures" / "benchmarks.json").read_text())
    for market in spec["markets"]:
        plan = plan_for_search(market["criteria"])
        assert plan.link_keywords, market["id"]
        for criterion in plan.criteria:
            assert criterion.explain(), (market["id"], criterion.criterion_id)


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  pass  {name}")
            except AssertionError as exc:
                failures += 1
                print(f"  FAIL  {name}: {exc}")
    print(f"\n{failures} failure(s)")
    sys.exit(1 if failures else 0)
