"""Published contacts, and the four ways they can be invented (S1-05).

Every test here is a refusal. Extraction is easy; the work is not attributing
someone else's phone number to a business, and each rule below exists because
an audit of the real output caught it doing exactly that.

    python3 stage0/tests/test_contacts.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from coverage.extract_contacts import (  # noqa: E402
    attribution_of, contacts_for, distinctive, emails_in, host_of, phones_in,
    shared_pages,
)

APP = ROOT / "public" / "data"
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def biz(**kw):
    base = dict(id="b", name="Grabow Endodontics", addr="1 Main St, Mesa, AZ",
                site="https://grabowendo.com", lat=33.45, lon=-112.07, phone="+14805551234")
    base.update(kw)
    return base


def read(*texts, url="https://grabowendo.com"):
    return {"url": url, "outcome": "ok",
            "pages": [{"url": f"{url}/{i}" if i else url, "text": t}
                      for i, t in enumerate(texts)]}


def main() -> int:
    # --- emails: published only, and nothing that merely looks like one
    check("a published address is taken",
          emails_in("Email us at hello@grabowendo.com today") == ["hello@grabowendo.com"])
    check("an image filename is not an email",
          emails_in("<img src=logo@2x.png>") == [])
    check("a noreply address is not a contact",
          emails_in("noreply@grabowendo.com") == [])
    check("trailing punctuation is trimmed",
          emails_in("write to hi@x.com.") == ["hi@x.com"])
    check("nothing is guessed from the domain",
          emails_in("Grabow Endodontics, Mesa AZ") == [],
          "info@<domain> is the single most tempting invention here")

    # --- phones: the regex is never enough on its own
    check("a bare ten-digit run is not a phone",
          phones_in("Licence number 4805551234 issued 2019", None) == [])
    check("a number matching the listing is taken",
          phones_in("4805551234", "+14805551234")[0][1]
          == "matches the phone on the business listing")
    check("a number beside 'call' is taken",
          phones_in("Call us on (480) 555-9999", "+14805551234")[0][0] == "(480) 555-9999")
    check("a cue-confirmed number in a DIFFERENT area code is refused",
          phones_in("Call (301) 443-3593", "+14805551234") == [],
          "this is the Maryland number that ihs.gov offered for a Phoenix dentist")
    check("555 and other impossible area codes are refused",
          phones_in("Call (555) 123-4567", None) == [])

    # --- attribution: is this site even theirs?
    named = attribution_of(biz(), read("Welcome to Grabow Endodontics of Mesa"))
    check("a site that names the business is attributed", named == "named")

    # The real one: a Mesa dentist whose Overture record points at a federal
    # health portal. The portal says "Mesa" because it has an office there.
    town = attribution_of(
        biz(name="Crain David A Dds", site="https://www.ihs.gov/chs"),
        read("The Mesa Area Office of the Indian Health Service",
             url="https://www.ihs.gov/chs"))
    check("a site that names only the town is 'town-only', not trusted",
          town == "town-only",
          "ihs.gov says the town because the Indian Health Service has an office there")

    none = attribution_of(
        biz(name="Custom Dental Ceramics", site="http://atlantadentalarts.com",
            addr="1 Main St, Phoenix, AZ"),
        read("Atlanta Dental Arts — serving Buckhead since 1994"))
    check("a site naming neither the business nor its town is refused", none is None)

    rescued = attribution_of(
        biz(name="Alan Ferguson, D.d.s, P.l.c", site="https://www.drfergusonaz.com"),
        read("This practice provides general dentistry."))
    check("the domain counts as well as the text", rescued == "named",
          "drfergusonaz.com names Ferguson even when the page body does not")

    check("a first name is not a distinctive word",
          "david" not in distinctive("Crain David A Dds"),
          "ihs.gov passed for a Phoenix dentist on the word 'david'")
    check("a surname is", "crain" in distinctive("Crain David A Dds"))
    check("so is a trade word not in the generic list",
          "grabow" in distinctive("Grabow Endodontics")
          and "dental" not in distinctive("Smith Dental Care"))

    # --- shared pages: a chain or platform page is nobody's own site
    scattered = [biz(id="a", site="https://aspendental.com", lat=33.45, lon=-112.07),
                 biz(id="b", site="https://aspendental.com", lat=33.58, lon=-112.10)]
    check("a domain used at two places is a shared page",
          shared_pages(scattered) == {"aspendental.com"})
    together = [biz(id="a", site="https://grabowendo.com", lat=33.45, lon=-112.07),
                biz(id="b", site="https://grabowendo.com", lat=33.45001, lon=-112.07001)]
    check("two listings at one address are not", shared_pages(together) == set())

    check("a host is normalised", host_of("https://WWW.Grabowendo.com/x?y=1")
          == "grabowendo.com")

    # --- every contact carries the page it was read from
    got = contacts_for(read("Call (480) 555-1234 or email hi@grabowendo.com",
                            url="https://grabowendo.com"), "+14805551234")
    check("a phone carries its page", got["phones"][0]["page"].startswith("https://"))
    check("an email carries its page", got["emails"][0]["page"].startswith("https://"))
    check("and each says how it was confirmed",
          bool(got["phones"][0]["how"]) and bool(got["emails"][0]["how"]))

    # --- the shipped files
    for market in ("dental-phoenix", "med-spa-dallas", "hvac-tampa"):
        path = APP / f"contacts-{market}.json"
        if not path.exists():
            check(f"{market} contacts exist", False, "run extract_contacts.py")
            continue
        data = json.loads(path.read_text())
        rows = data["contacts"]
        bad = [
            bid for bid, g in rows.items()
            if not g.get("withheld")
            for item in (g["emails"] + g["phones"])
            if not item.get("page") or not item.get("how")
        ]
        check(f"{market}: every shipped contact has a page and a reason", not bad,
              f"{len(bad)} without provenance")
        check(f"{market}: socials are declared absent rather than guessed",
              "not extracted" in data["socials"])
        withheld = sum(1 for g in rows.values() if g.get("withheld"))
        print(f"        {len(rows)} businesses, {withheld} withheld")

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
