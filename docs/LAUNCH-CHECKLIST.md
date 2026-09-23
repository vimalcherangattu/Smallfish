# What you need to do for launch

Everything in this list is something **only you can do** — a credential, a
payment account, a human judgement, or a wait. Everything that could be built
without them is built.

Ordered so that each item unblocks the ones under it. Verification is given for
each, because "I added the key" and "the key works" are different states and
this project has been caught by the gap before.

---

## 0 · Redeploy first, before anything else

Your deployment at `smallfish-eta.vercel.app` is **behind `main`**. The fish, the
bubbles, the sitemap and the last three days of product work are not on it.

**Do:** trigger a redeploy from Vercel, or push any commit.

**Also set one environment variable now**, or the sitemap and `robots.txt` will
advertise the wrong host:

```
NEXT_PUBLIC_SITE_URL = https://your-real-domain.com
```

**Verify:** `curl https://<your-domain>/sitemap.xml` lists seven URLs, and the
home page shows the outline fish at the right of the headline.

---

## 1 · The Anthropic key — the single blocker on the engine

This is the **only** thing `preflight.py` still reports. Without it no new market
can be read or judged: the four measured markets are frozen data, and a customer
pointing Small Fish at a new city gets nothing.

**Do:** set `ANTHROPIC_API_KEY` as a plain environment variable, both in the
Vercel project and in whatever environment runs the crawler.

Do **not** try the egress-credential route. It was measured on 2026-09-19 and it
cannot work here: `api.anthropic.com` is on the proxy's `noProxy` list, so the
request never reaches the proxy and nothing can be injected into it. The full
measurement is in `CLAUDE.md`.

**Verify:**

```bash
python3 stage0/src/engine/preflight.py    # must print READY and exit 0
```

**Then the first real run**, which is also the thing that proves the engine end
to end on a market nobody has read:

```bash
python3 stage0/src/benchmark/run.py --market med-spa-dallas
python3 stage0/src/coverage/export_app_data.py   # regenerate public/data
```

> Budget note: the three measured markets cost $7.63, $6.60 and $6.08. A new
> market of the same size is about $7. The harness aborts above a 2% error rate
> before reporting or writing anything, so a bad run cannot poison the data.

---

## 2 · Stripe — the only thing between you and taking money

Every pricing rule is built and tested: banded charging, refunds, the
quarter-credit unlock, the 12-month re-unlock, rollover, the read allowance.
**The card step is the one piece left**, and it needs real keys to be written
against rather than guessed at.

**Do, in the Stripe dashboard:**

1. Create three recurring products and prices:
   - Starter — **$29/month**
   - Growth — **$79/month**
   - Agency — **$199/month**
2. Copy each **price ID** (`price_…`, not the product ID).
3. Add a webhook endpoint at `https://<your-domain>/api/stripe/webhook`,
   subscribing to `checkout.session.completed` and
   `customer.subscription.deleted`. Copy the signing secret.

**Then set five environment variables:**

```
STRIPE_SECRET_KEY        sk_live_… (or sk_test_… while you try it)
STRIPE_WEBHOOK_SECRET    whsec_…
STRIPE_PRICE_STARTER     price_…
STRIPE_PRICE_GROWTH      price_…
STRIPE_PRICE_AGENCY      price_…
```

**Verify:** `startCheckout` stops naming missing credentials. It will still
refuse, with *"the Stripe session call is not written yet"* — that is correct
and deliberate. **Tell me when the keys are in and I will write the session call
and the webhook verification against them.** A checkout written against no key
compiles, looks finished, and has never once run.

---

## 3 · The weekly change rate — a date, not a task

**On 2026-09-30**, one command. The baseline was taken on 2026-09-23 and the
seven-day gap is the measurement.

```bash
python3 stage0/src/engine/change_rate.py --market dental-phoenix --compare --sample 60
```

This unblocks **S0-23** (what alerts cost) and therefore **S1-07** (saved
searches and alerts), which is the only unbuilt feature in the product.

Do not run it early. A same-day run measures our own noise floor, not change —
that is already recorded: raw HTML 31.7%, judged signals 0.0%.

---

## 4 · Labelling — 2 × 100 businesses, and the only way to claim precision

Today precision is **100% with a lower bound of 91.4%, on dental only.**
`preflight.py` calls the label set *THIN*. Until med spa and HVAC are labelled:

- Gate item 2 is proven on one niche of three.
- The benchmark page and any public precision claim rest on that one niche.
- You cannot honestly buy traffic against an accuracy claim.

**Do:** label 100 businesses each for `med-spa-dallas` and `hvac-tampa`.

```bash
python3 stage0/src/benchmark/labelling_set.py --market med-spa-dallas --n 100
```

**The `--seed` must match the seed the benchmark run used**, or the labelled
slice and the judged slice are different businesses and the score means
nothing. The default matches; only change it if you changed it on the run.

It produces a task file with the engine's verdict **withheld**. That is
deliberate — a labeller who can see "the engine said match" agrees with it more
often, which inflates the precision the gate exists to measure.

**How long:** the dental set took roughly a working day for 70.

**Verify:**

```bash
python3 stage0/src/benchmark/score.py --market med-spa-dallas
```

---

## 5 · Ten customer interviews — the number nobody has

The `$0.04 cost-per-match` gate was retired because **its numerator was an
assumption**: nobody knows what a buyer pays per matched lead. The band design
is sound arithmetic on top of a price that has never been tested on a human.

**Do:** ten conversations. The lead question, from the pricing decision:

> *What do you pay per usable lead today, and what would you pay per proven
> match?*

Anchors to have ready: ~$2 a lead from a freelancer, $200–500 a month for an SDR
agency.

**What would change the product:** if buyers say they would pay **more than
$0.18 per matched lead**, plain pay-per-match clears cost in the worst niche and
the bands become a bonus rather than a necessity. If the band visibly kills
trials at the confirm screen, the fallback is a flat rate priced against the
worst niche. Both are written down as falsifiers in `docs/PRICING.md` §6.

---

## 6 · The things a real company needs

- **A domain.** `opt-out@smallfish.example` on the opt-out page is a
  placeholder and must become a real, monitored inbox before anyone sees it.
- **Terms and a privacy policy.** The opt-out page describes what you hold and
  how to be removed, which is the substance; it is not a privacy policy.
- **A support address** on the pricing page.

---

## 7 · Go-to-market — the four items I cannot do at all

| | What it is | Note |
|---|---|---|
| **S1-12** | 20 design partners, recruited and active | The honest first launch. "Proven on dental, measuring the rest in public" is a good pitch to a small hand-picked audience |
| **S1-17** | Cold email at 50/day | Needs domains, warmup and deliverability monitoring. Planned against a 1.5% positive reply rate |
| **S1-18** | Community and creator programme | The rebalanced primary channel |
| **S1-19** | Launch week — Product Hunt, Show HN | Show HN should be **on the benchmark method**, not the product. The method is the interesting part and the one that survives scrutiny |

---

## The shortest path to revenue

You do **not** need all of the above to charge someone.

**Design-partner launch — needs items 0, 1, 2 and 6 only.**

With the Anthropic key, Stripe, a domain and a redeploy, you can charge a small
hand-picked group. Precision is proven on one niche and you say so; design
partners are exactly the audience for whom that is honest and interesting.

**Public launch — adds items 4 and 5.**

Buying traffic or publishing a cross-niche accuracy claim needs the labelling
and the interviews. That is what the Stage 0 gate protects, and the plan is
explicit that it guards *acquisition spend*, not building.

---

## What is built and waiting

So you know what these unlock rather than taking it on trust:

- Search, criteria confirmation and refusals · map region picker · free match
  count with its sample · results with proof · published contacts with
  provenance · CSV export with proof columns and duplicate protection · outreach
  drafts that refuse without evidence · ICP discovery · the full credit ledger ·
  opt-out and suppression · event instrumentation · marketing site, pricing,
  comparison and programmatic pages · sitemap and robots.
- 28 test files, run with `python3 stage0/tests/run_all.py`.
