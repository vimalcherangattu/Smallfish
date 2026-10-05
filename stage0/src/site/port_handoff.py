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
# --- 4b. copy and structure the owner asked for, 2026-10-04 ----------------
# These are the owner's edits to the designer's page. They live here rather
# than in the markup because the markup is regenerated from the handoff on
# every port: an edit made to `src/app/_handoff/home.html` by hand survives
# until the next revision arrives and then vanishes without trace.
#
# Each is an exact string swap and the port fails if one stops matching, so a
# revision that rewords the sentence underneath cannot silently drop the edit.
COPY_EDITS = {
    # The hero, second pass (owner review of the live page, 2026-10-04).
    #
    # "Find the businesses that need what you sell" — "ye nikaal de. Useless
    # hai ... mainstream lagg raha hai." It is the line any lead-gen tool
    # would write. It replaced the designer's "The businesses that need what
    # you sell" a day earlier, so both are gone now.
    #
    # The owner picked the two lines that already sat further down the page
    # to lead instead: the break from the status quo ("Stop working from junk
    # lists", from the close) and the cost of getting it wrong ("Every email to
    # the wrong business...", the bill section's closer — "ye usp hai").
    # HANDOFF §6: the lime highlight sits on its own line and does not reflow,
    # so the headline is the short one and the USP leads the sub-line. Both
    # originals stay where they were; at the top they now set up what the
    # bill and the close pay off.
    '<h1 class="dsp herohead">The businesses that<br>'
    '<span class="hilite">need what you sell.</span></h1>':
        '<h1 class="dsp herohead">Stop working from<br>'
        '<span class="hilite">junk lists.</span></h1>',
    # Matched after REWRITES, so this is the "one by one" wording.
    '<p class="herosub">Pick a type of business and a city. We read their websites one by one':
        '<p class="herosub"><b class="herousp">Every email to the wrong business '
        'makes the next one less likely to land.</b> So pick a type of business '
        'and a city. We read their websites one by one',

    # 4. Slide 2 — the three steps. The heading said what the product is not,
    #    which is a weaker opening than what it does.
    "This is not a lead list.":
        "You tell us two things. We do the rest.",
    "A list hands you names and leaves the work to you. This hands you the "
    "businesses that have the problem you fix, and the first email already "
    "written for each one.":
        "A type of business, and a city. Nothing to sift, no tabs to open — "
        "you get a short list you can start emailing today.",

    # 4. Slide 3 — the row. The old heading argued with lead lists before
    #    saying what the reader is looking at.
    "A list gives you a name and a number. Here is the same business, done properly.":
        "This is what one business looks like.",
    "One row, exactly as it arrives. Nothing on it was guessed, and every line "
    "of the email points at something on their own page.":
        "The contacts, why it fits, and an email you can send as it is. Every "
        "line points at something on their own website.",

    # The demo's static fallback read "3,041 / 3,041 dentists in Phoenix",
    # claiming the whole market had been read. The script's MARKETS figures are
    # corrected on every port (see `measured`), but this pair is markup, so the
    # no-JS render — and the first frame before the script runs — showed it.
    # 2,778 is the measured number of Phoenix dental listings with a website.
    '<span data-d="read">3,041</span> / <span data-d="total">3,041</span>':
        '<span data-d="read">2,778</span> / <span data-d="total">2,778</span>',

    # The same invented figure, a second time, in the reel's sub-line — and
    # missed when the pair above was fixed, because that edit matched on the
    # `data-d` markup and this one is `data-r`. It shipped to production and
    # was live for days: "42 fit of 3,041 dentists in Phoenix".
    #
    # 3,041 is in no data file. The measured counts for dental Phoenix are
    # 3,126 listings and 2,778 with a website; `3041` occurs in `public/data`
    # only inside latitude digits. The reel's script already sets this span
    # from `measured()` — this is the static value it starts from, which is
    # what a crawler, a no-JS reader and the first frame all see.
    #
    # NOT FIXED HERE, and GTM's to settle: "42 fit of 2,778 dentists in
    # Phoenix" still reads as though 2,778 were read. 200 were. That is the
    # same shape as the "we checked 2,800" overclaim this project already
    # retracted once, and the honest version is a different sentence rather
    # than a different number.
    '<span data-r="total">3,041</span>': '<span data-r="total">2,778</span>',

    # The price slab promised 2.5x what the plans can deliver.
    #
    # `/pricing` reads `PLANS` and says "$29 · 120 credits · 120 common
    # matches". The home page's slab is markup and said "$29 a month · up to
    # 300". A match costs 1, 2 or 3 credits (`BANDS`), so credits are the
    # ceiling on matches and 300 is not reachable on 120 credits at any band.
    # Every tier was wrong the same way: 300/1,000/3,000 against 120/400/1,000.
    #
    # Two pages one click apart, disagreeing by 2.5x about what money buys, on
    # a product whose argument is that its numbers are measured.
    #
    # The slider's own plan boundaries in `site.js` carried the same figures
    # (`v <= 300 ? 0 : (v <= 1000 ? 1 : 2)`) and are corrected to 120/400 in
    # the generated script; its range max drops from 3,000 to 1,000, which is
    # the largest plan.
    '<i>up to 300</i>': '<i>up to 120</i>',
    '<i>up to 1,000</i>': '<i>up to 400</i>',
    '<i>up to 3,000</i>': '<i>up to 1,000</i>',
    'type="range" min="50" max="3000" step="50" value="400"':
        'type="range" min="20" max="1000" step="20" value="400"',

    # "At 400 a month that is $79, and the ones that don't fit still cost
    # nothing." — "iska matlab nahi samjha." 400 of what, and "that is" $79
    # what? The sentence now names the noun and the plan's ceiling, the same
    # "up to" the tiles above it print. This is the no-JS / first-frame copy;
    # `JS_EDITS` writes the same sentence as the slider moves.
    "At 400 a month that is <b style=\"color:#fff\">$79</b>, and the ones that "
    "don't fit still cost nothing.":
        "<b style=\"color:#fff\">$79</b> a month gets you up to 400 businesses "
        "that fit. The ones that don't fit cost you nothing.",
}

# The same edits, in the designer's script. Before this existed the slider's
# plan boundaries were corrected by hand in the generated `site.js` — which
# the next port would have overwritten with the handoff's 300/1,000, putting
# the 2.5x overclaim back on the page with nothing to flag it.
JS_EDITS = {
    "var idx = v <= 300 ? 0 : (v <= 1000 ? 1 : 2);":
        "var idx = v <= 120 ? 0 : (v <= 400 ? 1 : 2);",
    "    var PRICE = ['$29', '$79', '$199'];\n":
        "    var PRICE = ['$29', '$79', '$199'];\n"
        "    var CAP = ['120', '400', '1,000'];\n",
    "      pline.appendChild(d.createTextNode('At ' + fmt(v) + ' a month that is '));\n":
        "",
    "pline.appendChild(d.createTextNode(\", and the ones that don't fit still cost nothing.\"));":
        "pline.appendChild(d.createTextNode(' a month gets you up to ' + CAP[idx] + "
        "\" businesses that fit. The ones that don't fit cost you nothing.\"));",
}

# 2. "Those tickmarked pointers are pointless and hideous. Take them off."
STRIP = [
    (re.compile(r'\s*<ul class="heropts">.*?</ul>', re.S), "the hero's ✓ list"),
]

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


# Heading, 2026-10-05: "Forty-four seconds, start to finish" — "most stupid
# header ever." A runtime is not a reason to press play; the heading now says
# what the film shows happening, in the reader's terms.
#
# The real film. `public/video/explainer.mp4` is 44 seconds, H.264/AAC, with a
# poster beside it — both have been in the repo since 2026-09-26 and were
# orphaned when the handoff replaced the old page.
#
# Native `<video controls>` rather than the custom player that used to wrap it:
# the handoff's own script owns everything else on this page, and a second
# player with its own state is a thing to maintain for no gain. No autoplay —
# a film that starts talking at you is the one thing people complain about.
FILM = """

<section id="watch" class="tight">
  <div class="wrap">
    <div class="sechead">
      <div class="head"><p class="kick">See it work</p><h2 class="dsp h-sec">Type one sentence. Get a list you can email.</h2></div>
      <div class="note"><p class="lede">Who you sell to and where, in your own words. What comes back is the businesses that fit, each with the first email already written.</p></div>
    </div>
    <div class="filmframe rise">
      <video controls preload="metadata" playsinline
             poster="/video/explainer-poster.jpg"
             aria-label="How Small Fish works, 44 seconds">
        <source src="/video/explainer.mp4" type="video/mp4">
      </video>
    </div>
  </div>
</section>
"""

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
/* Set when the headline was "Find the businesses that", which overflowed the
   600px hero column at the designer's 60px. Kept for "Stop working from /
   junk lists.": HANDOFF §6 wants the highlight on its own line, and measured
   at 1440 and 390 it is two lines at both. */
.sf-site .herohead { font-size: clamp(32px, 3.3vw, 49px); }

/* The USP that leads the hero's sub-line (owner, 2026-10-04: "should be on
   top"). Brighter and heavier than the rest of the paragraph, on its own line,
   so it reads as the claim and the sentence after it as the how. */
.sf-site .herousp { display: block; margin-bottom: 10px; color: #fff; font-weight: 600; font-size: 1.12em; line-height: 1.4; }

/* The film section added by the port. Sized like the other dark stages on the
   page so it sits in the same rhythm. */
.sf-site .filmframe {
  margin-top: var(--s5);
  border: 1px solid var(--line);
  background: var(--ink);
  overflow: hidden;
}
.sf-site .filmframe video {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  background: var(--ink);
}

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

    for old, new in JS_EDITS.items():
        if old not in js:
            raise SystemExit(
                f"port: a script edit no longer matches, so it would be "
                f"silently dropped:\n    {old[:90]!r}\n"
                "  The revision rewrote the script. Update JS_EDITS.")
        js = js.replace(old, new)

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

        # --- 4b. the owner's copy and structure edits (home page only)
        if dest == "home.html":
            for old, new in COPY_EDITS.items():
                if old not in body:
                    raise SystemExit(
                        f"port: a copy edit no longer matches, so it would be "
                        f"silently dropped:\n    {old[:90]!r}\n"
                        "  The revision reworded it. Update COPY_EDITS.")
                body = body.replace(old, new)
            for pat, what in STRIP:
                body, n = pat.subn("", body)
                if not n:
                    raise SystemExit(f"port: nothing to strip for {what}")
            # The 44-second film, as its own section. HANDOFF: "If a real film
            # is shot later it belongs in a **new** section, not in place of
            # this one" — #film is the live demo and stays.
            end = body.index("</section>", body.index('id="film"')) + len("</section>")
            body = body[:end] + FILM + body[end:]
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
