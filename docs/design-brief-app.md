# Brief for the design-system bot — the Small Fish app screens

Paste this whole file. It is written to be handed to a design tool that will come back
with screens. Everything in §6 is a hard constraint: a screen that breaks one of those is
wrong even if it is beautiful.

---

## 1 · Who is using this

A small business owner who sells to other small businesses. A plumber selling drain
contracts to restaurants. A web studio selling booking systems to dental clinics. A
bookkeeper selling to salons.

Assume about them:

- **Not technical.** Does not know what a crawler, an API or a verdict is. Has never used
  a sales tool. Uses a phone, Gmail and maybe a spreadsheet.
- **Busy and sceptical.** Has been sold a junk lead list before and is expecting this to
  be another one.
- **Here for one thing:** a short list of real businesses they could email today, with the
  email already written.
- **Time budget: about ninety seconds** before they decide this is or is not for them.

They are not analysts. They will not read a paragraph. They do not want a dashboard of
metrics — they want names and a first sentence to send.

## 2 · The one job the app has

> Turn "I sell online booking to dental clinics in Phoenix" into **a handful of real
> clinics with a contact and an opening email I can send today.**

Every screen is judged on how directly it serves that. Anything that does not move the
user toward *a name plus an email they would actually send* is decoration.

## 3 · What the product actually does (so you design the true thing)

- The user names a **type of business** and a **city**, and what they sell.
- We read each business's **own website**, page by page, and decide whether it fits.
- Three honest outcomes per business: **it fits**, **it doesn't**, or **we couldn't tell**.
  The third is real and is never guessed and never charged for.
- For each business that fits, we produce an **opening email** built only from what is
  actually on their site — never invented.
- The user pays **only for businesses that fit**. First 20 free, no card.
- **We never send anything.** The user copies or exports and sends it themselves.

## 4 · What is wrong today (design against this)

The current screen is an instrument panel for our engine. The real screenshot shows:

| What the screen shows | What the user needed |
|---|---|
| A map of Dallas taking 40% of the width | A list of businesses |
| `PRESENCE` / `ABSENCE` tags on criteria | "has it" / "doesn't have it" |
| Five status chips: `Match 26`, `Couldn't tell 38`, `Site blocks reading 24`, `No match 57`, `Not read yet 2,843` | Two numbers at most |
| `$28.28 to scan this region — 2,788 unread at ~$0.010 each` above the results | The cost at the moment of choosing, not before any value |
| `Export 0 matched rows with proof` as the main button | A button that is not a zero |
| Rows reading `1 relevant page(s) read via technology detection; no sign of it` | "No way to book online. We checked 3 pages." |
| `21 duplicate listings folded`, `64 as counts`, `0 unlocked`, `~1,963 sq mi` | None of this |
| **No opening email anywhere on the screen** | The email — it is the product |
| Nothing at all for a first-time user | A first step |

**The deepest problem: the screen is written for us, not for them.** It is defending the
engine's accuracy to an audience that has not yet been shown a single thing worth having.

## 5 · The screens to design

### 5.1 First run — the most important screen, and it does not exist today

What a user sees the first time, before any search. Today they get a map and chips.

Requirements:
- **One question, large, in plain words.** What do you sell, and where.
- **Two or three one-click examples** that fill it in — a real trade and a real city — so
  somebody who does not know what to type can still see the product work.
- Says what will happen next in one short line, and what it costs (nothing, for the first
  20).
- No map, no counts, no taxonomy, no cost estimate. Nothing to dismiss.

### 5.2 The result — the main screen

The answer to their question, and the list.

- **A single sentence at the top in their own words**, with the number in it:
  *"Med spas in Dallas that offer Botox and don't have online booking — **26 fit**."*
- **Then the list, immediately.** The list is the screen.
- Honesty stays, but as **one plain line**, not five chips:
  *"We couldn't tell on 38 — those are free and we never guess."* With a way to see them.
- **Cost appears where a choice is made** (unlocking / exporting), not above the results.
- The map, if it survives at all, is small, secondary, and collapsible. It is "where we
  looked", not the interface.

### 5.3 The business row — the atom of the product

This is where the value is, and today it is three grey lines. It must carry, in order:

1. **Name and town.** Big enough to read at a glance.
2. **Why it fits, in one plain sentence.** "No way to book online — we read 3 pages."
3. **How to reach them** — phone, email, website.
4. **The opening email, already written**, with one obvious **Copy** button.
5. A quiet way to see the evidence (what we read, and where) — available, not shouted.

Design both a **collapsed** and an **expanded** state. Collapsed should still show the
name, the reason and that an email is ready.

### 5.4 The "couldn't tell" group

Not an error and not a failure — a real answer we are not charging for. Needs its own
calm treatment: a count, one plain sentence saying why, and one next step. Never grey,
never styled like a disabled thing.

### 5.5 Empty and in-progress states

- **Reading in progress:** the user asked about a city we have not read yet. Show it
  arriving, business by business. Never a bare spinner. Say that they can close the tab.
- **Nothing found:** say what was checked and offer the next move. Never just "no results".

## 6 · Hard constraints — do not break these

1. **There is no Send button anywhere in this product, ever.** The last action is Copy or
   Export. A human sends every email. This is a promise we make publicly.
2. **Every claim about a business carries its evidence.** A reason with no source is a bug.
   Evidence is quoted in the serif face and always names where it came from.
3. **"Couldn't tell" is a first-class answer**, with its own colour and a next step. Never
   grey, never disabled, never shown as a bad score.
4. **Do not invent scores, tiers, percentages or star ratings.** The product gives a plain
   verdict — fits / doesn't / couldn't tell — and this is deliberate and unresolved at the
   product level. **Do not design a 0–100 score or an A/B/C tier even if it looks better.**
   If you think it is needed, say so in a note; do not put it in the design.
5. **One brand colour per screen** (the lure/chartreuse), on the single main action only.
   Verdict colours stay muted and never decorate.
6. **Numbers we computed are set in mono.** Words a business published are set in serif.
   Our own explanations are sans. Type says who is speaking.
7. **No fish puns, no nautical language, no water gradients, no emoji** anywhere near
   data, verdicts or evidence. The brand is literal where it matters.
8. **Mobile matters.** Every control at least 44×44. Text never under 12px. Fields never
   under 16px or iOS zooms the page and never zooms back.
9. **Disabled always says why, right next to it.**

## 7 · What to deliver

For each screen in §5: desktop (1440) and phone (390), in both the collapsed and expanded
state where it applies. Real copy, not lorem — if a label is wrong, the screen is wrong.

Name every colour, size and spacing value against the existing tokens below so it can be
built without guessing.

## 8 · Tokens already in use

| Token | Hex | Use |
|---|---|---|
| Shallows | `#EEF0EC` | App ground |
| Shallows raised | `#F6F7F4` | Sidebar, wells |
| Surface | `#FFFFFF` | Cards, tables |
| Fill | `#E3E6E0` | Tracks, selected nav |
| Line | `#D5D9D2` | Borders (strong `#B9BFB6`) |
| Deep ink | `#0E1520` | Text (2: `#36404C`, 3: `#5B6470`) |
| **Lure** | `#C8F03C` | The one brand colour, one use per screen. Hover `#B5DE28` |
| Lure text-safe | `#4A6508` | Because lure is never text on a light ground |
| Lure marker | `#E4F5A6` | Only ever behind quoted evidence |

Type: **Fraunces** (what a business said, headlines) · **IBM Plex Sans** (our words, UI) ·
**IBM Plex Mono** (anything we counted).

| Token | Size/line | Face |
|---|---|---|
| `h1` | 32/38 | Fraunces 500 |
| `h2` | 20/26 | Plex Sans 600 |
| `h3` | 15/21 | Plex Sans 600 |
| `evidence` | 17/25 | Fraunces 400 |
| `body` | 15/24 | Plex Sans 400 |
| `small` | 13/20 | Plex Sans 400 |
| `data` | 13/18 | Plex Mono 400/500 |

## 9 · The test to apply to every screen

> Show it to a plumber for ninety seconds. Can they say what it does, and point at the one
> thing they would do next?

If not, it has failed, however good it looks.
