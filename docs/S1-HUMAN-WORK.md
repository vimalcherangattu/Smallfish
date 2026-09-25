# S1 — the work only a person can do

Everything in Stage 1 that I cannot build is here, with what it is, why it
matters, what you actually do, and how long it takes. Ordered by what would
hurt most to skip.

Two things are **not** in this list because they are done: accounts and billing
(S1-08) and the whole product surface. This is what is left.

---

## The short version

| | What | Time | Blocks |
|---|---|---|---|
| **1** | Run one command on **30 September** | 2 minutes | S1-07's cost budget |
| **2** | Label 200 businesses by hand | 2 working days | Any cross-niche accuracy claim |
| **3** | Ten customer interviews | 5 hours | Knowing whether the price is right |
| **4** | Recruit 20 design partners (S1-12) | Ongoing | The honest first launch |
| **5** | Cold email at 50/day (S1-17) | Setup + daily | A channel that may not work |
| **6** | Community and creators (S1-18) | Ongoing | The rebalanced primary channel |
| **7** | Launch week (S1-19) | One week | Nothing — do it last |
| — | Google Sheets export (S1-06b) | Weeks of Google review | **My advice: skip** |

---

## 1 · The change-rate run — a date, not a task

**On 30 September**, one command:

```bash
python3 stage0/src/engine/change_rate.py --market dental-phoenix --compare --sample 60
```

The baseline was taken on 23 September. The seven-day gap *is* the
measurement — running it early measures our own noise floor, which is already
recorded (raw HTML 31.7%, judged signals 0.0%).

**Why it matters.** It is the missing number in S0-23, and every alert budget in
`src/lib/alerts.ts` is derived from it. Right now `WEEKLY_CHANGE_RATE` is a
placeholder of 5% — deliberately pessimistic, flagged as unmeasured in three
places, and every budget the code returns carries `measured: false`. One
measured number replaces all of them.

**What you do with it:** tell me the figure and I will set the constant, flip
`CHANGE_RATE_MEASURED`, and record it in the plan.

---

## 2 · Labelling — 200 businesses, and the only way to claim precision

Today precision is **100%, lower bound 91.4%, on dental only.** `preflight.py`
calls the label set *THIN*. Until med spa and HVAC are labelled:

- The Stage 0 gate is proven on one niche of three.
- `/benchmark` says so, publicly, and should keep saying so.
- **You cannot honestly buy traffic against an accuracy claim.**

```bash
python3 stage0/src/benchmark/labelling_set.py --market med-spa-dallas --n 100
python3 stage0/src/benchmark/labelling_set.py --market hvac-tampa --n 100
```

**The `--seed` must match the seed the benchmark run used**, or the labelled
slice and the judged slice are different businesses and the score means nothing.
The default matches; only change it if you changed it on the run.

The task file withholds the engine's verdict. That is deliberate — a labeller
who can see "the engine said match" agrees with it more often, which inflates
the exact number the gate exists to measure.

**How long:** the dental set took roughly a working day for 70. Budget two days
for 200, and do them on different days — fatigue produces agreement, and
agreement is the failure mode.

**Verify:** `python3 stage0/src/benchmark/score.py --market med-spa-dallas`

---

## 3 · Ten customer interviews — the number nobody has

The `$0.04 cost-per-match` gate was retired because **its numerator was an
assumption**. Nobody knows what a buyer pays per matched lead. The band design
is sound arithmetic on top of a price that has never been tested on a human.

**The question, from the pricing decision:**

> *What do you pay per usable lead today, and what would you pay per proven
> match?*

Anchors to have ready: about $2 a lead from a freelancer, $200–500 a month for
an SDR agency.

**What would change the product:**

- If buyers say **more than $0.18 per matched lead**, plain pay-per-match clears
  cost in the worst niche and the bands become a bonus rather than a necessity.
- If the band visibly kills trials at the confirm screen, the fallback is a flat
  rate priced against the worst niche.

Both are written down as falsifiers in `docs/PRICING.md` §6. Ten conversations,
about half an hour each.

**Ask them in rupees or dollars?** Worth deciding deliberately — see the
currency question in the decision log. If Small Fish charges in INR, the whole
pricing model needs restating in INR and the solvency numbers redone.

---

## 4 · S1-12 — twenty design partners

The honest first launch. *"Proven on dental, measuring the rest in public"* is a
good pitch to a small hand-picked audience and a bad one to a cold market — so
this comes before any paid acquisition, not after.

**What you do:** twenty people you can name, who have the problem, who will
answer a message. Agencies and freelancers doing local lead gen; the research
describes a buyer who cannot yet name their own vertical, which is what the ICP
flow exists for.

**What to give them:** a real account, credits on the house, and your phone
number. What you want back is not money — it is the sentence they use to
describe what it does, which is the copy you do not have yet.

---

## 5 · S1-17 — cold email at 50/day

Planned against a **1.5% positive reply rate**, which is the number to hold it
to. 50/day for a month is ~1,000 sends and ~15 positive replies if the plan is
right.

**What it needs before a single send:**

- A **separate domain** for sending. Never the one the product runs on — a
  deliverability problem on `getsmallfish.com` would take the site's mail down
  with it.
- **Two to four weeks of warmup** before volume.
- SPF, DKIM and DMARC on the sending domain.
- Deliverability monitoring, checked weekly.

**And the awkward one.** This product's whole argument is that it does not send
email on your behalf and honours removal requests within seven days. Cold
emailing at volume from the same company is not a contradiction — but it does
mean the standard you hold yourself to has to be the one the opt-out page
describes, or the first person who notices will say so publicly and be right.

---

## 6 · S1-18 — community and creators

The GTM plan rebalanced this to the **primary** channel, ahead of cold email.
The reason holds: the interesting thing here is the method, not the product, and
the method is something people will discuss.

**The asset you already have** is `/benchmark` — measured precision, recall,
couldn't-tell and cost, including the numbers that undercut the headline. Very
few tools in this space publish anything comparable.

---

## 7 · S1-19 — launch week

Product Hunt, Show HN, the waitlist.

**Show HN should be on the benchmark method, not the product.** The method is
the interesting part and the one that survives scrutiny; a "find leads" post
does not. Title it something like *what it costs to check 1,000 small business
websites and be honest about the ones you cannot judge*, and let the product be
a link at the bottom.

**Do this last.** It is the one item that is genuinely harder to repeat, and
doing it before items 2 and 3 means launching on a one-niche precision claim in
front of an audience that reads footnotes.

---

## The one I would skip: S1-06b, Google Sheets export

Export straight into a Google Sheet instead of downloading a CSV.

**The duplicate-protection half is already built and shipped.** Every exported
row carries `first_exported` and `new_to_you`, and it *marks* rather than drops
— a customer may be re-exporting on purpose, and an export that silently
returns fewer rows than the screen showed is how people stop trusting exports.

**What the Sheets half would cost you:** Sheets and Drive are Google **sensitive
scopes**. That means a verification review — a security questionnaire, a demo
video, and typically weeks of waiting — to save a customer one drag-and-drop of
a file they already have.

My advice is to leave it until a customer asks for it by name. If one does, it
is a day's work plus the review.

---

## What happens when you finish each one

| You finish | I do |
|---|---|
| The 30 Sep run | Set the real change rate, flip the measured flag, size the alert budgets |
| Labelling | Re-score, update `/benchmark` — it regenerates from `PROJECT_PLAN.md`, so the public page updates with the plan |
| Interviews | Adjust `docs/PRICING.md` if the answers falsify the band design, and say so in the decision log |
| Design partners | Whatever they tell you is missing |

Tell me the numbers rather than the conclusions — I would rather record what was
measured and let it contradict the plan than be handed a summary that agrees
with it.
