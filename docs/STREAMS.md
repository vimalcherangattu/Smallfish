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

### Branches, and when a change goes to `main`

**`main` is production.** Every push deploys to getsmallfish.com in about two
minutes. There is no staging step, no approval gate, and at least one real
person is using the site. A branch push builds its own preview deployment,
which sits behind Vercel Authentication — the owner can open it, a session
cannot.

```
claude/gtm-<something>       GTM
claude/product-<something>   Product
```

That a session cannot see a preview is what sets the rule:

| Change | Where it goes |
|---|---|
| Anything a visitor sees — a screen, copy, pricing, the home page | Branch first. Hand the owner the preview URL and merge once they have looked. Merging it unseen means nobody looked at it, because you cannot. |
| Anything invisible and covered by tests — a bug fix, a refactor, engine work, a test | Straight to `main`, then **check production**. |

**Whoever pushes `main` verifies production afterwards.** A green build has
hidden a live defect twice in one day: `/account` answered a signed-out visitor
with 404, and the credit pill rendered milli-credits as credits. Both builds
were clean and both test suites were green. Fetch the URL.

**Never two sessions pushing `main` at once.** Rebase on `main` first, then run
`python3 stage0/tests/run_all.py` — after the rebase, because that run is the
only thing that knows whether the other stream broke you.

An earlier version of this file said simply "do not push `main` directly", and
`CLAUDE.md` said "work goes to `main`". They contradicted each other, and the
Product session followed the second one all through 2026-10-04. Both now say
the above.

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
