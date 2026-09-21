"""Technology detection from page source (task S0-10).

This is the main cost lever in the engine. Every criterion settled here is settled
with no model call, so the share of criteria this module resolves is worth measuring
directly — it appears in the Stage 0 report.

It is also the backbone of absence criteria. A "no online booking" verdict is only
honest when the booking-relevant pages were actually read and no positive signal was
found anywhere in them; see `stage0/src/engine/absence.py`.

Signals are deliberately conservative. A false positive here ("this site has booking"
when it does not) costs a missed match, which is cheap. A false negative ("no booking"
when there is some) costs a false match, which is the expensive failure. So patterns
err toward firing.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field

# --- Booking -----------------------------------------------------------------
# Vendor host names and script fingerprints. Matched against raw page source,
# which catches embeds, iframes and script tags that a text-only view loses.
# **A vendor hit must prove a customer can book, not that the business buys
# software from someone.** The catalogue conflated those and it cost a real
# recall point: Palm Valley Pediatric Dentistry was rejected because
# `dentrix.com` appeared on its site. Dentrix is dental practice-management
# software — the back office — and a footer "powered by" link says nothing
# about whether a patient can book. The same category error ran through the
# niche lists: dental_intelligence is analytics, solutionreach and
# lighthouse360 are patient messaging, covetrus is distribution.
#
# Two rules now:
#   - A practice-management, EHR or messaging vendor is scoped to a
#     booking-ish path, so only a patient-facing route fires it.
#   - Pure comms, marketing and analytics tools are not booking evidence at
#     all, and are gone.
#
# A comment here already said exactly this about Weave — "a bare getweave.com
# match would claim booking on sites that have none" — and the lesson was not
# generalised. It is now.
BOOKING_VENDORS: dict[str, list[str]] = {
    "calendly": [r"calendly\.com", r"calendly-badge", r"Calendly\.init"],
    "acuity": [r"acuityscheduling\.com", r"squarespacescheduling\.com"],
    "square": [r"squareup\.com/appointments", r"square\.site/book"],
    "vagaro": [r"vagaro\.com", r"vagaro\.js"],
    "zocdoc": [r"zocdoc\.com", r"zd-plugin"],
    "mindbody": [r"mindbodyonline\.com", r"mindbody\.io", r"healcode", r"mb-widget"],
    "jane": [r"janeapp\.com"],
    "boulevard": [r"joinblvd\.com", r"blvd\.co/book", r"boulevard\.io"],
    "booker": [r"booker\.com", r"secure-booker\.com"],
    "setmore": [r"setmore\.com"],
    "simplybook": [r"simplybook\.(me|it)"],
    "schedulicity": [r"schedulicity\.com"],
    "fresha": [r"fresha\.com"],
    "styleseat": [r"styleseat\.com"],
    "booksy": [r"booksy\.com"],
    "phorest": [r"phorest\.com", r"phorest\.me"],
    "dentrix": [r"dentrix(ascend)?\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
    "nexhealth": [r"nexhealth\.com"],
    "localmed": [r"localmed\.com"],
    "flexbooker": [r"flexbooker\.com"],
    "appointy": [r"appointy\.com"],
    "housecallpro": [r"hcp-booking", r"housecallpro\.com/book"],
    "servicetitan": [r"st-scheduler", r"servicetitan\.com/[\w/.?=&-]*(book|schedule)"],
    "jobber": [r"getjobber\.com", r"jobber\.com/online-booking"],
    "opendental": [r"opendental\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
    "tebra": [r"(tebra|kareo)\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
    "athenahealth": [r"athenahealth\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
    "healthiepatient": [r"gethealthie\.com"],
    "cliniko": [r"cliniko\.com"],
    "practicefusion": [r"practicefusion\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
    "timely": [r"gettimely\.com"],
    "resurva": [r"resurva\.com"],
    "genbook": [r"genbook\.com"],
    "yocale": [r"yocale\.com"],
    "planmyappointment": [r"planmyappointment\.com"],
    "weave": [r"getweave\.com/schedule"],
}

# Generic booking affordances: a link or button whose text or href says "book".
# Weaker than a vendor hit, so it is reported separately and, for absence
# criteria, still counts as a positive signal.
BOOKING_GENERIC: list[str] = [
    (
        r"""href=["'][^"']*/(book|booking|book-now|book-online|schedule"""
        r"""|appointments?|request-appointment|make-an-appointment"""
        r"""|schedule-appointment|schedule-online|book-appointment)/?["'#?]"""
    ),
    r">\s*(book\s+(now|online|an?\s+appointment)|schedule\s+(now|online|an?\s+appointment))\s*<",
    r"\bbook\s+(your\s+)?appointment\s+online\b",
]

# --- Per-niche booking catalogues (task S0-28) -------------------------------
# Booking software is strongly vertical-specific: the med spa list above says
# almost nothing about a vet clinic. Measured in `docs/stage0-coverage-report.md`
# §5a: in the veterinary market only 2 of 22 booking detections matched a known
# vendor, because veterinary booking runs on software absent from every list.
#
# These are grouped by niche so the coverage is auditable, and merged into
# BOOKING_VENDORS below. **Adding a niche is an optimisation, never a
# precondition** — an uncatalogued vertical still works through the generic
# affordances and the model (see `check_plan.py`). Vendors that never fire cost
# nothing; the re-probe reports which ones actually do.

BOOKING_VENDORS_BY_NICHE: dict[str, dict[str, list[str]]] = {
    "veterinary": {
        "vetstoria": [r"vetstoria\.com"],
        "petdesk": [r"petdesk\.com"],
        # Weave is covered by the base catalogue, scoped to /schedule. Weave is
        # also a phone and messaging product, so a bare getweave.com match would
        # claim booking on sites that have none.
        "evetpractice": [r"evetpractice\.com"],
        "ezyvet": [r"ezyvet\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
        "shepherd_vet": [r"shepherd\.vet", r"shepherdsoftware"],
        "digitail": [r"digitail\.(com|io)"],
        "instinct_vet": [r"instinct\.vet"],
        "vetter": [r"vettersoftware\.com"],
        "idexx_neo": [r"neo\.idexx\.com", r"idexxneo"],
        "provet_cloud": [r"provet\.cloud"],
        "televet": [r"televet\.com"],
        "vitusvet": [r"vitusvet\.com"],
        "hippo_manager": [r"hippomanager\.com"],
        "covetrus": [r"covetrus\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
    },
    "dental": {
        "curve_dental": [r"curve(dental|hero)\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
        "denticon": [r"denticon\.com/[\w/.?=&-]*(book|appointment|schedule|portal)"],
        "eaglesoft": [r"eaglesoft[\w/.?=&-]*(book|appointment|schedule|portal)"],
        "adit": [r"adit\.com"],
        "yapi": [r"yapiapp\.com"],
        "simplifeye": [r"simplifeye\.co"],
        "flex_dental": [r"flexdental(solutions)?\.com"],
    },
    "med_spa": {
        "aesthetic_record": [r"aestheticrecord\.com", r"myaestheticrecord\.com"],
        "symplast": [r"symplast\.com"],
        "nextech": [r"nextech\.com"],
        "zenoti": [r"zenoti\.com"],
        "mangomint": [r"mangomint\.com"],
        "meevo": [r"meevo\.com", r"millenniumsi\.com"],
        "moxie": [r"moxie\.xyz"],
    },
    "trades": {
        "fieldedge": [r"fieldedge\.com"],
        "service_fusion": [r"servicefusion\.com"],
        "workiz": [r"workiz\.com"],
        "mhelpdesk": [r"mhelpdesk\.com"],
        "service_autopilot": [r"serviceautopilot\.com"],
        "thryv": [r"thryv\.com"],
        "scheduling_engine": [r"schedulingengine\.com"],
        "servicem8": [r"servicem8\.com"],
    },
}

# Merge the per-niche catalogues into the main booking list. A name collision
# would silently drop one, so assert rather than overwrite.
for _niche, _vendors in BOOKING_VENDORS_BY_NICHE.items():
    for _name, _patterns in _vendors.items():
        assert _name not in BOOKING_VENDORS, f"duplicate booking vendor: {_name}"
        BOOKING_VENDORS[_name] = _patterns


# --- Quote / lead forms ------------------------------------------------------
QUOTE_FORM_VENDORS: dict[str, list[str]] = {
    "hubspot_forms": [r"js\.hsforms\.net", r"hbspt\.forms"],
    "gravity_forms": [r"gform_wrapper", r"gravityforms"],
    "contact_form_7": [r"wpcf7", r"contact-form-7"],
    "typeform": [r"typeform\.com"],
    "jotform": [r"jotform\.com"],
    "wufoo": [r"wufoo\.com"],
    "formstack": [r"formstack\.com"],
    "ninja_forms": [r"ninja[-_]forms"],
    "wpforms": [r"wpforms"],
    "formidable": [r"frm_forms", r"formidableforms"],
    "marketo": [r"marketo\.com", r"mktoForm"],
    "pardot": [r"pardot\.com", r"go\.pardot"],
}

QUOTE_FORM_GENERIC: list[str] = [
    (
        r"""href=["'][^"']*/(quote|get-a-quote|request-a-quote|free-quote"""
        r"""|estimate|free-estimate|request-estimate|get-estimate)/?["'#?]"""
    ),
    (
        r">\s*(get\s+a?\s*(free\s+)?(quote|estimate)"
        r"|request\s+a?\s*(free\s+)?(quote|estimate)"
        r"|free\s+(quote|estimate))\s*<"
    ),
]

# Any form at all. Deliberately kept out of the quote-form family: nearly every
# site has a newsletter or contact form, so folding it in would make "no quote
# form" fire everywhere and the criterion would mean nothing. It is tracked
# separately because it is still useful context for a model judgment.
ANY_FORM_GENERIC: list[str] = [r"<form[^>]*>"]

# --- Chat --------------------------------------------------------------------
CHAT_VENDORS: dict[str, list[str]] = {
    "intercom": [r"intercom\.io", r"intercomSettings"],
    "drift": [r"drift\.com", r"driftt\.com"],
    "tawk": [r"tawk\.to"],
    "crisp": [r"crisp\.chat"],
    "zendesk_chat": [r"zopim", r"zdassets\.com"],
    "livechat": [r"livechatinc\.com"],
    "tidio": [r"tidio\.co"],
    "podium": [r"podium\.com"],
    "birdeye": [r"birdeye\.com"],
    "hubspot_chat": [r"js\.usemessages\.com"],
    "olark": [r"olark\.com"],
    "gorgias": [r"gorgias\.chat"],
}

# --- CMS and platform --------------------------------------------------------
CMS_VENDORS: dict[str, list[str]] = {
    "wordpress": [r"/wp-content/", r"/wp-includes/", r'name="generator" content="WordPress'],
    "wix": [r"wix\.com", r"wixstatic\.com", r"_wixCssStates"],
    "squarespace": [r"squarespace\.com", r"static1\.squarespace"],
    "godaddy_website_builder": [r"godaddysites\.com", r"img1\.wsimg\.com"],
    "webflow": [r"webflow\.com", r"wf-form"],
    "duda": [r"dudamobile\.com", r"duda_website"],
    "shopify": [r"cdn\.shopify\.com", r"Shopify\.theme"],
    "weebly": [r"weebly\.com", r"editmysite\.com"],
    "hubspot_cms": [r"hs-sites\.com", r"hubspotusercontent"],
}

# --- Advertising / tracking pixels -------------------------------------------
PIXEL_VENDORS: dict[str, list[str]] = {
    "google_analytics": [r"googletagmanager\.com", r"google-analytics\.com", r"gtag\("],
    "meta_pixel": [r"connect\.facebook\.net", r"fbq\("],
    "google_ads": [r"googleadservices\.com", r"gtag/js\?id=AW-"],
    "tiktok_pixel": [r"analytics\.tiktok\.com"],
    "linkedin_insight": [r"snap\.licdn\.com"],
}

_FLAGS = re.IGNORECASE


def _compile(patterns: list[str]) -> list[re.Pattern[str]]:
    return [re.compile(p, _FLAGS) for p in patterns]


_COMPILED_VENDORS = {
    "booking": {k: _compile(v) for k, v in BOOKING_VENDORS.items()},
    "quote_form": {k: _compile(v) for k, v in QUOTE_FORM_VENDORS.items()},
    "chat": {k: _compile(v) for k, v in CHAT_VENDORS.items()},
    "cms": {k: _compile(v) for k, v in CMS_VENDORS.items()},
    "pixel": {k: _compile(v) for k, v in PIXEL_VENDORS.items()},
}
_COMPILED_GENERIC = {
    "booking": _compile(BOOKING_GENERIC),
    "quote_form": _compile(QUOTE_FORM_GENERIC),
    "any_form": _compile(ANY_FORM_GENERIC),
}


# A fingerprint of every pattern in this file, so a catalogue change is
# self-announcing. Detection runs at fetch time and its result is stored in the
# fetch cache, which means a cached read replays whatever the catalogue said on
# the day it was crawled. A frozen-corpus re-run therefore cannot evaluate a
# detector change — it replays the old verdicts and reports "no effect".
#
# That is not hypothetical. A retune scoping practice-management vendors to
# booking paths was measured on a frozen corpus, read as changing nothing, and
# the finding was written up — while the new patterns had never run. Palm Valley
# Pediatric Dentistry was still being rejected on a cached `dentrix` hit that
# the live catalogue no longer produces.
#
# Hashing the patterns rather than hand-maintaining a version number is the
# point: the number nobody remembers to bump is the number that fails. Callers
# compare this against the value stored with a cached read; `benchmark/run.py`
# refuses to report a frozen run whose detection is stale.
CATALOGUE_FINGERPRINT = hashlib.sha256(
    json.dumps(
        [
            BOOKING_VENDORS, BOOKING_GENERIC, BOOKING_VENDORS_BY_NICHE,
            QUOTE_FORM_VENDORS, QUOTE_FORM_GENERIC, ANY_FORM_GENERIC,
            CHAT_VENDORS, CMS_VENDORS, PIXEL_VENDORS,
        ],
        sort_keys=True,
    ).encode()
).hexdigest()[:12]


@dataclass
class TechSignals:
    """What a single page's source says about the technology on it."""

    vendors: dict[str, list[str]] = field(default_factory=dict)
    generic: dict[str, bool] = field(default_factory=dict)

    def has(self, family: str) -> bool:
        """True if either a named vendor or a generic affordance fired."""
        return bool(self.vendors.get(family)) or self.generic.get(family, False)

    def merge(self, other: "TechSignals") -> "TechSignals":
        """Combine signals across the several pages read for one business."""
        merged = TechSignals(
            vendors={k: list(v) for k, v in self.vendors.items()},
            generic=dict(self.generic),
        )
        for family, names in other.vendors.items():
            merged.vendors.setdefault(family, [])
            for name in names:
                if name not in merged.vendors[family]:
                    merged.vendors[family].append(name)
        for family, fired in other.generic.items():
            merged.generic[family] = merged.generic.get(family, False) or fired
        return merged

    def as_dict(self) -> dict:
        return {"vendors": self.vendors, "generic": self.generic}


def detect(source: str) -> TechSignals:
    """Detect known technology in raw page source."""
    signals = TechSignals()
    for family, vendors in _COMPILED_VENDORS.items():
        hits = [
            name
            for name, patterns in vendors.items()
            if any(p.search(source) for p in patterns)
        ]
        if hits:
            signals.vendors[family] = hits
    for family, patterns in _COMPILED_GENERIC.items():
        signals.generic[family] = any(p.search(source) for p in patterns)
    return signals
