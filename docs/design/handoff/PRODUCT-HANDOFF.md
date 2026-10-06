# Small Fish — product UI/UX handoff

Everything needed to build the **application**. The marketing site is a separate package
(`smallfish-handoff.zip`) and shares the tokens in §2 but nothing else.

Read §1 and §3 before writing a line. They are not style preferences — they are the product.
Every other section tells you how to build; those two tell you what it is, and getting them
wrong produces a different product that happens to look similar.

---

## 0 · What is in the box

```
PRODUCT-HANDOFF.md      this file
artboards/              every app screen as a standalone HTML file, open in a browser
src/                    kit.py + the screen modules that generate the artboards
SCREENS.md              one-line index of every artboard and what it proves
```

The artboards are **rendered specifications, not a component library**. They are static HTML
with no page JavaScript, generated from Python. Read them for layout, spacing, copy and
state; build the real thing in your own stack. Where this document and an artboard disagree,
this document wins.

The canvas is at `https://claude.ai/artifact/NK9uQU8G2M94CsipKivEYQ` — the row
**"App v2 — built to the engineering brief"** is the current app. Rows above it are earlier
explorations; several boards there are titled "(superseded)" and should be ignored.

---

## 1 · What the product is

A person who sells something to small businesses tells us **what they sell** and **who they
sell it to**. We open each candidate business's own website, read it, and hand back **only
the ones that fit** — each with a contact and an opening email already written.

Three consequences that drive almost every decision below:

**We never send email.** There is no outbox, no sequence, no scheduler, no "connect your
Gmail". The last action on any business is **Copy** or **Export**. If you find yourself
building a Send button, you have misread the product.

**Every claim carries its evidence.** We never say a business fits without showing the
sentence from their site that made us say so, and where it came from. A verdict with no
quote is a bug, not a terse state.

**"Couldn't tell" is an answer, not a failure.** Plenty of sites do not say. Those businesses
come back explicitly marked as unknown, with what we looked at and what was missing. They are
not hidden, not greyed out, not sorted to the bottom as damaged goods.

The competitive reason this matters: every tool in this space shows a verdict. Not one shows
its proof. The evidence is the product.

---

## 2 · Tokens

Define once, use everywhere. No other colours exist.

```
--ink        #0E1520   text, dark panels
--ink-2      #1B2533   dark panel borders
--ink-3      #36404C   secondary text on light
--muted      #5B6470   supporting text
--muted-d    #8A929B   disabled-looking but never disabled; "couldn't tell"
--paper      #EEF0EC   app background
--paper-2    #F6F7F4   recessed areas, footers, wells
--surface    #FFFFFF   cards, rows, inputs
--fill       #E3E6E0   pressed plates, inert bars
--line       #D5D9D2   default hairline
--line-2     #B9BFB6   stronger hairline
--lure       #C8F03C   the brand green
--lure-d     #B5DE28   its hover
--lure-ink   #4A6508   lure as TEXT on light — never use --lure for text
--lure-tint  #E9F7B5   lure backgrounds that are not buttons
```

**The one-lure rule.** At most one `--lure`-filled element per screen, and it is the single
main action. Everything else that wants emphasis uses `--lure-tint` behind, or `--lure-ink`
as text, or an ink border. Two lime buttons on one screen is the most common way this design
gets broken — it already happened once on the results screen and had to be undone.

`--lure` on light is **never** text. Contrast fails. Use `--lure-ink`.

Fonts, from Google Fonts: **Literata** (variable, `opsz` axis), **Libre Franklin**, **DM Mono**.

**The three-typeface rule, which is semantic, not decorative:**

| Face | Means |
|---|---|
| **Literata** (serif) | words a *business published* — their name, the quote we read off their site, the email we drafted in their language |
| **DM Mono** | numbers *we counted*, and machine facts — counts, credits, URLs, dates, phone numbers |
| **Libre Franklin** | *our* explanations — labels, buttons, interface copy |

A reader should be able to tell, without reading, which words came from the business and
which came from us. Do not use the serif for UI chrome because it looks nice.

Type ramp, as `.t-*` classes in the artboards:

```
.t-h1  Literata 700 · 30/38 · -.013em        screen titles
.t-h2  Libre Franklin 600 · 20/26             section titles
.t-h3  Libre Franklin 600 · 15/21             group labels
.t-ev  Literata 400 · 17/25                   evidence quotes + email body
.t-b   Libre Franklin 400 · 15/24             body
.t-s   Libre Franklin 400 · 13/20 · muted     supporting
.t-d   DM Mono 400 · 13/18                    data
.kick  DM Mono 500 · 11 · .15em caps          eyebrows
```

Spacing is an 8px base. Hairlines are 1px `--line`; a 2px rule is a deliberate section break
and 3px means "this block is set apart" (the honest-answer block uses a 3px left rule).

**Type rules that bite.** Do not set `font-variation-settings` — `SOFT` was a Fraunces axis
and no longer exists; Literata's optical-size axis is driven by the browser. Keep display
tracking near −.013em; the heavy negative tracking the old serif needed looks cramped here.
DM Mono ships 400 and 500 only — there is no 600.

Nothing has a border radius except pills — buttons (`999px`), chips, the credit counter.
Cards, rows, inputs and tiles are square. This is on purpose; it is most of why the product
reads as a document rather than a dashboard.

---

## 3 · Do not change these without asking

1. **No Send button, anywhere, ever.** No outbox, no scheduling, no mailbox connection. The
   terminal action is Copy or Export. This is the product's promise and a legal posture, not
   a roadmap gap.
2. **No scores, tiers, percentages, star ratings, letter grades or "match strength".** Not
   even internally-visible ones. A business fits, does not fit, or we could not tell. A number
   invites the user to trust a ranking we cannot justify line by line.
3. **No claim without its evidence.** If the UI states a reason, the quote and its source must
   be one interaction away at most — in practice, visible in the expanded row.
4. **"Couldn't tell" is never grey, disabled, collapsed or sorted last as a penalty.** It gets
   the same card, the same weight, and an explanation of what we looked at.
5. **One `--lure` element per screen.** See §2.
6. **Never invent a field.** If a site does not publish an email, the field is absent and says
   so in words. Do not fall back to `info@domain`, do not guess a format, do not show a
   placeholder that looks like data.
7. **No benchmark or volume figures in any user-facing surface.** Earlier internal reading was
   for pricing work only. Do not surface "we read N sites", "N businesses analysed", or any
   derivative. Market-size numbers inside a search ("of 3,041 dentists in Phoenix") are fine —
   those describe the market, not our activity.
8. **The fish is the brand.** It is a drawn outline, not an icon font, not a stock mark.

---

## 4 · Shell and navigation

```
┌───────────┬──────────────────────────────────────┐
│ sidebar   │ appbar  (64px, white, 1px bottom)    │
│ 252px     ├──────────────────────────────────────┤
│ ink       │ content  (--paper)                   │
└───────────┴──────────────────────────────────────┘
```

**Appbar** — logo lockup left; right holds the credit counter (`.credit`, a mono pill:
`20 of 20 free left`) and the account menu. Nothing else. No global search, no notification
bell, no help beacon.

**Sidebar** — deliberately short. New search · My lists · Contacted · Saved searches ·
Get more. Five items. Every time someone proposes a sixth, the answer is that the product
does one thing. The sidebar is `--ink` with `--paper` text; the active item carries a lure
left bar, not a filled background.

The first-run screen has **no sidebar** — the person has nothing yet, and a navigation rail
to five empty destinations is worse than none.

---

## 5 · The screens

Numbers match the artboard filenames. Phone variants exist for 1, 2 and 3.

### 5.1 First run — `AppFirstRun`

One question, asked in a sentence: **I sell [___] to [___] in [___]**. The `.bigq` component
is three inline slots in Literata at 30px, filled or placeholder. It is a form that does not
look like a form, because the form is two facts.

Under it, **four ways in** as pressable tiles (`.ptile`, §6.6): start from an example · pick
it on a map · start from a template · bring your own list. The first carries a `start here`
tag and a lure-tint plate; it is suggested, not selected.

The single lure action is **Find them**. Beneath it, in small type, the honest footnote: what
we will do, and that the first 20 are free with no card.

### 5.2 The result — `AppResults`

Head: the search restated as a sentence, with the counts beside it in mono. Then a tab strip
(`.tabs2`): **Fits · Couldn't tell · Not a fit**, each with its count. Fits is default.

The body is a stack of business rows (§6.1). Above them sits the honest-answer block (§6.2)
when there is anything to be honest about.

At the bottom, the **cost bar** (`.costbar`) — an ink panel itemising what this search used
and what remains. Its button is `.btn.white`, not lure: the lure on this screen belongs to
**Copy email** in the open row.

The fit / couldn't-tell counts in the artboards (26 / 38) are **placeholder**. Wire them to
real output; do not ship the numbers as written.

### 5.3 The business row — `AppRow`

The product's central component. Shown collapsed and expanded on one artboard. Full anatomy
in §6.1.

### 5.4 Couldn't tell — `AppUnsure`

The tab nobody else in this market builds. Each row says what we opened, what we were looking
for, and what the site did not say — then offers the two useful moves: *look again at a
deeper page* and *tell us it fits anyway*. The `.unsure` glyph is a dashed circle with a `?`
in mono, in `--muted-d`. Dashed, because the judgement is open, not broken.

Never style this tab as an error state. No warning triangle, no amber, no red.

### 5.5 Reading in progress — `AppProgress`

Businesses arrive as they are read, oldest first; the list is usable before it is finished.
Show what is being read right now by name, and the count done against the count found. The
progress bar is `--fill` with a `--lure` fill — this is the one place a lure element is not a
button, and it is allowed because it is the subject of the screen.

Do not block the screen behind a spinner. Do not show a fake percentage. If the backend
cannot report progress, show the count rising and nothing else.

### 5.6 Nothing found — `AppEmpty`

Says plainly that nothing fit, repeats the search back so the person can see what was asked,
and offers three specific widenings — a nearby city, a looser description, a related trade —
each as a pressable tile. It also says the search cost nothing, because it found nothing.

An empty state that only apologises is a dead end. Every empty state in this product ends in
a next action.

### 5.7 Phone — `AppFirstRunM`, `AppResultsM`, `AppRowM`

390px. The sidebar becomes a bottom bar of three: Search · Lists · Account. Rows stack: name,
town, reason, then the evidence; contacts become a wrapped column. The email well is full
width with Copy pinned beneath it. The `.ptiles` grid collapses to one column under 620px.

---

## 6 · Components

### 6.1 Business row — `.rowc`

**Collapsed:**

```
Lumen Med Spa                               [email ready]  [v]
Uptown, Dallas TX
No way to book online. The only route in is the phone number in their header.
```

- `.bname` — Literata 22px. Their name, their words.
- `.btown` — mono 13px, muted.
- `.reason` — Libre Franklin 15/24, max 62ch. **One sentence, specific, in plain English.** Not a
  category, not a tag, not "booking: absent". A person should be able to read it aloud on a
  call.
- `.ready` — lure-tint pill, `opening email written`. Present only when true.
- `.chev` — 34px square, 1px border. Expands.

> `.reason` must not be named `.why` — that class is already a lure pill in the kit and the
> row inherits it. This has bitten once.

**Expanded, in order:**

1. `.evbox` — a 2px lure left rule with the quote in `.t-ev` (Literata 17/25) and the source
   underneath in mono: *their home page · read 2 Oct*. The quote is **verbatim from their
   site**. Never paraphrase it, never clean up their grammar, never truncate mid-claim.
2. `.cts2` — contacts as mono chips: phone, email, site. A contact we do not have is **absent
   and named** — "no email on the site, contact form only" — not an empty chip.
3. `.mailwell` — the drafted opening email on `--paper-2`. Header carries the tone switcher
   and the subject line; body is Literata 17/25, max 60ch, two or three short paragraphs. It
   references the specific thing we read. A generic template here destroys the product's
   entire argument.
4. `.rowacts` — the action strip on `--paper-2`. **Copy email** is the lure button. Beside it,
   `.qbtn` ghosts: Edit · Mark contacted · Not a fit · See the pages we read.

**There is no Send.** See §3.1.

### 6.2 Honest answer — `.honest`

A `--paper-2` block with a 3px `--muted-d` left rule, used wherever the product has to admit
something: *38 of these we could not tell about*, *4 sites would not load*, *this search found
fewer than you asked for*. Grid of glyph · sentence · action.

It appears **above** the results, not below. Caveats buried under the thing they qualify are
not caveats.

### 6.3 Tabs — `.tabs2`

Text + count, 2px ink underline on the active one. No pills, no background fills. The counts
are mono and always shown, including zero — a zero tab is information.

### 6.4 Cost bar — `.costbar`

Ink panel, used at the end of a result and on the plan screen. Left: what this cost in plain
words. `.itemised` beneath: the breakdown in mono, muted. Right: a `.btn.white`. Never lure —
see §2.

### 6.5 Buttons

```
.btn            lure fill, ink text, 46px, pill        the one main action
.btn.big        56px                                   first run, sign-up
.btn.ink        ink fill, lure text                    on light panels where lure is taken
.btn.white      white, --line border                   secondary in dark contexts
.btn.ghost      transparent, --line-2 border           tertiary
.qbtn           36px square-cornered, white            row actions
.lnk            text + 1px underline                   inline navigation
```

### 6.6 Pressable tile — `.ptile`

Used for parallel choices: the four ways in, the widenings on the empty state. Two layers —
a `--fill` plate offset 5px down-right, and the white face riding on it. Hover translates the
face `-2px,-2px` and darkens its border to ink; `:active` pushes it `+2px,+2px` into the
plate. 140ms. No shadow, no blur, no gradient, no 3D transform.

The suggested tile gets a `--lure-tint` plate, a lure-tint icon chip and a `start here` tag.
It is **tinted, never filled** — the screen's one lure button is elsewhere.

Grid is two columns, collapsing to one under 620px. Icon chip is a 34px square with a hairline
border; label in Libre Franklin 500 15.5px with the explanation under it in 13.5px muted.

Mechanically this is adapted from a glassmorphic icon-button pattern. Everything that made it
glass — the six-hue gradient map, the blur, the bevel, the floating lean, the icon-only label
— was dropped, because each one breaks a rule in §2 or §3. Keep the two-layer press. If
someone reintroduces the gradients, the one-lure rule is gone.

### 6.7 Evidence marker — `.mark`

`#E4F5A6` behind text, `box-decoration-break: clone` so it wraps correctly. Marks the exact
span inside a quote that triggered the verdict. Use it sparingly — one phrase, not a sentence.

---

## 7 · States, every component

For each list or row, build these five. The artboards show all of them somewhere.

| State | Rule |
|---|---|
| Loading | Streaming, not blocking. Rows appear as they resolve. §5.5 |
| Populated | Default. |
| Couldn't tell | First-class. Own tab, own row treatment, never grey-disabled. §5.4 |
| Empty | Names what was searched and offers three concrete widenings. §5.6 |
| Error | Says which part failed and what is still usable. A site that would not load is reported per business, not as a global failure. |

A site that times out, blocks us, or has no content is a **per-business outcome** that lands
in Couldn't tell with the reason stated. It is not a toast and not a retry dialog.

---

## 8 · Copy rules

The interface copy is part of the design; do not rewrite it in review.

- **Plain words, no jargon.** "Businesses that fit", not "qualified prospects". "We opened
  their website", not "we enriched the record". The user is a person selling plumbing
  software, not a RevOps analyst.
- **Sentences, not labels,** wherever there is room. `No way to book online. The only route in
  is the phone number in their header.` beats `Online booking: none`.
- **Say what we did, in past tense, concretely.** "We read three pages of their site on 2
  October." Not "AI-powered analysis complete."
- **Admit gaps in words.** "Their site does not list an email — only a contact form."
- **Never anthropomorphise the product and never say AI** in the interface. It reads as a
  disclaimer and invites doubt about the evidence, which is the one thing we want trusted.
- **Numbers in mono, always,** including inside sentences.
- **No exclamation marks. No emoji. No "Oops".**

---

## 9 · Accessibility — build it in, do not retrofit

- Every interactive element is a real `<button>` or `<a>`. The tiles are `<button>`, the
  chevron is a `<button>`, the tabs are `<button>`s in a `role="tablist"`.
- `:focus-visible` is a 2px ink outline at 2px offset, everywhere. Never remove it.
- Contrast: ink on paper ≈ 15:1; muted on surface ≈ 5.5:1. `--lure` passes only as a
  *background* behind ink text. Check any new pairing.
- Decorative SVG gets `aria-hidden="true"`; the fish mark gets `role="img"` and a label.
- The `.unsure` glyph is not the only signal — the word *couldn't tell* is always present.
- Respect `prefers-reduced-motion`: the tile press, the row expand and the progress fill all
  drop to instant. Nothing in the app depends on motion to be understood.
- Target size 44px minimum on phone, including the chevron and the tab strip.

---

## 10 · Interaction specs

| Thing | Spec |
|---|---|
| Tile press | 140ms ease, translate only |
| Row expand | 200ms height, content fades in at 120ms |
| Tone switch in the email well | 300ms crossfade on the body paragraph |
| Copy | button label becomes `Copied` for 1.6s, then reverts. No toast. |
| Tab change | instant |
| Streaming row arrival | new row fades in over 180ms; the list never reorders under the cursor |

The last one matters: once a row is on screen it does not move. Results arriving later append.
Re-sorting a live list is how people lose the business they were reading.

---

## 11 · What the UI implies about the backend

Not a data spec, but the screens will not work without these:

- Per business: name, town, site, the verdict (`fit` / `no` / `unknown`), **the reason
  sentence**, **the verbatim quote**, **the source page and the date it was read**, the pages
  examined, contacts found (each nullable, with a stated absence), and the drafted email with
  its tone variants.
- The quote and the source are **required** for any `fit`. A `fit` without them cannot be
  rendered and should be treated as an error upstream, not as a row with a gap.
- `unknown` requires the list of pages examined and what was being looked for.
- Streaming: results must be deliverable incrementally for §5.5 to be honest.

---

## 12 · Before you call it done

- [ ] No Send button exists anywhere in the codebase.
- [ ] Exactly one lure-filled element per screen. Grep for the token and count per route.
- [ ] Every `fit` row renders a quote and a source. Try one with a missing quote — it should
      fail loudly, not render blank.
- [ ] The Couldn't-tell tab is reachable, populated, and uses no grey-disabled styling.
- [ ] No score, percentage, tier or star appears in any component or any API response the UI
      reads.
- [ ] Missing contacts say so in words; nothing falls back to a guessed address.
- [ ] Keyboard: tab through first run and a results row end to end, with visible focus
      throughout.
- [ ] 390px: all three phone screens, no horizontal scroll.
- [ ] `prefers-reduced-motion: reduce` — everything still legible and operable.
- [ ] No string anywhere counts how many sites we have read historically.
