"""A market must contain the niche it claims to be about.

It was nobody's job to check, and it cost a gate item. The med spa benchmark
ran 1,000 businesses of which **only 31% were `medical_spa`**. The rest came
from Overture's catch-all `spas`, which is nail salons, barbershops and
braiding studios — *Vela Braids Studio*, *Bnails Non-Toxic Nail Salon*,
*Sauccy Fades Dallas Barbershop*. They do not offer Botox and their websites
never mention it, so the engine answered couldn't-tell, which is **correct**.
The market's couldn't-tell rate then read 44.8% against a 25% target and the
engine looked broken.

Measured, split by category, same engine and crawl and prompt:

    medical_spa       39% couldn't-tell, 51% offer a neurotoxin
    everything else   75% couldn't-tell,  7%

The rule the dental market already followed and the others did not:
**`expanded` means another name for the same niche, never an adjacent
industry.** Dental's expanded list is orthodontists, endodontists and
periodontists, and it runs 84% on-primary. Med spa's was day spas and float
tanks; HVAC's was `contractor` and `plumbing`.

    python3 stage0/tests/test_niche_scope.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from benchmark.run import in_niche  # noqa: E402

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
    markets = {m["id"]: m for m in spec["markets"]}

    # --- the catch-alls that caused it are gone
    for mid, banned in [
        ("med-spa-dallas", {"spas", "day_spa", "health_spa", "float_spa"}),
        ("hvac-tampa", {"contractor", "plumbing"}),
        ("vet-columbus", {"pet_services"}),
    ]:
        cats = markets[mid]["categories"]
        listed = set(cats.get("primary", [])) | set(cats.get("expanded", []))
        check(
            f"{mid} no longer admits {sorted(banned)} by category",
            not (listed & banned),
            "a category that mostly is not the niche cannot be an expanded category",
        )
        check(f"{mid} records what it dropped and why",
              bool(cats.get("dropped_2026_09_22")) and bool(cats.get("scoping_note")),
              "a silently narrowed market is a silently changed measurement")

    # --- the concrete businesses that started this
    med = markets["med-spa-dallas"]["categories"]
    for name, cat in [("Vela Braids Studio", "spas"),
                      ("Bnails - Non Toxic Nail Salon", "spas"),
                      ("Sauccy Fades Dallas Barbershop", "spas"),
                      ("GiGi Zen Spa", "day_spa")]:
        check(f"{name!r} is out of the med spa market",
              not in_niche({"name": name, "cat": cat}, med))
    check("an actual medical spa is in",
          in_niche({"name": "Rejuvia Wellness and Medical Spa",
                    "cat": "medical_spa"}, med))

    # --- HVAC: the category goes, the real firms inside it are rescued by name
    hv = markets["hvac-tampa"]["categories"]
    for name in ("Arctic Air & Refrigeration", "Alphe's Air Conditioning & Refrigeration",
                 "Blume Mechanical", "ABC Plumbing, Air, Heat, & Electric",
                 "R & R Plumbing & Heating"):
        cat = "plumbing" if "Plumb" in name else "contractor"
        check(f"{name!r} is rescued into the HVAC market",
              in_niche({"name": name, "cat": cat}, hv),
              "only 2% of `contractor` is HVAC, but that 2% is real")
    for name in ("LEMA Construction", "A & A Granite & Quartz Corp.",
                 "Gulfside Pool & Spa", "Artisan"):
        check(f"{name!r} stays out of the HVAC market",
              not in_niche({"name": name, "cat": "contractor"}, hv))

    # --- dental was already right and must not be disturbed
    den = markets["dental-phoenix"]["categories"]
    for cat in ("dentist", "general_dentistry", "orthodontist", "oral_surgeon",
                "endodontist", "periodontist", "prosthodontist"):
        check(f"dental still admits {cat}",
              in_niche({"name": "Some Practice", "cat": cat}, den),
              "every dental expanded entry is a dental specialty — that is the rule")

    # --- the rule itself, as a guard against the next loose list
    check(
        "no market admits a business whose category it does not list",
        all(not in_niche({"name": "Whatever", "cat": "totally_unrelated"},
                         m["categories"]) for m in spec["markets"]),
    )
    check(
        "a rescue never fires on a category the market did not name",
        not in_niche({"name": "Arctic Air & Refrigeration", "cat": "spas"}, hv),
        "the name check is a rescue for listed categories, not a way in for anything",
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
