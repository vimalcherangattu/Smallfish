"""Build the marketing pages from a designer handoff.

    python3 stage0/src/site/port_handoff.py path/to/smallfish-handoff

Writes `public/handoff/site.{css,js}` and `src/app/_handoff/*.html`, which
`src/components/HandoffPage.tsx` serves. Re-run it for every new handoff.

## Why this is a script and not a hand edit

The home page arrived three times in two days: the original, a revision that
moved the demo card out of the hero, and whatever comes next. Each one is
~200 KB of hand-tuned markup carrying 27 inline SVGs, and each one needs the
same six changes applied before it can ship. Doing that by hand once is fine.
Doing it three times is how a fix silently stops being applied — the second
port lost its type floor to a mis-trimmed brace and nobody could see it,
because the stylesheet still loaded.

So the changes are encoded here, and the port is one command.

## The six changes, and why each is not a style preference

1. **Hrefs** → this repo's real routes. The handoff's `/signup`, `/signin`,
   `/remove`, `/how-we-crawl` and `/what-we-get-wrong` do not exist here.
   `/sign-up` keeps `?source=home`: without it every direct sign-up is
   indistinguishable from one a channel earned (`doors.ts`).

2. **The wordmark** → `/`. It ships as `href="#"` in the nav and footer of both
   pages. A logo that goes nowhere is the one link every visitor tries.

3. **Six global CSS rules** → scoped to `.sf-site`. `globals.css` already owns
   `body` at the same specificity, so leaving them global makes the result
   depend on stylesheet order.

4. **Coverage claims** → rewritten. `CLAUDE.md` records "every" as the one word
   this product cannot use: we read 200 of the 2,778 Phoenix dental sites with
   a website. **An unrecognised claim stops the build** rather than being
   guessed at — see `COVERAGE_CLAIM` below.

5. **Demo market figures** → from `public/data`. The handoff ships placeholders
   and HANDOFF §7.4 says to swap them; one of them, `612`, is a figure this
   repo caught as invented once before and `test_home_copy.mjs` bans by name.

6. **A mobile addendum**, appended after the designer's rules so the diff
   against the next handoff stays readable.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PAGES = {"smallfish-home.html": "home.html",
         "smallfish-how-we-check.html": "how-we-check.html"}

# --- 1. hrefs ---------------------------------------------------------------
HREFS = {
    "/signup": "/sign-up?source=home",
    "/signin": "/app",
    "/remove": "/opt-out",
    "/how-we-crawl": "/bot",
    "/what-we-get-wrong": "/benchmark",
}
KEEP = {"/", "/how-we-check", "/markets", "/pricing", "/privacy", "/terms",
        "/why-it-exists"}

# --- 4. coverage claims -----------------------------------------------------
# Every rewrite here says the same thing without claiming completeness. The
# wording is the one the repo already settled on: "one by one".
REWRITES = {
    "We read every one of their websites and hand back only the ones that fit":
        "We read their websites one by one and hand back only the ones that fit",
    "We open every one of their websites and read it.":
        "We open their websites and read them, one by one.",
    "Every business, one by one, on its own website.":
        "One business at a time, on its own website.",
    "Every site read.": "Read one by one.",
    "We read every site": "We read them one by one",
}

# What a coverage claim looks like. A match that no rewrite covers is a new
# claim a human has to decide about, so the port stops.
COVERAGE_CLAIM = re.compile(
    r"(?:we\s+)?(?:read|open|check|visit)\s+every\s+(?:one\s+of\s+their\s+)?(?:site|website)s?"
    r"|every\s+(?:site|website)\s+(?:read|checked|opened)",
    re.I,
)

# --- 5. the markets the hero demo cycles ------------------------------------
# `read` is what a scan of that market would open, so it is `withSite`: a
# listing with no website is nothing to read.
MARKETS = {
    "dental clinics in Phoenix": "dental-phoenix",
    "med spas in Dallas": "med-spa-dallas",
    "HVAC companies in Tampa": "hvac-tampa",
}
CRITERION = {"dental-phoenix": "no_online_booking",
             "med-spa-dallas": "no_online_booking",
             "hvac-tampa": "no_quote_form"}


def measured(market: str) -> tuple[int, int]:
    d = json.loads((ROOT / "public" / "data" / f"{market}.json").read_text())
    return d["counts"]["withSite"], d["tallies"][CRITERION[market]]["match"]


def visible(markup: str) -> str:
    t = re.sub(r"<(script|style|svg)\b.*?</\1>", " ", markup, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))


def scope_css(css: str) -> str:
    """Six rules that would otherwise leak out of the marketing pages."""
    subs = [
        (r"(?m)^(\s*):root(\s*\{)", r"\1.sf-site\2"),
        (r"(?m)^(\s*)body\{margin:0;background:", r"\1body{margin:0}\n.sf-site{background:"),
        (r"(?m)^(\s*)body\{font-size:16px\}", r"\1.sf-site{font-size:16px}"),
        (r"(?m)^(\s*)a\{color:inherit\}", r"\1.sf-site a{color:inherit}"),
        (r"(?m)^(\s*)img,svg\{display:block\}",
         r"\1.sf-site img,.sf-site svg{display:block}"),
    ]
    for pat, rep in subs:
        css, n = re.subn(pat, rep, css)
        if not n:
            raise SystemExit(f"port: CSS rule not found, the handoff changed: {pat}")
    return css + "\n.sf-site{min-height:100vh}\n"


def type_floor(css: str) -> str:
    """Every selector in the designer's own rules that sets a size under 12px.

    Derived rather than chased one audit finding at a time. Comments are
    stripped first: an earlier version scanned the raw stylesheet, pulled three
    comment fragments in as selectors, and since one invalid selector in a
    comma list invalidates the whole rule, the floor silently did nothing.
    """
    clean = re.sub(r"/\*.*?\*/", " ", css, flags=re.S)
    valid = re.compile(r"^[.#]?[A-Za-z][\w .#>:\[\]=\"'()-]*$")
    small: dict[str, float] = {}
    for m in re.finditer(r"([^{}]+)\{([^}]*)\}", clean):
        sel, body = m.group(1).strip(), m.group(2)
        if sel.startswith("@") or "{" in sel:
            continue
        fs = re.search(r"(?:^|;)\s*font-size:\s*([\d.]+)px", body)
        sh = re.search(r"(?:^|;)\s*font:\s*(?:[\w\s]*?\s)?([\d.]+)px", body)
        size = float(fs.group(1)) if fs else (float(sh.group(1)) if sh else None)
        if size is None or size >= 12:
            continue
        for part in (p.strip() for p in sel.split(",")):
            if part and valid.match(part):
                small[part] = min(small.get(part, 99), size)
    return "\n".join(f"  .sf-site {s}," for s in sorted(small))


MOBILE = """
/* ---------------------------------------------------------------------------
   Mobile addendum — generated by stage0/src/site/port_handoff.py. Everything
   above this line is the designer's, untouched.

   HANDOFF §11 claims "Touch targets >= 44px" and §13 asks for 390px to be
   clean. Measured with `check_mobile.mjs`, the handoff ships 9x9 market dots,
   25x25 annotation pins and a 26px wordmark.

   The box is grown with transparent borders and `background-clip:
   content-box`, so the drawn dot and circle keep their exact size. Not with
   `::after`: `.pin::after` is already the designer's ping ring, and a pseudo
   element grows what a finger can hit without growing the element's own box,
   which reads as passing an audit rather than fixing a control.
   --------------------------------------------------------------------------- */
@media (max-width: 760px) {
  .sf-site .hdot,
  .sf-site .pin {
    box-sizing: content-box;
    background-clip: content-box;
    border-style: solid;
    border-color: transparent;
  }
  .sf-site .hdot { border-width: 18px; }
  .sf-site .pin  { border-width: 10px; }
  .sf-site .hdots { gap: 2px; }

  /* The wordmark carries no class; it is the anchor wrapping the mark. */
  .sf-site a:has(> svg[aria-label="Small Fish"]),
  .sf-site .quiet,
  .sf-site .arrowlink,
  .sf-site .r2link,
  .sf-site .crumb a,
  .sf-site .demo a,
  .sf-site .rowcard a,
  .sf-site button[aria-label="Pause"],
  .sf-site button[aria-label="Play"] {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }

  /* The 12px floor, on phones only. Desktop keeps the designer's 10.5-11.5px
     label scale exactly as drawn. The handoff does not claim a text floor
     (§11 is touch targets and input size), so this is the repo's standard
     meeting the designer's type, not a defect on their side. */
__FLOOR__
  .sf-site .sfu,
  .sf-site .sfv,
  .sf-site .find .k,
  .sf-site footer h4 { font-size: 12px; }
}
"""


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not src or not (src / "pages").is_dir():
        raise SystemExit("usage: port_handoff.py path/to/smallfish-handoff")

    home = (src / "pages" / "smallfish-home.html").read_text()
    css = "".join(re.findall(r"<style[^>]*>(.*?)</style>", home, re.S))
    js = re.findall(r"<script(?![^>]*\ssrc)[^>]*>(.*?)</script>", home, re.S)[0]

    # --- 5. real market figures
    for to, market in MARKETS.items():
        read, fit = measured(market)
        pat = re.compile(r"(to: '" + re.escape(to) + r"', n: )\d+(,[^\n]*?read: )\d+")
        js, n = pat.subn(rf"\g<1>{fit}\g<2>{read}", js)
        if n != 1:
            raise SystemExit(f"port: could not set figures for {to!r} ({n} matches)")
        print(f"  {to}: {fit} fit of {read:,} read")

    style = scope_css(css)
    (ROOT / "public" / "handoff").mkdir(parents=True, exist_ok=True)
    (ROOT / "public" / "handoff" / "site.css").write_text(
        style + MOBILE.replace("__FLOOR__", type_floor(style)))
    (ROOT / "public" / "handoff" / "site.js").write_text(js)

    out = ROOT / "src" / "app" / "_handoff"
    out.mkdir(parents=True, exist_ok=True)
    for name, dest in PAGES.items():
        s = (src / "pages" / name).read_text()
        body = re.search(r"<body[^>]*>(.*)</body>", s, re.S).group(1)
        body = re.sub(r"<script\b.*?</script>", "", body, flags=re.S)

        # --- 2. the wordmark
        def wordmark(m: re.Match[str]) -> str:
            after = body[m.end(): m.end() + 200]
            return (m.group(0).replace('href="#"', 'href="/"')
                    if 'aria-label="Small Fish"' in after else m.group(0))
        body = re.sub(r'<a href="#"[^>]*>', wordmark, body)

        # --- 1. hrefs
        for h in sorted(set(re.findall(r'href="(/[^"]*)"', body))):
            if h in HREFS:
                body = body.replace(f'href="{h}"', f'href="{HREFS[h]}"')
            elif h not in KEEP:
                raise SystemExit(f"port: unmapped href {h} in {name}")

        # --- 4. coverage claims
        for old, new in REWRITES.items():
            body = body.replace(old, new)
        left = COVERAGE_CLAIM.search(visible(body))
        if left:
            raise SystemExit(
                f"port: {name} claims we read every website, and no rewrite covers it:\n"
                f"    ...{left.group(0)}...\n"
                "  We read 200 of the 2,778 Phoenix dental sites with a website.\n"
                "  Add a rewrite to REWRITES, or take it up with the designer.")

        (out / dest).write_text(body.strip() + "\n")
        print(f"  wrote src/app/_handoff/{dest} ({len(body):,} chars)")

    print("  wrote public/handoff/site.css, site.js")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
