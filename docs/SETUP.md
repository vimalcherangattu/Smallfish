# Setup — every credential, where to get it, where to put it

Ten things to do. Each one says **where to click**, **what to copy**, **exactly
what to name it**, and **how to tell it worked**.

Dashboard menus move. Where a path might have been renamed, the thing you are
looking for is described as well as named.

**Order matters only in two places:** §2 must come before §3 (you cannot
register Clerk in Supabase before Clerk exists), and §9 comes last because it
verifies everything else.

---

## Where environment variables go

All of them go in **one place**: Vercel → your Small Fish project →
**Settings** → **Environment Variables**.

For each: paste the **Key** exactly as written here, paste the **Value**, tick
**Production**, **Preview** *and* **Development**, then **Save**.

Two rules that matter:

- **`NEXT_PUBLIC_` is not decoration.** Anything with that prefix is compiled
  into the JavaScript sent to every browser. Anything without it never leaves
  the server. Putting a secret key behind `NEXT_PUBLIC_` publishes it.
- **Changing a variable does not change the running site.** Vercel bakes them
  in at build time. After any change: **Deployments** → newest → **⋯** →
  **Redeploy**.

---

## 1 · Supabase — the database (already created)

The project exists. I created it and applied both migrations.

| | |
|---|---|
| Project name | **Small Fish** |
| Reference | `xdqptokitwdhfuotfpph` |
| Region | us-east-1 (N. Virginia) |
| Dashboard | https://supabase.com/dashboard/project/xdqptokitwdhfuotfpph |

### 1.1 Two variables you can set right now

```
Key:    NEXT_PUBLIC_SUPABASE_URL
Value:  https://xdqptokitwdhfuotfpph.supabase.co
```

```
Key:    NEXT_PUBLIC_SUPABASE_ANON_KEY
Value:  sb_publishable_QGev5OOW5t5taPGcQV6wnQ_aQXLdMO6
```

That second one is safe in a browser **by design**. It can read only what a
row-level policy allows, and the only public policy on this database is "a
suppression that has already taken effect". It cannot read an account, a
balance or a ledger line.

### 1.2 The one you must fetch yourself

Go to **Project settings** (gear, bottom left) → **API Keys**. Look for the key
marked **`service_role`** or **secret** — it will say *"This key has the ability
to bypass Row Level Security. Never share it publicly."*

Click to reveal, copy it.

```
Key:    SUPABASE_SERVICE_ROLE_KEY
Value:  (the service_role / secret key)
```

**No `NEXT_PUBLIC_` prefix.** This key bypasses every security policy in the
database. With it, anyone can read every customer's balance and write ledger
entries. It belongs on the server only, and it must never be committed.

> If you ever paste it somewhere public, rotate it on that same page. That
> invalidates the old one immediately.

**Verify §1:** after a redeploy, open `https://<your-domain>/api/suppressed`.
It should say `"source": "db"` instead of `"source": "static"`.

---

## 2 · Clerk — login

### 2.1 Create the application

1. Go to https://dashboard.clerk.com and sign up.
2. **Create application**.
3. Name it **Small Fish**.
4. Sign-in options: tick **Email** and **Google**. (Email alone is fine.
   Google roughly halves the drop-off at sign-up, and costs nothing here.)
5. **Create application**.

### 2.2 The two API keys

Clerk drops you on a quickstart page showing both. Otherwise:
**Configure** → **API Keys**.

```
Key:    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
Value:  pk_test_…  (or pk_live_… once you go live)
```

```
Key:    CLERK_SECRET_KEY
Value:  sk_test_…  (or sk_live_…)
```

The publishable one renders the sign-in box and is meant to be public. The
secret one verifies sessions on the server — no `NEXT_PUBLIC_` prefix, ever.

> `pk_test_`/`sk_test_` are the development instance. Real customers need the
> production instance, which requires a custom domain (§8). Use test keys until
> then; nothing else changes.

### 2.3 The webhook

This is how Small Fish learns a person signed up, so it can make them a
workspace and grant the free plan. Without it, someone signs in and has no
account.

1. **Configure** → **Webhooks** → **Add Endpoint**.
2. **Endpoint URL**: `https://<your-domain>/api/clerk/webhook`
3. **Subscribe to events** — tick exactly these two:
   - `user.created`
   - `user.deleted`
4. **Create**, then copy the **Signing Secret** (starts `whsec_`).

```
Key:    CLERK_WEBHOOK_SIGNING_SECRET
Value:  whsec_…
```

The signature is not optional. That endpoint is a public URL that creates
accounts; without verifying the signature, anyone who finds it can create them
too.

---

## 3 · Connect Clerk to Supabase — the step that is easy to miss

Clerk issues the login token. Supabase has to be told to trust it, or every
security policy denies everyone — including customers reading their own
balance. It fails **closed**, which is the right direction, but it will look
like a bug in the app rather than a missing setting.

### 3.1 In Clerk

**Configure** → **Integrations** (or **Connect with Supabase**) → enable
**Supabase**. Clerk shows you a **Clerk domain** like
`https://verb-noun-12.clerk.accounts.dev`. Copy it.

### 3.2 In Supabase

**Authentication** → **Sign In / Providers** → **Third-Party Auth** → **Add
provider** → **Clerk**. Paste the Clerk domain. Save.

**Verify §3:** sign in to the app once it is built (§10) and open your account
page. If it shows a balance, the joint works. If it says you have no workspace
while the database plainly has one, this step is the reason.

---

## 4 · Stripe — taking money

Everything about *what* to charge is built and tested. This is only the card
step.

### 4.1 Three prices

**Product catalogue** → **Add product**, three times. For each: **Recurring**,
**Monthly**.

| Product name | Price |
|---|---|
| Small Fish Starter | **$29.00** |
| Small Fish Growth | **$79.00** |
| Small Fish Agency | **$199.00** |

After saving each one, open it and copy the **Price ID** — it starts `price_`.
**Not** the product ID, which starts `prod_`. They look alike and only one
works.

```
Key:    STRIPE_PRICE_STARTER
Value:  price_…   (the $29 one)

Key:    STRIPE_PRICE_GROWTH
Value:  price_…   (the $79 one)

Key:    STRIPE_PRICE_AGENCY
Value:  price_…   (the $199 one)
```

### 4.2 The secret key

**Developers** → **API keys** → **Secret key** → **Reveal**.

```
Key:    STRIPE_SECRET_KEY
Value:  sk_test_…  (or sk_live_… when you switch off test mode)
```

### 4.3 The webhook

This is how a payment becomes credits. Without it, a customer is charged and
their balance never moves.

1. **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL**: `https://<your-domain>/api/stripe/webhook`
3. **Select events** — exactly these three:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `invoice.paid` *(this is the monthly renewal — without it, credits are
     granted once and never again)*
4. **Add endpoint**, then **Reveal** the **Signing secret**.

```
Key:    STRIPE_WEBHOOK_SECRET
Value:  whsec_…
```

> Keep everything in **test mode** until you have taken a test payment with
> card `4242 4242 4242 4242`, any future expiry, any CVC. Switching to live is
> re-copying six values from the same pages with the test toggle off.

---

## 5 · Anthropic — the engine

Without this, the four measured markets are frozen data and a customer pointing
Small Fish at a new city gets nothing.

1. https://console.anthropic.com → **Settings** → **API keys** → **Create key**.
2. Name it `smallfish-engine`.
3. Copy it — it is shown **once**.

```
Key:    ANTHROPIC_API_KEY
Value:  sk-ant-…
```

Set it in Vercel **and** in whatever machine runs the crawler.

Do **not** try the egress-credential route. It was measured on 2026-09-19 and
cannot work here: `api.anthropic.com` is on the proxy's `noProxy` list, so the
request never reaches the proxy and nothing can be injected into it. The full
measurement is in `CLAUDE.md`.

**Verify §5:**

```bash
python3 stage0/src/engine/preflight.py    # must print READY and exit 0
```

---

## 6 · Google Places — one console setting, no key needed

The key already exists and is valid. **Places API (New) is not enabled on
project `74590284143`.**

1. https://console.cloud.google.com → select project **74590284143**.
2. **APIs & Services** → **Library** → search **Places API (New)** → **Enable**.
3. **Billing** → confirm an active billing account is attached. The API returns
   `SERVICE_DISABLED` without one even after enabling.

**Verify §6:** `preflight.py` stops reporting Google as a blocker. This unblocks
**S0-04**, the cheapest remaining gate item — under $10 of Text Search, and the
one that can still invalidate the plan on cost grounds.

---

## 7 · The site URL

Without this the sitemap and `robots.txt` advertise the wrong host, and Clerk
and Stripe send people back to the wrong place after checkout.

```
Key:    NEXT_PUBLIC_SITE_URL
Value:  https://your-real-domain.com     (no trailing slash)
```

You own **getsmallfish.com** and it is deployed, so:

```
Key:    NEXT_PUBLIC_SITE_URL
Value:  https://www.getsmallfish.com
```

Set it anyway even though it is now the built-in default — the default is a
fallback, and a variable you can see in the dashboard is one you can change
without a code push.

---

## 8 · A domain and a real inbox

- ~~**A domain.**~~ Done — **getsmallfish.com**, live. The crawler's user
  agent, the sitemap, `robots.txt` and the opt-out page now all point at it.
- **A monitored inbox.** The opt-out page and the crawler's `/bot` page both
  name **`getsmallfish@gmail.com`**, which is real. Watch it: it is the address
  a business owner uses to get removed, and a removal route nobody reads is
  worse than not offering one. If you later want `opt-out@getsmallfish.com`,
  change it in `src/app/opt-out/page.tsx` **and** `src/app/bot/page.tsx` — a
  test fails if those two drift apart.
- **Terms and a privacy policy.** The opt-out page describes what is held and
  how to be removed, which is the substance of it, but it is not a privacy
  policy.

---

## 9 · Redeploy, then check the whole board

Environment variables are baked in at build time, so nothing above is live
until you redeploy.

**Vercel** → **Deployments** → newest → **⋯** → **Redeploy**.

Then open `https://<your-domain>/api/status`. It reports what is wired and what
is not, one line per credential, and is the fastest way to find the one you
missed. It reports **presence only** — never a key, a prefix or a length,
because a status page that helps you debug a key helps anyone else debug it
too.

It also tells you the next thing to set, and reminds you to redeploy, which is
the step that catches everyone at least once.

---

## 10 · What I do once you tell me

Tell me **which sections are done** and I will build against them. Each needs
its keys to be written correctly rather than guessed at, which is why they are
not written already.

| You finish | I build |
|---|---|
| §2 + §3 | Sign-up and sign-in, the `user.created` webhook, workspace creation, the free-plan grant |
| §4 | The Stripe session call, the webhook verification, monthly renewal granting credits |
| §5 | S1-22 — ICP read from the seller's own site |
| §6 | S0-04 — the Google coverage baseline |

---

## The short version

If you only want to charge a small hand-picked group as fast as possible:
**§1.2, §2, §3, §4, §7, §8** and skip the rest for now. Precision is proven on
one niche and you say so; design partners are exactly the audience for whom
that is honest and interesting.

The full argument for that, and what a *public* launch additionally needs
(labelling and ten customer interviews), is in `docs/LAUNCH-CHECKLIST.md`.
