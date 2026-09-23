"""Published contacts, with the page each was found on (S1-05).

The product promise is narrow and the narrowness is the point: **published**
contacts only, each carrying where it was read. No pattern guessing, no
`info@<domain>`, no "probably the owner". A contact we cannot point at a page
for is one we do not have.

This reads the existing fetch cache, so it costs nothing and touches no site
again. It stores extracted facts, not page copies, which is the rule this
repository already follows for everything else.

**Measured on 1,655 readable sites in the cache:**

    a published email in visible text     645   39.0%
    a phone number                      1,454   87.9%
    a contact page actually fetched       605   36.6%
    a social URL in visible text            9    0.5%

The last line is the finding. The founding documents promise socials with
provenance and **this cannot be delivered from what the probe stores**: social
links are icon anchors, so they live in `href` attributes and almost never in
visible text. The 0.5% that do appear are sites that printed the URL as words.
Extracting socials honestly needs `site_probe.py` to keep link targets as well
as text — a one-field change to the fetcher, listed in the plan rather than
faked here with a guessed `facebook.com/<name>`.

Phones get a second test rather than the regex alone. A ten-digit run in
visible text is as likely to be a licence number, a price list or an address
as a phone, so a number counts only when it agrees with the phone Overture
already holds, or sits within a short distance of a word like "call" or
"phone". Which test it passed travels with the number.

    python3 stage0/src/coverage/extract_contacts.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "stage0" / "data" / "fetch-cache"
APP = ROOT / "public" / "data"

EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?:\+1[ .\-]?)?\(?(\d{3})\)?[ .\-]?(\d{3})[ .\-]?(\d{4})")
CUE = re.compile(r"(call|phone|tel|text|dial|reach us|contact)", re.I)

# Addresses that are never a business's own published contact.
EMAIL_NOISE = re.compile(
    r"(@(example|sentry|wix|squarespace|godaddy|sentry\.io|2x|3x)\b"
    r"|\.(png|jpg|jpeg|gif|webp|svg|css|js)$"
    r"|^(noreply|no-reply|donotreply)@)",
    re.I,
)
# A run of digits is only a phone if it could be one.
BAD_AREA = {"000", "111", "555", "123"}


def digits(*parts: str) -> str:
    return "".join(parts)


def emails_in(text: str) -> list[str]:
    out: list[str] = []
    for m in EMAIL.finditer(text or ""):
        addr = m.group(0).rstrip(".,;:")
        if EMAIL_NOISE.search(addr):
            continue
        if addr.lower() not in (a.lower() for a in out):
            out.append(addr)
    return out


def phones_in(text: str, known: str | None) -> list[tuple[str, str]]:
    """(number, how it was confirmed). Never the regex alone.

    A cue-confirmed number must also share the area code of the phone on the
    listing. This is what finally caught "Crain David A Dds", a Phoenix
    practice whose Overture record points at `ihs.gov`: the page is a federal
    health portal and the number printed beside "call" is a **Maryland** one.
    The attribution test above let it through, because the only distinctive
    word in the business name that appears on ihs.gov is "david".

    A local business's own published number is in its own area code. A number
    in a different one is a chain line, a vendor, or — as here — someone
    else's site entirely.
    """
    known_digits = re.sub(r"\D", "", known or "")[-10:]
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for m in PHONE.finditer(text or ""):
        area, mid, last = m.groups()
        if area in BAD_AREA or area.startswith("0") or area.startswith("1"):
            continue
        num = digits(area, mid, last)
        if num in seen:
            continue
        window = (text[max(0, m.start() - 60) : m.start()] or "")
        if known_digits and num == known_digits:
            how = "matches the phone on the business listing"
        elif not CUE.search(window):
            continue
        elif known_digits and area != known_digits[:3]:
            continue  # a different area code is not this local business's line
        else:
            how = "printed next to a word like call or phone"
        seen.add(num)
        out.append((f"({num[:3]}) {num[3:6]}-{num[6:]}", how))
    return out


def contacts_for(read: dict, known_phone: str | None) -> dict:
    """Every published contact in one site read, each with its page."""
    found: dict = {"emails": [], "phones": [], "contactPage": None, "socials": []}
    for page in read.get("pages") or []:
        text = page.get("text") or ""
        url = page.get("url") or ""
        for addr in emails_in(text):
            if not any(e["value"].lower() == addr.lower() for e in found["emails"]):
                found["emails"].append(
                    {"value": addr, "page": url, "how": "printed on the page"}
                )
        for num, how in phones_in(text, known_phone):
            if not any(p["value"] == num for p in found["phones"]):
                found["phones"].append({"value": num, "page": url, "how": how})
        if found["contactPage"] is None and re.search(
            r"/contact|/get-in-touch|/reach", url, re.I
        ):
            found["contactPage"] = url
    return found


def host_of(url: str | None) -> str:
    bare = re.sub(r"^https?://", "", (url or "").strip().lower())
    return re.sub(r"^www\.", "", bare).split("/")[0]


def metres(a: dict, b: dict) -> float:
    import math

    R, p = 6_371_000, math.pi / 180
    dlat, dlon = (b["lat"] - a["lat"]) * p, (b["lon"] - a["lon"]) * p
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(a["lat"] * p) * math.cos(b["lat"] * p) * math.sin(dlon / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(h))


def shared_pages(businesses: list[dict]) -> set[str]:
    """Domains used by records at more than one place.

    **A contact is only as good as the site attribution, and Overture's website
    field is not always the business's own site.** The audit that found this:
    "Crain David A Dds" carries `ihs.gov` — a federal health service portal —
    and the extractor dutifully read a Maryland phone number off it. "Aspen
    Dental" carries a national pricing page with an 800 number. Fifty-nine
    Dallas med spas carry `linktr.ee`; twelve Tampa HVAC firms carry
    `myfloridalicense.com`, a state licence lookup.

    None of those pages belongs to one location, so a phone or email on them
    cannot be attributed to one. A domain appearing at two or more distinct
    places is therefore treated as shared, and contacts from it are withheld
    with the reason — the same posture `outreach.ts` takes, refusing by default
    rather than attributing someone else's phone number to a business.
    """
    places: dict[str, list[dict]] = {}
    for b in businesses:
        h = host_of(b.get("site"))
        if not h:
            continue
        seen = places.setdefault(h, [])
        if not any(metres(seen_b, b) <= 200 for seen_b in seen):
            seen.append(b)
    return {h for h, locs in places.items() if len(locs) > 1}


GENERIC = set(
    """dental dentist dentistry care center centre clinic group associates family
    smiles smile office practice health the and med spa medical aesthetics
    wellness beauty air heating cooling conditioning service services company
    inc llc corp co plumbing electric solutions systems""".split()
)

# A first name is not distinctive, and treating one as though it were is how
# `ihs.gov` passed for "Crain David A Dds": the only name word appearing on a
# federal health portal was "david". Surnames stay — "ferguson" is exactly the
# signal that rescues `drfergusonaz.com` for "Alan Ferguson".
GIVEN_NAMES = set(
    """james robert john michael david william richard joseph thomas charles
    christopher daniel matthew anthony mark donald steven paul andrew joshua
    kenneth kevin brian george timothy ronald jason edward jeffrey ryan jacob
    gary nicholas eric jonathan stephen larry justin scott brandon benjamin
    samuel gregory alexander patrick frank raymond jack dennis jerry tyler
    aaron jose adam nathan henry douglas zachary peter kyle noah ethan jeremy
    walter christian keith roger terry austin sean gerald carl harold dylan
    arthur lawrence jordan jesse bryan billy bruce gabriel joe logan alan juan
    albert willie elijah wayne randy vincent mason roy ralph bobby russell
    bradley philip eugene mary patricia jennifer linda elizabeth barbara susan
    jessica sarah karen nancy lisa margaret betty sandra ashley dorothy kimberly
    emily donna michelle carol amanda melissa deborah stephanie rebecca sharon
    laura cynthia amy kathleen angela shirley anna brenda pamela nicole ruth
    katherine samantha christine emma catherine debra virginia rachel carolyn
    janet maria heather diane julie joyce victoria kelly christina joan evelyn
    lauren judith olivia frances martha cheryl megan andrea hannah jacqueline
    ann jean alice kathryn gloria teresa doris sara janice julia marie madison
    grace judy theresa beverly denise marilyn amber danielle abigail brittany
    rose diana natalie sophia alexis lori kayla jane""".split()
)


def distinctive(name: str) -> set[str]:
    return (
        {w for w in re.findall(r"[a-z]{4,}", (name or "").lower())}
        - GENERIC
        - GIVEN_NAMES
    )


def city_of(addr: str | None) -> str:
    parts = [p.strip().lower() for p in (addr or "").split(",")]
    return parts[-2] if len(parts) >= 3 else ""


def attribution_of(business: dict, read: dict) -> str | None:
    """Does this site look like it is actually this business's?

    Domain-sharing catches chains and platforms. It cannot catch a single
    Overture record whose website field is simply **wrong**, and those are real:
    "Custom Dental Ceramics" in Phoenix carries `atlantadentalarts.com`, "AZ
    Dental" carries `promoplace.com` (a promotional-products shop), "AZ Center
    For Dental Care" carries a directory, and "Canyon Lakes Dental Group" in
    Mesa carries a Colorado Springs practice. Reading a phone number off any of
    those and printing it beside the business's name is inventing a contact.

    The test is deliberately weak, because it only has to catch the obvious: a
    distinctive word from the business name, or its city, appearing either in
    the page text or in the domain. Measured on the 570 dental businesses whose
    site we read: **85% are named on their own site, 83% mention their town,
    93% do one or the other.**

    **The town is not enough on its own, and pretending it was let `ihs.gov`
    through.** The Indian Health Service has a Phoenix Area office, so its
    pages say "Phoenix" — which is exactly what a Phoenix dentist's site says.
    A metro name appears on every national site that lists a branch there. So
    a name match attributes; a town match alone is returned as `town-only` and
    travels with the contact as a caveat, rather than being silently trusted or
    silently dropped.

    Returns "named", "town-only", or None when neither holds.
    """
    words = distinctive(business.get("name", ""))
    city = city_of(business.get("addr"))
    domain = host_of(business.get("site"))
    blob = " ".join(
        (p.get("text") or "") for p in (read.get("pages") or [])
    ).lower()
    haystacks = (blob, domain.replace("-", ""))
    for hay in haystacks:
        if words and any(w in hay for w in words):
            return "named"
    for hay in haystacks:
        if city and city.replace(" ", "") in hay.replace(" ", ""):
            return "town-only"
    return None


def main() -> int:
    if not CACHE.exists():
        raise SystemExit(f"No fetch cache at {CACHE.relative_to(ROOT)}.")

    by_url: dict[str, dict] = {}
    for path in CACHE.glob("*.json"):
        try:
            read = json.loads(path.read_text())
        except Exception:
            continue
        if read.get("outcome") == "ok" and read.get("url"):
            by_url[read["url"].rstrip("/")] = read

    print(f"{len(by_url)} readable site reads in the cache\n")
    totals = {"businesses": 0, "email": 0, "phone": 0, "contactPage": 0}

    for market_file in sorted(APP.glob("*.json")):
        # Skip index.json and this script's own previous output.
        if market_file.name == "index.json" or market_file.name.startswith("contacts-"):
            continue
        market = json.loads(market_file.read_text())
        shared = shared_pages(market.get("businesses", []))
        out: dict[str, dict] = {}
        withheld = town_only = 0
        for b in market.get("businesses", []):
            site = (b.get("site") or "").rstrip("/")
            read = by_url.get(site) or by_url.get(site.replace("http://", "https://"))
            if not read:
                continue
            why = None
            if host_of(site) in shared:
                why = (
                    f"{host_of(site)} is used by this business and others "
                    f"elsewhere, so it is a chain or platform page rather than "
                    f"this location's own site. Anything published on it "
                    f"belongs to someone we cannot identify."
                )
            attribution = attribution_of(b, read)
            if why is None and attribution is None:
                why = (
                    f"Nothing on {host_of(site)} names this business or its "
                    f"town, so we cannot show that the listing's website is "
                    f"really theirs. A contact read off someone else's site is "
                    f"an invented contact."
                )
            if why:
                withheld += 1
                out[b["id"]] = {
                    "emails": [], "phones": [], "contactPage": None,
                    "withheld": why,
                }
                continue
            got = contacts_for(read, b.get("phone"))
            if not (got["emails"] or got["phones"] or got["contactPage"]):
                continue
            if attribution == "town-only":
                got["caveat"] = (
                    f"{host_of(site)} never names this business — only its "
                    f"town, which every national site with a branch here also "
                    f"does. Check it belongs to them before using it."
                )
                town_only += 1
            out[b["id"]] = got
            totals["businesses"] += 1
            totals["email"] += bool(got["emails"])
            totals["phone"] += bool(got["phones"])
            totals["contactPage"] += bool(got["contactPage"])

        dest = APP / f"contacts-{market['id']}.json"
        dest.write_text(
            json.dumps(
                {
                    "market": market["id"],
                    "source": "published on the business's own website",
                    "socials": (
                        "not extracted — social links are icon anchors, so they "
                        "live in href attributes and the probe stores visible "
                        "text only. Needs a fetcher change, not a guess."
                    ),
                    "contacts": out,
                },
                indent=1,
            )
            + "\n"
        )
        size = dest.stat().st_size / 1024
        print(
            f"  {market['id']:<16} {len(out):>4} businesses with a published "
            f"contact   →  {dest.name} ({size:.0f} KB)"
        )
        if withheld:
            print(
                f"  {'':<16} {withheld:>4} withheld: a chain or platform page, "
                f"or a site that never names them"
            )
        if town_only:
            print(
                f"  {'':<16} {town_only:>4} kept with a caveat: the site names "
                f"the town but not the business"
            )

    print(
        f"\n{totals['businesses']} businesses total: "
        f"{totals['email']} with an email, {totals['phone']} with a confirmed "
        f"phone, {totals['contactPage']} with a contact page."
    )
    print(
        "\nSocials are deliberately absent. They are 0.5% recoverable from "
        "visible text\nand the honest fix is a fetcher that keeps link targets."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
