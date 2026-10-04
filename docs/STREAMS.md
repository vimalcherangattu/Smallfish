# Two streams, one repository

From 2026-10-04 the work runs in two sessions that do not share context:

- **GTM** — the home page, landing pages, SEO surfaces, pricing copy, the doors
  into the product, and everything a stranger sees before they have an account.
- **Product** — the app at `/app`, the engine under `stage0/`, the API routes,
  billing, and everything a customer uses after they have one.

This file is the contract between them. It exists because the failure mode is
not a merge conflict — those are loud and take a minute to resolve. It is two
sessions quietly disagreeing about a number, and only the customer noticing.

---

## 1 · Who owns what

Ownership means **you may change this without asking the other stream.** It does
not mean nobody else may read it.

### GTM owns

| Path | What |
|---|---|
| `src/app/page.tsx` | The home page |
| `src/app/_handoff/` | The designer's ported HTML (`home.html`, `how-we-check.html`) |
| `public/handoff/` | The ported stylesheet and script that go with it |
| `stage0/src/site/port_handoff.py` | The one-command port of a new designer handoff |
| `src/app/{find,for,markets,compare,templates,why-it-exists,how-we-check,benchmark}/` | The SEO and proof surfaces |
| `src/app/{pricing,sample,waitlist,welcome,sign-up,sign-in}/` | The doors |
| `src/app/{bot,opt-out,privacy,terms}/` | The pages a crawled business lands on |
| `src/app/list/[token]/` | A shared list, read-only |
| `src/components/{MarketingChrome,HandoffPage,MarketProof,SampleForm,WaitlistForm,OptOutForm,ShareList,ReadTheRest,FreeCount,Fish}.tsx` | Marketing components |
| `src/lib/{doors,launch,site,showcase,seller,saturation}.ts` | Door context, attribution, marketing data |
| `src/app/globals.css` | The marketing stylesheet — see §3 |
| `src/app/{sitemap.ts,robots.ts}` | |
| `stage0/tests/{test_home_copy,test_seller,test_share,test_optout,check_motion}.mjs` | |

### Product owns

| Path | What |
|---|---|
| `src/app/app/` | The whole app |
| `src/app/account/` | Credits and plan |
| `src/app/api/` | Every route |
| `src/components/app/` | The App v2 components |
| `src/components/{ExportButton,PushToDestination,QueueRead,RecordRun,UploadList,IcpBuilder,MapPicker,Results,SearchConfirm,ReadProgress,UncontactButton,BuyPlan,NoAuth}.tsx` | App components |
| `public/app/kit.css` | The designer's App v2 stylesheet |
| `src/lib/` | Everything not listed as GTM's or shared |
| `stage0/src/{coverage,engine,benchmark}/` | The engine and the probe |
| `public/data/` | Measured data — **see §2, this one is shared in effect** |
| Most of `stage0/tests/` | |

### Neither owns — change needs both to agree

These are the seam. A change here is a change to something the other stream is
already saying out loud to a customer.

| Path | Why it is shared |
|---|---|
| `src/lib/pricing.ts` | `PLANS`, the bands, the scan budget. The home page promises the free grant; `/pricing` sells the tiers; the app's credit pill counts them. |
| `src/lib/unlock.ts` | `FREE_PREVIEW` — what a stranger sees without an account. The home page's offer and the app's cost bar are two halves of one sentence. |
| `src/lib/signals.ts` | The catalogue. `provable: false` is a refusal, and `/templates` publishes it. |
| `public/data/` | Regenerating it moves the app, `/find`, `/markets`, `/benchmark` and the home page's demo reel at once. |
| `src/app/layout.tsx` | The root layout and the three fonts. |
| `src/app/globals.css` — the `@theme` block and the `.sf-*` utilities (lines 484–584) | The design tokens, and the type/card/tap utilities eight `/app` pages still use. The other ~340 `.mkt` rules in that file are GTM's alone. |
| `package.json`, `vercel.json`, `next.config.mjs` | |
| `CLAUDE.md`, `PROJECT_PLAN.md` | |

---

## 2 · How the two stay in sync

`stage0/tests/test_contract.mjs` is the mechanism. It reads the **prerendered**
marketing HTML and checks it against the code the Product stream owns:

- every free-allowance claim on every marketing page equals `PLANS.free.credits`
- the home page's demo reel equals the current `public/data` tallies and
  website counts
- no marketing page sells a signal `signals.ts` marks `provable: false`,
  unless the refusal is in the same breath
- the site still says we never send, still offers an opt-out, and still claims
  total coverage nowhere

It fails loudly and names the pages to fix. Changing the free grant from 20 to
10 produces:

```
FAIL  and every one of them says 10, the number in PLANS:
      home: "20 businesses free" | home: "20 businesses free"
      | home: "first 20 are free" | howWeCheck: "20 businesses free"
```

which is the whole handoff: four strings, two files.

**If you change a shared value, run the suite and fix what it names.** Do not
change the test to match the copy; the test is pointing at a promise.

`public/data` has a second mechanism: regenerating it does **not** update the
home page's reel, because the reel was written by the port and the port only
runs when a new designer handoff arrives. `test_contract.mjs` catches the drift;
the fix is `python3 stage0/src/site/port_handoff.py <handoff>`.

---

## 3 · Where collisions actually happen, and what to do

Markdown table conflicts in `PROJECT_PLAN.md`'s decision log are **expected**
and resolved by keeping both rows. The log is deliberately not split: the
chronology of this project's reversals is one of the more useful things in it,
and fragmenting it to avoid a thirty-second conflict is a bad trade.

The ones worth avoiding:

- **`src/app/globals.css`** is 1,614 lines. 340 of them are `.mkt` rules, which
  are GTM's; the `.sf-*` utilities at 484–584 are the shared part, and eight
  `/app` pages still use them (`runs`, `contacted`, `upload`, `destinations`,
  `icp`, `explore`, `reads/[id]`, `runs/[id]`). App v2 itself draws from
  `public/app/kit.css` and needs nothing here. Product: add new utilities to
  the kit, not to globals. GTM: the `.mkt` rules are yours, the `.sf-*` block
  is not.
- **`public/data/`** — regenerate it in one stream at a time, and say so.
- **The root layout** — the fonts are loaded there by `next/font`; the app
  layout also links Google Fonts for the kit's literal family names. Do not
  "tidy" one into the other without checking both render.

### Both streams push to `main`

**`main` is production.** Every push deploys to getsmallfish.com in about two
minutes, with no staging step. That is the decision while the product is being
built — the owner's call on 2026-10-04 — and the condition attached to it is
**no conflicts**.

A branch push does build a preview, but it sits behind Vercel Authentication:
the owner can open it, a session cannot. So a branch is not a review step for a
session, it is a place where nobody looks. Branches exist for a spike
(`claude/gtm-<something>`, `claude/product-<something>`); they are not the
default.

Two sessions sharing one branch works if neither sits on work:

1. **The sequence, in this order** — commit first, because a rebase refuses a
   dirty tree:

   ```bash
   git add -A && git commit -m "..."      # commit FIRST — you cannot rebase with a dirty tree
   git fetch origin main
   git rebase origin/main                 # a conflict here is a stop, not a puzzle
   python3 stage0/tests/run_all.py        # AFTER the rebase, not before
   git push origin main
   curl -sI https://www.getsmallfish.com/...   # then check what you just shipped
   ```
   
   Do not pipe a git command into `tail` or `head` inside an `&&` chain. A
   pipeline's exit code is the **last** command's, so `git pull --rebase … | tail
   && git push` pushes even when the rebase failed. That is not hypothetical: it
   happened on the first use of this sequence, the rebase never ran, and only an
   empty upstream kept it from mattering.

   The suite runs **after** the rebase because that run is the only thing that
   knows whether the other stream broke you.
2. **A rebase conflict is a stop, not a puzzle.** You cannot see the other
   session's intent. Say what conflicted and leave it.
3. **Push small and often.** A long-lived pile of commits is what turns a rebase
   into a conflict.
4. **Whoever pushes checks production afterwards.** Fetch the URL. A green build
   has hidden a live defect twice in one day — `/account` answering a signed-out
   visitor with 404, and the credit pill rendering milli-credits as credits.
   Both suites were green and both builds were clean.

Git conflicts are not the only kind. `test_contract.mjs` catches the semantic
ones — marketing copy disagreeing with the code's numbers — which git cannot
see. That is §2.

**Say so in chat before pushing a change that moves the commercial offer** — a
price, the free allowance, a plan size — or that replaces a screen wholesale.
Not a gate, a heads-up before it is live to everyone. The price slab went from
"up to 300 for $29" to "up to 120" inside an hour on 2026-10-04 without one.

**History.** This file first said "never push `main` directly" while `CLAUDE.md`
said "work goes to `main`"; the two contradicted each other for a day. Then both
said branch-first for anything visitor-facing. Both now say the above. The
reversals are deliberate and recorded rather than quietly overwritten.

---

## 4 · Files that are not rendered anywhere

Nine components are imported by nothing. They are the residue of the
pre-App-v2 app and the pre-handoff marketing, and they are listed here because
a session can lose an hour improving a file no visitor will ever see.

| File | Was |
|---|---|
| `AppNav.tsx` | The old eight-item sidebar, replaced by `components/app/Shell.tsx` |
| `LeadList.tsx` | The old results list, replaced by `components/app/Results.tsx` |
| `SearchBox.tsx` | The old search input, replaced by the `.bigq` on first run |
| `Dots.tsx` | The old verdict dot field |
| `HeroSearch.tsx`, `School.tsx`, `Bubbles.tsx`, `Explainer.tsx`, `Motion.tsx` | The pre-handoff home page |

They are **not deleted** because `test_reachable.mjs` and `test_refund.mjs`
still reference some of them, and removing them is a change with its own
blast radius rather than a tidy-up. If you want them gone, do it as its own
commit with the suite green on both sides.

---

## 5 · Rules that outrank both streams

From `CLAUDE.md`, repeated here because they are the ones a split makes easy to
drop:

- **"every" is the one word this product cannot use.** 200 of 2,778 were read.
- **Absence needs positive proof.** Missing evidence is "couldn't tell", never
  "no".
- **Never blame the environment on the business.** Our proxy failures are ours,
  on screen and in the numbers.
- **Measure before trusting a number.** If you are about to write a figure into
  copy or a component, find where it is computed first.
- **Say so when a measurement contradicts a document**, and record the
  retraction. The decision log carries reversals already.
