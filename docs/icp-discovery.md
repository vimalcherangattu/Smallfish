# ICP discovery — for users who don't know what they're looking for

**Status:** design, not built. Tasks S1-22 to S1-26 in `PROJECT_PLAN.md`.

## Why this is missing, and why it matters

Every flow in the product document starts from a user who can already write
*"med spas in Dallas that offer Botox and don't have online booking."* That user knows
their vertical, their geography, and the exact website-visible gap their offer exploits.

The research describes someone else. The primary persona is *"one to three people, 6 to 18
months in business… learned the business from YouTube and Skool communities."* The
observed behaviour is *"scrapes 2,000 clinics, opens websites one by one, gives up after
40."* That is not someone refining a known ICP. That is someone still looking for one.

So the product's front door assumes the output of a process the buyer has not run. The
templates library helps — "AI receptionist prospects" is a guess at an ICP — but a
template is a fixed answer, not a way of arriving at your own.

There is a second reason to build it, which makes it much cheaper than it looks.

## This is GTM automation A2, pointed inward

The go-to-market plan already specifies exactly this capability:

> **A2 · Free-list builder.** *Infer the agency's niche and city from its site; run the
> matching Small Fish search; save the list and a proof sample.*

That is an ICP builder aimed outward at cold-email prospects. The onboarding flow is the
same machine aimed at the person who just signed up. **Build it once and it serves both**
— which also means the dogfood outbound engine and the onboarding experience improve
together, and the quality of one is visible in the other.

It also sharpens the pitch in a way nothing else does. A cold email that says *"we read
your site, here are the 38 businesses your offer fits, and the page that proves each
one"* is the product demonstrating itself on the recipient's own business.

## The flow

```
Doesn't know their ICP
   │
   ├─ 1. "What do you sell?"  ── paste your website URL (or describe it)
   │
   ├─ 2. Small Fish reads your site → what you sell, who you serve, what problem you fix
   │
   ├─ 3. "So your offer fits businesses that…"  → 3 candidate ICPs, each with
   │        a vertical, a geography and the observable gap
   │
   ├─ 4. Live match counts for all three, side by side, free
   │
   └─ 5. Pick one → it becomes a normal saved search, editable as chips
```

Step 5 is the important join: **ICP discovery does not create a parallel system.** It
produces exactly the criteria object the normal search box produces, so everything
downstream — proof, export, alerts, pricing — is unchanged.

### Step 2 — read the seller's own site

The same fetcher, the same extraction, pointed at the user instead of a prospect. What we
need from it:

| Extracted | Example | Used for |
|---|---|---|
| What they sell | "AI voice receptionist, 24/7 call answering" | The offer |
| Who they say they serve | "dental practices, med spas" | Candidate verticals |
| Problem language | "missed calls", "after-hours bookings" | The gap to look for |
| Existing case studies or logos | client names | Verticals that already worked |
| Geography | "serving Dallas–Fort Worth" | Default region |

### Step 3 — the inference that matters

This is the only genuinely new reasoning in the product, and it is worth naming precisely:

> **What must be observably true on a business's website for this seller's offer to be
> needed there?**

An AI receptionist is needed where calls go unanswered — observable as no online booking,
phone-only intake, no contact form, no chat. A website redesign is needed where the site
is dated — observable as no mobile viewport, a copyright year three years old, no service
pages. Scheduling software is needed where booking is manual — observable as "call to
book" language with no booking widget.

Two rules keep this honest, and both come from principles the product already holds:

1. **Only propose criteria the engine can actually prove.** The product document already
   refuses unprovable criteria at the confirm step ("revenue over $1M") and suggests a
   provable proxy. ICP discovery must refuse them *before* proposing them, or it will
   invent appealing ICPs the engine cannot deliver — which is worse than not offering
   the flow at all.
2. **Show the reasoning, not just the answer.** "Your offer fixes missed calls, so we
   looked for clinics with no online booking and no contact form" is checkable by the
   user. A bare list of criteria is not. This is principle 2 applied to the ICP itself.

### Step 4 — counts are the whole argument

Three candidate ICPs, three live counts, free, side by side:

| Candidate ICP | Region | Matches | Why this fits you |
|---|---|---|---|
| Dental practices, no online booking | Dallas 25mi | 212 | Your offer books appointments; these take bookings by phone only |
| Med spas, no online booking, no chat | Dallas 25mi | 143 | Higher ticket, same gap, no digital intake at all |
| Vet clinics, phone-only intake | Dallas 25mi | 88 | Adjacent vertical your case studies don't cover yet |

The counts do the persuading, and they cost nothing to show. This is the free match count
mechanic the product already has, used three times instead of once — so the acquisition
hook and the ICP flow are the same hook.

**Cost note.** Three counts is three samples, so roughly 3× the cost of one free count
(§ *Cost control* in the product document). The anonymous free-count limits must account
for this, or ICP discovery becomes the cheapest way to abuse the free tier. Suggested:
ICP discovery requires an account, and costs one of the logged-in daily free counts
rather than three.

### Step 5 — hand off to the normal product

The chosen ICP becomes the standard criteria object, on the normal confirm screen, with
the normal editable chips. The user can then change anything. Nothing about the rest of
the product needs to know ICP discovery exists.

## Where it appears

1. **Onboarding**, as the alternative to the search box: *"Not sure who to target? Start
   from what you sell."* This is the template-first onboarding the GTM plan describes,
   upgraded from picking a preset to deriving one.
2. **Empty state**, when a search returns almost nothing: *"That was a rare search. Here
   are three related ICPs with more matches."* This turns the rare-search warning from a
   dead end into a redirect.
3. **Dogfood outbound (A2)**, unchanged in purpose but now sharing an implementation.

## What this does not do

- It does not invent demand. If a seller's offer fits nothing observable, the honest
  answer is to say so and suggest what *would* be observable — not to manufacture an ICP.
- It does not replace the search box for users who know what they want. It is a second
  door, not a funnel everyone is pushed through.
- It does not profile individuals. Same boundary as the rest of the product: what a
  business publishes about itself, nothing about the people.

## Open questions

- Do users trust an ICP they did not write? The counts may carry it, or the flow may need
  the user to confirm each criterion before the count runs.
- Three candidates, or two? Three risks decision paralysis at exactly the moment we want
  momentum.
- Should a poor ICP result ("your best option is 40 matches") be shown honestly, or should
  the flow widen the region automatically until the number looks respectable? The first is
  on-brand and the second converts better. Recommend the first, and measure the cost.
- Does reading the seller's own site beat simply asking them two questions? Worth an A/B:
  the URL path is more magical, the questions path is more reliable when a site is thin —
  and §2 of the coverage report says ~40% of sites are hard to read, including,
  presumably, some of our users' own.
