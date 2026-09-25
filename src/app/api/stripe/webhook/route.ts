import Stripe from "stripe";
import { PLANS } from "@/lib/pricing";
import { MILLI } from "@/lib/ledger";
import { planForPriceId } from "@/lib/checkout";
import { applyPaidPeriod, downgradeToFree, NotConfigured } from "@/lib/accounts";
import { currentEnv } from "@/lib/db";

/**
 * Stripe tells us money moved (S1-08).
 *
 * This is the only place a payment becomes credits, which makes it the one
 * handler where being wrong costs real money in both directions: miss an event
 * and a paying customer has no credits; apply one twice and we mint a month
 * nobody paid for, into an append-only ledger that cannot be corrected by
 * deletion.
 *
 * Four rules, each load-bearing.
 *
 * **The signature is verified against the raw body.** `constructEvent` needs
 * the bytes exactly as sent — parsing to JSON and re-serialising changes them
 * and every signature fails. That is why this reads `request.text()` and never
 * `request.json()`.
 *
 * **Every event is applied at most once.** Stripe retries anything that is slow
 * or not 2xx, so a duplicate is normal operation rather than an anomaly. The
 * event id is claimed by a primary key inside the same transaction that grants
 * the credits — see `apply_paid_period` in migration 0004 — so a repeat changes
 * nothing and says so.
 *
 * **The workspace comes from `client_reference_id` or subscription metadata,
 * never from an email address.** A customer can pay with a different address
 * from the one they signed up with, and matching on email would credit someone
 * else's workspace. If the id is absent the event is refused rather than
 * guessed at.
 *
 * **The plan comes from the price id**, mapped through `planForPriceId`, not
 * from the amount paid. Two plans could one day cost the same, and an amount
 * lookup would then grant the wrong number of credits.
 *
 * What is deliberately *not* handled: `invoice.payment_failed`. Dunning is a
 * real feature with real decisions in it — how many retries, what the customer
 * sees, when access stops — and stubbing it here would make it look handled.
 * Stripe retries failed payments on its own schedule meanwhile.
 */

export const dynamic = "force-dynamic";

type Result = { ok: boolean; [k: string]: unknown };

const planById = (id: string) => PLANS.find((p) => p.id === id);

export async function POST(request: Request) {
  const env = currentEnv();
  const secret = env.STRIPE_WEBHOOK_SECRET;
  const key = env.STRIPE_SECRET_KEY;

  if (!secret || !key) {
    // 500 rather than 200: a 200 tells Stripe this was handled and it stops
    // retrying, so a payment that arrived before the secret was set would be
    // lost rather than redelivered.
    return Response.json(
      {
        ok: false,
        reason:
          "STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not set, so this could " +
          "not be verified and nothing was applied. See docs/SETUP.md §4.",
      },
      { status: 500 },
    );
  }

  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = new Stripe(key).webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // 400, and unspecific. A caller probing this endpoint learns only that it
    // did not work. Stripe does not retry a 400, which is correct: an unsigned
    // request is not a delivery that failed, it is one that should not have
    // been made.
    return Response.json(
      { ok: false, reason: "Bad signature." },
      { status: 400 },
    );
  }

  try {
    const result = await handle(event);
    return Response.json(result satisfies Result, { status: 200 });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
        configured: !(err instanceof NotConfigured),
      },
      // 500 so Stripe redelivers. A transient database failure must not lose a
      // payment.
      { status: 500 },
    );
  }
}

async function handle(event: Stripe.Event): Promise<Result> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const accountId =
        session.client_reference_id ?? session.metadata?.account_id ?? null;
      if (!accountId) {
        // Refused, not guessed. Crediting the wrong workspace is worse than
        // crediting none, because the person who paid still has nothing and
        // somebody else silently gained a month.
        return {
          ok: false,
          reason:
            "No account id on the session, so there is no way to tell whose " +
            "payment this is. Nothing was applied.",
        };
      }

      const plan =
        planById(String(session.metadata?.plan_id ?? "")) ??
        planForPriceId(await firstPriceId(event));
      if (!plan) {
        return { ok: false, reason: "Could not tell which plan was bought." };
      }

      const applied = await applyPaidPeriod({
        eventId: event.id,
        kind: event.type,
        accountId,
        planId: plan.id,
        allowanceMilli: plan.credits * MILLI,
        planName: plan.name,
        customerId: typeof session.customer === "string" ? session.customer : null,
        subscriptionId:
          typeof session.subscription === "string" ? session.subscription : null,
      });
      return { ok: true, ...applied, plan: plan.id, accountId };
    }

    case "invoice.paid": {
      // The monthly renewal. Without this a customer is granted credits once
      // and never again, which looks like the product quietly breaking in
      // month two.
      // Cast once, narrowly. The SDK's Invoice type has moved these fields
      // between versions, and pinning to whatever shape today's types happen to
      // have would break on the next upgrade of a dependency that handles money.
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id?: string } | null;
        subscription_details?: { metadata?: Record<string, string> | null } | null;
      };
      const line = invoice.lines?.data?.[0] as
        | { metadata?: Record<string, string> | null; pricing?: { price_details?: { price?: string } } }
        | undefined;
      const accountId =
        line?.metadata?.account_id ??
        invoice.subscription_details?.metadata?.account_id ??
        null;
      if (!accountId) {
        return {
          ok: false,
          reason: "No account id on the invoice. Nothing was applied.",
        };
      }
      const plan = planForPriceId(line?.pricing?.price_details?.price ?? null);

      if (!plan) {
        return { ok: false, reason: "Could not tell which plan this invoice is for." };
      }
      const applied = await applyPaidPeriod({
        eventId: event.id,
        kind: event.type,
        accountId,
        planId: plan.id,
        allowanceMilli: plan.credits * MILLI,
        planName: plan.name,
        customerId: typeof invoice.customer === "string" ? invoice.customer : null,
        subscriptionId:
          typeof invoice.subscription === "string" ? invoice.subscription : null,
      });
      return { ok: true, ...applied, plan: plan.id, accountId };
    }

    case "customer.subscription.deleted": {
      // Back to Free. The account is *not* closed and the ledger is untouched —
      // what they were charged is the record a billing dispute needs, and
      // credits they already paid for are theirs until the period rolls.
      const sub = event.data.object;
      const accountId = (sub.metadata?.account_id as string | undefined) ?? null;
      if (!accountId) {
        return { ok: false, reason: "No account id on the subscription." };
      }
      await downgradeToFree(accountId);
      return { ok: true, accountId, planId: "free" };
    }

    default:
      // Acknowledged so Stripe stops retrying something we do not act on.
      return { ok: true, ignored: event.type };
  }
}

/** The price id on a completed session, fetched only when metadata did not
 *  already say which plan it was. */
async function firstPriceId(event: Stripe.Event): Promise<string | null> {
  const env = currentEnv();
  if (!env.STRIPE_SECRET_KEY) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  try {
    const items = await new Stripe(env.STRIPE_SECRET_KEY).checkout.sessions.listLineItems(
      session.id,
      { limit: 1 },
    );
    const price = items.data[0]?.price;
    return typeof price === "string" ? price : (price?.id ?? null);
  } catch {
    return null;
  }
}
