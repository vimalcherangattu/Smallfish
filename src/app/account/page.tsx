import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";

import BuyPlan from "@/components/BuyPlan";
import { Arrow } from "@/components/app/icons";
import {
  accountForUser,
  balanceOf,
  ensureWorkspace,
  isComped,
  ledgerOf,
  NotConfigured,
} from "@/lib/accounts";
import { verificationEnabled } from "@/lib/checkout";
import { CLERK_ENABLED } from "@/lib/clerk";
import { BANDS, PLANS, READS_PER_CREDIT, VERIFICATION_PLAN } from "@/lib/pricing";
import { credits, MILLI, planOf, type Entry } from "@/lib/ledger";
import { toCredits } from "@/lib/wallet";

/**
 * Credits and plan — `CreditsPlan.dc.html`, reached from the sidebar.
 *
 * ## What this replaced
 *
 * A ledger with a 54px number on top of it. Everything on it was true and most
 * of it was ours: a workspace UUID, "sites left to read this period", the
 * period start date, and then every ledger line in the order they were written.
 * It was built to let a customer reconstruct their own balance, which is a real
 * and good property — and it answered a question nobody arriving from **Get
 * more** was asking. They want to know what they have, what it buys, and how to
 * get more of it.
 *
 * So the order is inverted. What you have and what it buys is the page; the
 * ledger is still here, in full and unedited, under a heading that says what it
 * is. Nothing was removed — the audit trail, the comped notice, the "these
 * lines cannot be edited" guarantee and the payment-verification block all
 * survive, further down, where someone looking for them will still find them.
 *
 * ## The plan figures come from `PLANS`
 *
 * The artboard's tiles read 300 / 1,000 / 3,000 businesses a month. Those are
 * the same figures that were on the home page's price slab and they are not
 * reachable: a match costs 1–3 credits (`BANDS`), so a plan's credits are the
 * ceiling on its matches. 120 / 400 / 1,000. See the decision log, 2026-10-04.
 *
 * Server component: the reads below hold the service-role key.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Credits and plan — Small Fish" };

const LABEL: Record<Entry["kind"], string> = {
  grant: "Granted",
  rollover: "Carried over",
  expiry: "Expired",
  match: "Match",
  no_website_unlock: "No-website unlock",
  discovery: "Discovery",
  refund: "Refunded",
};

export default async function Account() {
  // Signed out, in the kit rather than in `NoAuth`.
  //
  // `NoAuth` is marketing chrome — its own background band and a "← Small Fish"
  // back link — which is right on `/sign-in`, where it is the page, and wrong
  // here, where it renders inside the app shell and looks like a different
  // product bolted into the frame.
  if (!CLERK_ENABLED || !(await auth()).userId) {
    return (
      <div className="appbody">
        <div className="appmid">
          <h1 className="t-h1">
            {CLERK_ENABLED ? "Sign in to see your credits." : "Accounts are not switched on here."}
          </h1>
          <p className="t-b" style={{ color: "#36404C", maxWidth: "60ch" }}>
            {CLERK_ENABLED
              ? "Searching, the evidence behind every match and the drafted emails are all open without one. An account is what holds a credit balance."
              : "This deployment has no sign-in configured, so there is nowhere to keep a balance. Everything else works and nothing is charged."}
          </p>
          <div className="row wrap" style={{ gap: 12 }}>
            <Link className="btn" href={CLERK_ENABLED ? "/sign-up?source=account" : "/app"}>
              {CLERK_ENABLED ? "Make an account" : "Back to your searches"}
              <Arrow s={17} />
            </Link>
            {CLERK_ENABLED && (
              <Link className="qbtn" href="/app">
                Keep looking without one
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }
  const { userId } = await auth();
  if (!userId) return null;

  try {
    // Make the workspace if the webhook did not. `user.created` was the only
    // way an account came into existence, which made a webhook a single point
    // of failure for the one thing every paying customer needs — and it failed
    // on the first real signup, when a Cloudflare cutover left `www` proxied
    // without a certificate and Clerk's delivery broke at the handshake. The
    // webhook is now an optimisation; this is the guarantee.
    let account = await accountForUser(userId);
    if (!account) {
      const free = PLANS.find((p) => p.id === "free") ?? PLANS[0];
      const person = await currentUser().catch(() => null);
      const name =
        [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim() ||
        person?.emailAddresses?.[0]?.emailAddress?.split("@")[0];
      await ensureWorkspace({
        clerkUserId: userId,
        name: name ? `${name}'s workspace` : undefined,
        planId: free.id,
        allowanceMilli: free.credits * MILLI,
        planName: free.name,
      });
      account = await accountForUser(userId);
    }

    if (!account) {
      return (
        <Problem title="You are signed in, and we could not make you a workspace.">
          That is ours rather than yours, and it should not happen. Nothing was charged and
          nothing was lost. Tell us and we will put it right by hand.
        </Problem>
      );
    }

    const [milli, entries] = await Promise.all([balanceOf(account.id), ledgerOf(account.id)]);
    const plan = planOf({
      planId: account.plan_id,
      entries: [],
      unlocked: {},
      readsThisPeriod: account.reads_this_period,
    });
    const comped = isComped(account);

    const left = toCredits(milli);
    const allowance = Math.max(plan.credits, left);
    const used = Math.max(0, allowance - left);
    const refunded = entries.filter((e) => e.kind === "refund").length;
    const pct = allowance > 0 ? Math.round((left / allowance) * 100) : 0;

    const paid = PLANS.filter((p) => p.priceUsd > 0 && !["pack", "watch"].includes(p.id));
    const pack = PLANS.find((p) => p.id === "pack");

    return (
      <div className="appbody">
        <div>
          <h1 className="t-h1">Credits and plan</h1>
          <p className="t-s" style={{ marginTop: 10, maxWidth: "58ch" }}>
            One credit is one business that fits. Businesses we check and leave out cost
            nothing, and anything you mark as not a fit is refunded on the spot.
          </p>
        </div>

        {comped && (
          <div className="honest">
            <span className="unsure" aria-hidden="true">
              ?
            </span>
            <div>
              <p className="t-b">
                <b>Matches cost this workspace nothing</b> until{" "}
                {new Date(account.comped_until!).toISOString().slice(0, 10)}. Every unlock is
                still written below at zero, with what it would have cost, so the record of
                what you took is complete. Reading is capped at{" "}
                {(account.comped_read_budget ?? 0).toLocaleString()} sites a period — a cost
                bound on us, not a limit on you.
              </p>
            </div>
          </div>
        )}

        {/* --- what you have ------------------------------------------------ */}
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="between" style={{ flexWrap: "wrap", gap: 16 }}>
            <div>
              <p className="kick">This month</p>
              <p className="t-h1" style={{ fontSize: 34, marginTop: 8 }}>
                <span className="mono" style={{ fontWeight: 500 }}>
                  {left}
                </span>{" "}
                <span style={{ fontSize: 17, color: "#5B6470" }}>of {allowance} left</span>
              </p>
            </div>
            <div className="row wrap" style={{ gap: 12 }}>
              {pack && <BuyPlan planId={pack.id} name={`Top up ${pack.credits} for $${pack.priceUsd}`} />}
            </div>
          </div>
          <div className="meter" style={{ height: 8 }}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="row wrap" style={{ gap: 24 }}>
            <span className="t-s">
              {used} used · {refunded} refunded · on {plan.name} · reading capped at{" "}
              {(plan.credits * READS_PER_CREDIT).toLocaleString()} sites a period
            </span>
          </div>
        </div>

        {/* --- the plans ---------------------------------------------------- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          {paid.map((p) => {
            const mine = p.id === account.plan_id;
            return (
              <div
                className="card"
                key={p.id}
                style={{
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  ...(mine ? { borderColor: "#0E1520", borderWidth: 2 } : {}),
                }}
              >
                <div className="between">
                  <p className="kick">{p.name}</p>
                  {mine && (
                    <span className="chip on" style={{ height: 26, fontSize: 11.5 }}>
                      your plan
                    </span>
                  )}
                </div>
                <p className="t-h1" style={{ fontSize: 40 }}>
                  <span className="mono" style={{ fontWeight: 500 }}>
                    ${p.priceUsd}
                  </span>{" "}
                  <span style={{ fontSize: 15, color: "#5B6470" }}>a month</span>
                </p>
                {/* `p.credits`, never a rounder number. A match costs at least one
                    credit, so this is the ceiling and not a target. */}
                <p className="t-s">up to {p.credits.toLocaleString()} businesses that fit a month</p>
                {mine ? (
                  <button className="btn ghost sm" type="button" disabled>
                    Current plan
                  </button>
                ) : (
                  <BuyPlan planId={p.id} name={`Switch to ${p.name}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* --- what a credit is spent on ------------------------------------ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
          <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <p className="kick">What a credit is spent on</p>
            {/* From `BANDS`, not retyped: the bands are what `settleBand`
                charges, and a price list that drifts from the charge is the
                one thing a billing page may not do. */}
            {BANDS.map((b) => (
              <div className="between" key={b.label}>
                <span className="t-s">
                  {b.label === "Common"
                    ? "A business that fits, in a market where many do"
                    : b.label === "Uncommon"
                      ? "One that fits where fewer do"
                      : "A rare fit"}
                </span>
                <span className="mono">{b.credits}</span>
              </div>
            ))}
            <div className="between">
              <span className="t-s">A business we check and leave out</span>
              <span className="mono" style={{ color: "#4A6508" }}>
                0
              </span>
            </div>
            <div className="between">
              <span className="t-s">One we could not tell about either way</span>
              <span className="mono" style={{ color: "#4A6508" }}>
                0
              </span>
            </div>
            <div className="between">
              <span className="t-s">Re-writing an email</span>
              <span className="mono" style={{ color: "#4A6508" }}>
                0
              </span>
            </div>
            <div className="between">
              <span className="t-s">Anything you mark not a fit</span>
              <span className="mono" style={{ color: "#4A6508" }}>
                refunded
              </span>
            </div>
          </div>

          <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="kick">Billing</p>
            {/* No invented card. The artboard draws "Visa ending 4417 · next
                charge 14 October"; we do not hold a card number and Stripe owns
                the renewal date, so this says where it lives instead of
                guessing at it. */}
            <p className="t-s">
              Cards, invoices and cancellation are handled by Stripe. Changing a plan above
              opens their checkout; the receipt and the next charge date are on the invoice
              they email you.
            </p>
            <p className="t-s">
              Unused credits carry one month, capped at one month&rsquo;s allowance. This
              period began {new Date(account.period_start).toISOString().slice(0, 10)}.
            </p>
          </div>
        </div>

        {/* --- the ledger, kept ---------------------------------------------- */}
        <div>
          <p className="t-h3" style={{ color: "#5B6470" }}>
            Every line, oldest last
          </p>
          {entries.length === 0 ? (
            <p className="t-s" style={{ marginTop: 10 }}>
              Nothing yet.
            </p>
          ) : (
            <div className="card" style={{ marginTop: 10 }}>
              {entries.map((e, i) => (
                <div
                  key={`${e.at}-${i}`}
                  className="row wrap"
                  style={{
                    gap: 16,
                    padding: "13px 18px",
                    borderTop: i === 0 ? undefined : "1px solid #D5D9D2",
                    alignItems: "baseline",
                  }}
                >
                  <span className="mono" style={{ width: "6ch", flexShrink: 0, fontSize: 14 }}>
                    {e.milli === 0 ? "—" : `${e.milli > 0 ? "+" : "−"}${credits(Math.abs(e.milli))}`}
                  </span>
                  <span className="t-b" style={{ flex: 1, minWidth: "20ch" }}>
                    {e.why}
                  </span>
                  <span className="src">
                    {LABEL[e.kind]} · {e.at.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="t-s" style={{ marginTop: 12, maxWidth: "64ch" }}>
            These lines cannot be edited or deleted, by us or by anybody — the database
            refuses it. A correction is a new line, so the history still shows what happened.
            If a match here is wrong, say so and it is refunded at exactly what it cost, read
            back from the line that charged it rather than recalculated.
          </p>
          <p className="src" style={{ marginTop: 10 }}>
            workspace {account.id}
          </p>
        </div>

        {verificationEnabled() && (
          <div className="card" style={{ padding: 22, background: "#F6F7F4", borderStyle: "dashed" }}>
            <p className="kick">payment verification · remove STRIPE_PRICE_TEST to hide this</p>
            <p className="t-s" style={{ marginTop: 8, maxWidth: "64ch" }}>
              A <b>real charge</b> against the live keys, for whatever the Stripe price named
              by <span className="mono">STRIPE_PRICE_TEST</span> is set to. Grants{" "}
              {VERIFICATION_PLAN.credits} credit. It proves the whole chain: session, webhook,
              signature, the grant, and the guard that refuses a redelivered event. Cancel and
              refund it afterwards.
            </p>
            <div style={{ maxWidth: 260, marginTop: 12 }}>
              <BuyPlan planId={VERIFICATION_PLAN.id} name={VERIFICATION_PLAN.name} />
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return err instanceof NotConfigured ? (
      <Problem title="The database is not configured on this deployment.">
        Nothing is broken and nothing was lost — there is simply nowhere to read a balance
        from yet. See <span className="mono">docs/SETUP.md</span> §1, or{" "}
        <Link href="/api/status" style={{ textDecoration: "underline" }}>
          /api/status
        </Link>{" "}
        for what else is missing.
      </Problem>
    ) : (
      <Problem title="We could not read your account just now.">
        Rather than show you a balance we are not sure of:{" "}
        <span className="mono">{err instanceof Error ? err.message : String(err)}</span>
      </Problem>
    );
  }
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="appbody">
      <div className="appmid">
        <h1 className="t-h1">{title}</h1>
        <p className="t-b" style={{ color: "#36404C", maxWidth: "62ch" }}>
          {children}
        </p>
        <Link className="btn" href="/app">
          Back to your searches
          <Arrow s={17} />
        </Link>
      </div>
    </div>
  );
}
