"""Turn a criterion into a plan for checking it (task S0-32, part of S0-07).

**This module is what keeps Small Fish vertical-agnostic.**

There is a real risk in the engine's design. Technology detection is cheap and
precise, so it is tempting to build the product on it — but a vendor catalogue only
covers criteria someone has catalogued. A product that can only answer "has online
booking" because we listed Vagaro is not a relevance engine; it is a booking-widget
detector with good marketing.

So the layering is deliberate and the fallback is the important half:

1. **Any criterion, any vertical** gets a plan derived from its own words. Content
   words become link keywords, so "vets offering exotic-pet care" goes looking for
   pages about exotic pets with no catalogue involved. Judgment falls to the model.
2. **Recognised criteria** additionally get technology families and sharper page
   targets, which settle many cases with no model call.

Layer 2 is an optimisation over layer 1, never a precondition. A criterion nobody
anticipated must still produce a usable plan, and `settleable_without_model` says
honestly whether the cheap path applies.

Usage:
    from engine.check_plan import plan_for_criterion, plan_for_search
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Words that carry no signal for page selection. Deliberately small: over-filtering
# throws away the domain words that make an unfamiliar criterion work.
STOPWORDS = {
    "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "do",
    "does", "for", "from", "has", "have", "in", "is", "it", "its", "no", "not",
    "of", "on", "or", "that", "the", "their", "them", "they", "this", "to", "use",
    "uses", "was", "who", "with", "without",
}

# Pages worth reading for almost any criterion, as a floor when nothing else matches.
BASELINE_LINKS: list[tuple[str, int]] = [
    ("services", 4),
    ("about", 2),
    ("contact", 2),
]


@dataclass
class CriterionPlan:
    """How one criterion will be checked, and what would count as proof."""

    criterion_id: str
    kind: str  # "presence" | "absence"
    text: str
    link_keywords: list[tuple[str, int]] = field(default_factory=list)
    tech_families: list[str] = field(default_factory=list)
    proof: str = ""
    disproof: str = ""
    recognised: bool = False

    @property
    def settleable_without_model(self) -> bool:
        """True only when technology detection alone can decide it.

        Never true for absence: the absence of a signal is not proof of absence,
        it may only mean we did not look in the right place. See `absence.py`.
        """
        return bool(self.tech_families) and self.kind == "presence"

    def explain(self) -> str:
        """The one-line 'how this is checked' the confirm screen shows."""
        return self.proof or f"Looks for evidence on the site that it {self.text}."


# --- Recognised criterion types ----------------------------------------------
# Each entry: a pattern over the criterion text, the technology families that bear
# on it, extra link keywords, and how proof is described to the user.
#
# Adding to this list makes common criteria cheaper and sharper. It is never
# required for a criterion to work.

RECOGNISED: list[dict] = [
    {
        "name": "online_booking",
        "pattern": r"\b(online\s+)?(booking|book\s+online|appointment\s+booking|"
        r"schedul\w*\s+online|online\s+schedul\w*)\b",
        "tech_families": ["booking"],
        "links": [("book", 10), ("appointment", 10), ("schedule", 9), ("reserve", 6)],
        "proof": "Looks for a booking widget, a Book Now link, or booking software on the site.",
        "disproof": "Booking-relevant pages read with no booking widget, link or software found.",
    },
    {
        "name": "quote_form",
        "pattern": r"\b(quote|estimate)\s*(form|request|page)?\b",
        "tech_families": ["quote_form"],
        "links": [("quote", 10), ("estimate", 9), ("contact", 5)],
        "proof": "Looks for a quote or estimate request form or link on the site.",
        "disproof": "Contact and service pages read with no quote or estimate route found.",
    },
    {
        "name": "chat_widget",
        "pattern": r"\b(chat|live\s*chat|chatbot|web\s*chat)\b",
        "tech_families": ["chat"],
        "links": [("contact", 4)],
        "proof": "Looks for a live chat widget in the page source.",
        "disproof": "Pages read with no chat widget found in the source.",
    },
    {
        "name": "ecommerce",
        "pattern": r"\b(online\s+store|e-?commerce|sells?\s+online|shop\s+online)\b",
        "tech_families": ["cms"],
        "links": [("shop", 9), ("store", 9), ("products", 7)],
        "proof": "Looks for store or checkout pages and e-commerce platform signals.",
        "disproof": "Site read with no store, cart or checkout route found.",
    },
    {
        "name": "ownership",
        "pattern": r"\b(independent|franchise|chain|group|privately\s+owned|"
        r"part\s+of\s+a\s+group|multi-?location)\b",
        "tech_families": [],
        "links": [("about", 8), ("locations", 8), ("our-story", 6), ("team", 5)],
        "proof": "Reads the about and locations pages for ownership and group signals.",
        "disproof": "About and locations pages read with no group or franchise signal.",
    },
    {
        "name": "staff_size",
        "pattern": r"\b(practitioners?|dentists?|doctors?|staff|employees?|technicians?|"
        r"team\s+size|providers?)\b",
        "tech_families": [],
        "links": [("team", 10), ("staff", 9), ("providers", 9), ("about", 6), ("doctors", 8)],
        "proof": "Counts the practitioners listed on the team or staff page.",
        "disproof": "Team page read and the count falls outside the requested range.",
    },
    {
        "name": "service_offered",
        "pattern": r"\b(offers?|provides?|does|performs?|specialis\w+|specializ\w+|treats?)\b",
        "tech_families": [],
        "links": [("services", 10), ("treatments", 9), ("procedures", 8), ("pricing", 5)],
        "proof": "Reads the services and treatments pages for the named service.",
        "disproof": "Services pages read and the named service is not among them.",
    },
    {
        "name": "commercial_residential",
        "pattern": r"\b(commercial|residential|industrial|b2b)\b",
        "tech_families": [],
        "links": [("commercial", 10), ("residential", 8), ("services", 7), ("industries", 7)],
        "proof": "Reads service and sector pages for the stated type of work.",
        "disproof": "Service pages read with no mention of that type of work.",
    },
    {
        "name": "service_area",
        "pattern": r"\b(service\s+area|areas?\s+served|locations?\s+served|coverage)\b",
        "tech_families": [],
        "links": [("service-area", 10), ("areas", 9), ("locations", 8), ("coverage", 7)],
        "proof": "Looks for service-area or coverage pages listing the areas served.",
        "disproof": "Site read with no service-area or coverage information found.",
    },
    {
        "name": "languages",
        "pattern": r"\b(spanish|bilingual|language|español|mandarin|vietnamese)\b",
        "tech_families": [],
        "links": [("about", 6), ("staff", 5), ("es", 4), ("espanol", 8)],
        "proof": "Looks for a translated site version or a stated language on the site.",
        "disproof": "Site read with no translated version or stated language.",
    },
]

_COMPILED = [(re.compile(r["pattern"], re.I), r) for r in RECOGNISED]

_ABSENCE = re.compile(
    r"\b(no|not|without|lacks?|missing|doesn'?t|does\s+not|don'?t|hasn'?t|has\s+no)\b",
    re.I,
)


def infer_kind(text: str) -> str:
    """Presence or absence, from the wording of the criterion."""
    return "absence" if _ABSENCE.search(text) else "presence"


def derive_keywords(text: str, weight: int = 7) -> list[tuple[str, int]]:
    """Content words from the criterion itself, for link selection.

    This is the vertical-agnostic path. It is why a criterion nobody anticipated
    still directs the crawler somewhere sensible.
    """
    seen: dict[str, int] = {}

    def add(word: str, at: int) -> None:
        if word in STOPWORDS or len(word) < 3:
            return
        # Light stemming so "services" matches "service" in a URL.
        stem = word.rstrip("s") if len(word) > 4 and word.endswith("s") else word
        seen.setdefault(stem, at)

    for token in re.findall(r"[a-z][a-z'-]{2,}", text.lower()):
        add(token, weight)
        # A hyphenated term matches a URL like /exotic-pet-care but not the anchor
        # text "Exotic Pets", so emit the parts too, slightly weaker.
        if "-" in token:
            for part in token.split("-"):
                add(part, max(weight - 1, 1))

    return list(seen.items())


def plan_for_criterion(criterion_id: str, text: str, kind: str | None = None) -> CriterionPlan:
    """Build a check plan for one criterion, recognised or not."""
    kind = kind or infer_kind(text)
    plan = CriterionPlan(criterion_id=criterion_id, kind=kind, text=text)

    for pattern, entry in _COMPILED:
        if pattern.search(text):
            plan.recognised = True
            plan.tech_families = list(entry["tech_families"])
            plan.link_keywords = list(entry["links"])
            plan.proof = entry["proof"]
            plan.disproof = entry["disproof"]
            break

    # Always add the criterion's own words. For a recognised criterion these add
    # specificity ("Botox" on top of the services pages); for an unrecognised one
    # they are the whole plan.
    derived = derive_keywords(text, weight=6 if plan.recognised else 8)
    known = {w for w, _ in plan.link_keywords}
    plan.link_keywords.extend((w, s) for w, s in derived if w not in known)

    if not plan.recognised:
        plan.link_keywords.extend(BASELINE_LINKS)
        plan.proof = f"Reads the site for evidence that it {text}."
        plan.disproof = f"Relevant pages read with no evidence that it {text}."

    return plan


@dataclass
class SearchCheckPlan:
    """The merged plan for a whole search."""

    criteria: list[CriterionPlan]

    @property
    def link_keywords(self) -> list[tuple[str, int]]:
        """Union of every criterion's keywords, strongest weight wins."""
        merged: dict[str, int] = {}
        for plan in self.criteria:
            for word, weight in plan.link_keywords:
                merged[word] = max(merged.get(word, 0), weight)
        for word, weight in BASELINE_LINKS:
            merged.setdefault(word, weight)
        return sorted(merged.items(), key=lambda kv: -kv[1])

    @property
    def tech_families(self) -> list[str]:
        families: list[str] = []
        for plan in self.criteria:
            for family in plan.tech_families:
                if family not in families:
                    families.append(family)
        return families

    @property
    def needs_model(self) -> list[CriterionPlan]:
        """Criteria that technology detection cannot settle on its own."""
        return [c for c in self.criteria if not c.settleable_without_model]


def plan_for_search(criteria: list[dict]) -> SearchCheckPlan:
    """Build the merged plan from a search's criteria.

    Each criterion is a dict with `id`, `text` and optionally `type`.
    """
    return SearchCheckPlan(
        criteria=[
            plan_for_criterion(c["id"], c["text"], c.get("type")) for c in criteria
        ]
    )
