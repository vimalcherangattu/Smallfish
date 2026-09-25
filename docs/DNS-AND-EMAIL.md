# Moving DNS to Cloudflare, and getting `@getsmallfish.com` email

Two jobs in one migration: DNS moves from Vercel to Cloudflare, and Cloudflare
Email Routing then forwards `opt-out@` and `hello@` into the Gmail you already
read. Email Routing is free and needs Cloudflare to be the nameserver, which is
the only reason the DNS has to move at all.

**This touches a live domain.** The site, sign-in, Google's branding
verification and Clerk's email sending all ride on these records. Work through
it in order, and don't change nameservers until §2 is complete.

---

## 0 · What is there right now

Captured 2026-09-25 by resolving each name against Google Public DNS. Cloudflare
will scan and import most of this automatically — **check its list against this
one**, because the importer misses records and a missing Clerk CNAME breaks
sign-in with no obvious symptom.

| Name | Type | Value | What breaks without it |
|---|---|---|---|
| `@` | A | Vercel — see §2.1 | The website |
| `www` | A | Vercel — see §2.1 | The website |
| `@` | TXT | `google-site-verification=G0RJNx2OZsnoV_3moSKtFbp1rrT6_wOSolOv4iMQlss` | Google OAuth branding verification, which you just fixed |
| `@` | CAA | `0 issue "pki.goog"` | — |
| `@` | CAA | `0 issue "sectigo.com"` | — |
| `@` | CAA | `0 issue "letsencrypt.org"` | — |
| `clerk` | CNAME | `frontend-api.clerk.services` | **Sign-in. Everything.** |
| `accounts` | CNAME | `accounts.clerk.services` | The hosted account pages |
| `clkmail` | CNAME | `mail.2ynorn9qlq0s.clerk.services` | Clerk's email delivery |
| `clk._domainkey` | CNAME | `dkim1.2ynorn9qlq0s.clerk.services` | DKIM — Clerk's mail lands in spam |
| `clk2._domainkey` | CNAME | `dkim2.2ynorn9qlq0s.clerk.services` | DKIM, second key |
| `pay` | CNAME | `hosted-checkout.stripecdn.com` | Stripe's checkout on our own domain |
| `_acme-challenge.pay` | TXT | `FJlCRAvtgQunf6ivQ9VmfQKBquMyBFa3rRhrZUCSdAE` | Stripe's certificate — keep it, renewals re-check it |

The three CAA records matter more than they look: they are an allow-list of
which certificate authorities may issue for this domain. Drop one and a
renewal can fail weeks later, which is a hard outage to trace back to a DNS
migration. Carry all three across exactly.

**And CAA is inherited by every subdomain.** Anything that needs its own
certificate — `pay` for Stripe, `clerk` for Clerk — has to come from a CA on
that list. The symptom when it does not is not an error about CAA: it is a
verification that sits on "verifying" indefinitely while the DNS looks
perfect. If a new subdomain's certificate never issues, check CAA before
anything else.

### There is a wildcard, and it is the thing that broke Clerk

`mail.getsmallfish.com`, `send.getsmallfish.com` and
`_dmarc.getsmallfish.com` all resolve to Vercel's IPs, and none of them is a
record anybody created. That means a **wildcard `*` A record pointing at
Vercel**.

That is exactly why `clerk.getsmallfish.com` answered with Vercel's addresses
before the CNAME existed, and why the TLS handshake failed: the wildcard
answered for a hostname Vercel had no certificate for, so it looked configured
while being broken.

**Do not recreate the wildcard on Cloudflare.** Nothing needs it, and it turns
every future "why is this subdomain not working" into the same half-hour. If
something later does need one, add it deliberately and write down why.

---

## 1 · Create the Cloudflare zone

1. Sign up at https://dash.cloudflare.com — free plan.
2. **Add a site** → `getsmallfish.com` → **Free**.
3. Cloudflare scans your existing DNS and shows what it found.

---

## 2 · Fix the records before switching nameservers

This is the whole job. Once nameservers change, whatever is in Cloudflare is
the truth, so it has to be right first.

### 2.1 The website records — get these from Vercel, not from here

Do **not** copy the IP addresses in §0. They are what Vercel's anycast network
answered with today and they are not a contract.

In Vercel → your project → **Settings → Domains**, Vercel shows the exact
records to use when a domain is on external nameservers. Typically:

| Name | Type | Value |
|---|---|---|
| `@` | A | the address Vercel shows |
| `www` | CNAME | `cname.vercel-dns.com` |

Use whatever that page says on the day.

### 2.2 Everything else

Add each row from §0 that Cloudflare's scan missed: the Google verification
TXT, the three CAA records, and all five Clerk CNAMEs.

### 2.3 The one setting that will break everything

Cloudflare shows an **orange cloud** (Proxied) or a **grey cloud** (DNS only)
next to each record.

> **Set every record to DNS only — grey cloud.**

Proxying puts Cloudflare's own TLS termination in front of the record. Vercel
already terminates TLS and manages its own certificate, and Clerk explicitly
requires DNS-only for its frontend API. Orange-clouding either produces
redirect loops or certificate errors that look nothing like a DNS problem.

Cloudflare defaults A and CNAME records to **proxied**. Check every one.

---

## 3 · Switch the nameservers

Cloudflare gives you two nameservers, something like `xyz.ns.cloudflare.com`.

The domain is registered with Vercel, so: Vercel → **Domains** → `getsmallfish.com`
→ nameserver settings → switch from Vercel's to Cloudflare's two.

Propagation is usually under an hour. Cloudflare emails when the zone is active.

**During the switch the site stays up**, because both sets of nameservers serve
the same answers — provided §2 was done properly. That is what §2 is for.

---

## 4 · Verify before touching email

Run these from your machine. All four must pass before going further.

```bash
# the site
curl -s -o /dev/null -w "%{http_code}\n" https://www.getsmallfish.com

# sign-in — the one that breaks silently
curl -s https://clerk.getsmallfish.com/.well-known/jwks.json | head -c 80

# Google's branding verification
dig +short TXT getsmallfish.com | grep google-site-verification

# certificate authority allow-list
dig +short CAA getsmallfish.com
```

Expect `200`, a `{"keys":[...` , the verification string, and three CAA lines.

If the JWKS call fails, it is almost certainly a proxied (orange) Clerk record.
Go back to §2.3.

---

## 5 · Email Routing

Now the part this was all for.

1. Cloudflare dashboard → your domain → **Email** → **Email Routing** → **Get
   started**.
2. Cloudflare adds the MX records and an SPF TXT record itself. Accept them.
3. **Destination address**: `getsmallfish@gmail.com`. Cloudflare sends a
   verification email — click the link in it.
4. **Custom addresses** → create these, all forwarding to the destination:

   | Address | Why |
   |---|---|
   | `opt-out@getsmallfish.com` | The removal route on the opt-out page. This one is a promise. |
   | `hello@getsmallfish.com` | General contact |
   | `support@getsmallfish.com` | On the pricing page |

   A **catch-all** is also worth enabling — it costs nothing and means a
   business owner who guesses `privacy@` or `remove@` still reaches you. For
   this product that is the right trade: a removal request bouncing is worse
   than some spam.

### Replying as the domain

Forwarding only handles incoming. To reply *from* `opt-out@getsmallfish.com`:

Gmail → **Settings** → **Accounts and Import** → **Send mail as** → **Add
another email address** → `opt-out@getsmallfish.com`. Gmail sends a
confirmation code, Cloudflare forwards it to you, you paste it in.

Then set it as the default reply address for that alias, so a reply to a
removal request goes back from the address they wrote to.

---

## 6 · DMARC, once mail is flowing

There is no DMARC record today. Add one — it tells receiving servers what to do
with mail that fails authentication while claiming to be from your domain, and
without it anybody can spoof you more easily.

| Name | Type | Value |
|---|---|---|
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:getsmallfish@gmail.com` |

`p=none` monitors without rejecting anything, which is the right place to
start. You get reports, you see what is actually sending as you, and you
tighten to `p=quarantine` later once you know Clerk's mail and anything else
passes.

---

## 7 · Then tell me

Once `opt-out@getsmallfish.com` reaches your inbox, I will:

- Replace `getsmallfish@gmail.com` with the real addresses across the opt-out
  page, `/bot`, privacy and terms. A test already asserts the crawler's contact
  address and the `/bot` page agree, so they cannot drift.
- Add the support address to the pricing page, which `docs/LAUNCH-CHECKLIST.md`
  §6 still lists as missing.

And separately, if you set up **Resend** (free tier, and a different job from a
mailbox — it is for mail the *app* sends), I will build the opt-out confirmation
mailer. That closes the one named gap in S1-09: right now a removal request is
filed as pending and confirming it is manual, because nothing can send mail.

---

## If it goes wrong

Switch the nameservers back to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
Vercel's zone is not deleted by pointing away from it, so the old records come
back as soon as propagation catches up. Nothing here is one-way.
