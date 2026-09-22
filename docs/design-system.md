# Small Fish design system — working reference

**Source of record:** `docs/design/small-fish-design-system-v1.pdf` (v1.0, 13 pages,
"Account Finder PRD v3", Sept 2026). The PDF is the authority on anything visual; this
file exists because a 13 MB PDF cannot be grepped, diffed, or checked against a screen
during a build. **Where the two disagree, the PDF wins and this file is wrong and should
be fixed.**

Read §5 before building any customer-facing screen. It is the part that will cost time if
skipped: the design system describes a product shaped differently from the one in the
repo today, and that gap is unresolved.

---

## 1 · The six principles

Straight from the PDF, which derives them from the PRD's own principles. Each is a rule a
screen can be checked against, not a sentiment.

| | Principle | The checkable rule |
|---|---|---|
| **P1** | **Evidence is the interface** | Every number decomposes on screen into per-dimension bars, each with the sentence it came from and the page it was found on. **A score shown alone is a bug.** |
| **P2** | **Pending is a real answer** | Pending has its own colour (brass), its own reason codes and a next step. Never grey, never disabled, never shown as a low score. |
| **P3** | **The model judges, the arithmetic is ours** | Anything computed — scores, weights, counts, deltas — is set in mono. Moving a weight re-ranks instantly and says so: "no credits used". |
| **P4** | **Stream, never spin** | Runs arrive account by account while you watch pages being read. No full-screen spinners. Runs survive a closed tab, and the UI says so. |
| **P5** | **It stops at drafted** | **There is no Send button anywhere in the product.** The terminal action is Export. A human approves every email. |
| **P6** | **Twelve read well beats six hundred listed** | Density is for reading, not scanning. Fewer rows, more reasoning. |

## 2 · Typography — three voices

Type says who is speaking, so a quoted fact is distinguishable from our reasoning without
a label.

| Voice | Face | Used for |
|---|---|---|
| **The product speaks** | IBM Plex Sans 400 / 500 / 600 | UI chrome, labels, our explanations, buttons |
| **The account speaks** | Fraunces | Quoted evidence, hooks, editorial headlines. **Evidence is always serif and always carries a source.** |
| **The arithmetic speaks** | IBM Plex Mono | Scores, weights, counts, deltas, sources, timestamps — anything deterministic we computed |

| Token | Size/line | Face |
|---|---|---|
| `display` | 52/55 | Fraunces 500 — onboarding moments |
| `h1` | 32/38 | Fraunces 500 — page titles |
| `h2` | 20/26 | Plex Sans 600 — section heads |
| `h3` | 15/21 | Plex Sans 600 — rows, cards |
| `evidence` | 17/25 | Fraunces 400 — quoted text |
| `body` | 15/24 | Plex Sans 400 — default |
| `small` | 13/20 | Plex Sans 400 — secondary |
| `data` | 13/18 | Plex Mono 400/500 — numbers, sources |

## 3 · Colour — cool paper, deep ink, one lure

| Token | Hex | Use |
|---|---|---|
| Shallows | `#EEF0EC` | App ground |
| Shallows, raised | `#F6F7F4` | Sidebar, wells |
| Surface | `#FFFFFF` | Cards, tables |
| Fill | `#E3E6E0` | Tracks, selected nav |
| Line | `#D5D9D2` | Borders (strong: `#B9BFB6`) |
| Deep ink | `#0E1520` | Text, primary (2: `#36404C`, 3: `#5B6470`) |
| **Lure** | `#C8F03C` | The only brand colour. Logo eye, the one main action, A-tier. Hover `#B5DE28`. |
| Lure, text-safe twin | `#4A6508` | Because **lure is never text on light grounds** |
| Lure marker | `#E4F5A6` | **Only ever behind quoted evidence** |

**Lure appears once per screen.** Verdict colours stay muted — kelp (fit), brass (pending),
slate (not a fit) — and never decorate. *(Exact verdict hexes are not in the extractable
text; take them from the PDF before implementing.)*

## 4 · Components and rules worth not rediscovering

- **Dimension row is the atom of explainability.** Name · 0–5 pips · score and weight
  (mono) · quote (serif, marker) · source (mono, links to the live page). Pending state:
  ochre pips, conflicting sentences shown **side by side, never averaged**.
- **Fitproof** is the name of the verdict artifact: score, tier, verdict, bars, one hook.
  It is the unit that travels into the CRM as a note plus a link back to its evidence.
- **The hook is the product, the email is a courtesy.** One concrete, checkable detail
  with its source sentence, in serif so it reads as the account's own words. Hook quality
  states: *Specific* / *Near-duplicate* / *From a change*.
- **Streaming rows have four states** — queued → reading → scoring → done. The row shows
  what is happening; never a bare spinner.
- **Disabled always says why, right beside it.**
- **Empty states report what was checked**, never just "no results". The canonical one:
  *"Quiet water this week — we re-read 146 watched accounts. None changed in ways your
  rubric cares about. That's a real result."*
- **Pending groups** carry a count, a reason in plain words, and one next step.
- **Account status is seven states, no more**: New, Reviewed, Shortlisted, Watching,
  Exported, In HubSpot, Suppressed. Once exported, the CRM is the system of record —
  there are no deal stages here.
- **Brand voice in the UI:** buttons and navigation stay literal (Export, Watchlist,
  Runs). No "reel in", "cast a net", no fish emoji, no water gradients. **Nothing fishy
  near scores, verdicts or evidence — data stays plain so it stays trusted.**

## 5 · Where this diverges from what is built — UNRESOLVED

This is the part to read before building. The design system is not a reskin of the app in
`src/`; it describes a **differently shaped product**, and it cites an **"Account Finder
PRD v3"** that is not among the three founding documents in `CLAUDE.md`. Nobody has
decided which is current.

| Design system | What is built today |
|---|---|
| **Scores 0–100, tiers A/B/C, five weighted dimensions** you can re-rank | **Binary criteria verdicts** — match / no match / couldn't tell, per criterion, no weighting |
| **One "Pending"** with reason codes and a next step | **Six verdicts** — `couldnt_tell`, `blocked`, `needs_model`, `unread` split apart deliberately (S0-27, S0-31), each measured separately |
| **Research credits + watched accounts** | **Pay per match**, nothing else billable |
| **Onboarding: paste your site + 3–5 customers you already like** → propose a rubric | **ICP flow: describe what you sell** → propose criteria (S1-23 – S1-26) |
| **Runs, Watchlist, Rubric, Exports, Integrations, Agency workspaces** | One screen: map, criteria, results, CSV export |
| **Weekly digest of accounts that changed**, with fresh hooks | Not built (S1-07) |
| Fraunces / IBM Plex Sans / Plex Mono, chartreuse + ink | Different tokens entirely |

Three notes on the gap, because it is not all bad news:

1. **The principles survive the difference.** P1 (evidence is the interface), P2 (pending
   is a real answer) and P5 (it stops at drafted) are the same commitments the engine
   already enforces — the absence-proof rule, the six honest verdicts, and outreach that
   refuses to write without evidence. The visual language can be adopted without
   resolving the product-shape question.
2. **The onboarding idea in the PDF is better than the one built.** Deriving a rubric
   from customers the seller *already has* is a stronger signal than asking them to
   describe what they sell, and it sidesteps the blocked S1-22. Worth stealing regardless
   of the rest.
3. **Scores vs. verdicts is a real fork, not a detail.** A 0–100 score with weights is a
   different promise from "match, and here is the proof". `PROJECT_PLAN.md` gate item 2
   measures *precision of a verdict*; there is no equivalent measurement for a score.
   Adopting scores would change what Stage 0 is proving.

**Do not resolve this by picking one silently.** It needs a decision and a Decision log
entry in `PROJECT_PLAN.md`, and probably sight of PRD v3.

---

## 6 · The home page — `docs/design/home-page.html`

A composed home page in the design system's visual language, added 2026-09-22. Kept as
the decoded 73 KB page rather than the 1.3 MB bundle it arrived in; the bundle was a
React artifact with the page held as a JSON-escaped string.

**Adopt freely — this is settled ground.** The tokens match §2 and §3 exactly (Fraunces /
IBM Plex Sans / IBM Plex Mono; `#0E1520` ink, `#C8F03C` lure, the warm-grey paper ramp),
so nothing here reopens the type or colour questions. The voice is worth keeping too, and
three lines of it are the product's actual commitments rather than marketing:

- *"It stops at drafted. It never sends."* — P5, and exactly what `src/lib/outreach.ts`
  enforces today.
- *"180 we refused to guess about — each with the reason why."* — P2. The engine already
  does this and measures it.
- *"cite the sentence"* — P1, and the proof validator already guarantees it verbatim.

**Do not adopt without a decision — this is §5's unresolved divergence, made concrete.**
The page is built around the product shape the repo does *not* implement:

| The page shows | What the engine produces |
|---|---|
| `{{score}}` and `{{tier}}` per account, "SCORE IT" in the ticker | Binary verdicts — match / no match / couldn't tell. **There is no score.** |
| *"Move a weight. Everything re-ranks in the browser"* | No weights, no dimensions, nothing to re-rank |
| *"Two meters. Accounts researched, accounts watched."* | Pay per match; no credits, no watchlist |
| *"We re-read what you watch"*, a 16 Aug → 16 Sep diff | S1-07 not built, and the weekly change rate (S0-20) is still unmeasured |
| *"A new market needs no code"*, six verticals in the ticker | Four benchmark markets, one of which (HVAC) fails the coverage gate |

Shipping this page as-is would promise scores the engine cannot compute and alerts that do
not exist. That is the one thing this product cannot afford to do: every principle here
rests on not claiming more than the evidence supports, and the home page is where a claim
is loudest.

**So the split is:** take the visual language, the layout and the voice now; treat the
score/tier/weight surface as a **proposal for the product shape**, to be decided
alongside §5 rather than absorbed through a stylesheet. If scores are adopted, that is a
plan-level decision with a decision-log entry, not a design import.
