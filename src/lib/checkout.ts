/**
 * The payment boundary (S1-08).
 *
 * Stripe's only job here is to move money into a balance. Everything that
 * decides what the balance is *spent on* lives in `ledger.ts` and has no
 * knowledge of a card, which is why the pricing rules are fully tested today
 * with no keys and no network.
 *
 * **This refuses rather than pretends.** `engine/preflight.py` established the
 * pattern for the model key: when a credential is missing, say which one, say
 * what it would unlock, and exit in a way that cannot be mistaken for success.
 * A checkout that silently no-ops in development is how a "working" billing
 * flow reaches production having never once charged anybody.
 *
 * What is deliberately not here: card details, a webhook signature check
 * written from memory, or a `if (dev) grantCredits()` shortcut. The first two
 * need the real keys to write correctly and the third is the shortcut that
 * makes the other two feel unnecessary.
 */

import { PLANS, VERIFICATION_PLAN, type Plan } from "@/lib/pricing";

export type CheckoutIntent = {
  planId: string;
  /** Where Stripe should send the customer back to. */
  returnUrl: string;
  /**
   * The workspace being upgraded. It travels to Stripe and comes back on the
   * webhook, which is the only reliable way to know *whose* payment arrived —
   * an email address is not, because a customer can pay with a different one
   * from the one they signed up with, and matching on it would credit the
   * wrong workspace.
   */
  accountId: string;
};

export type CheckoutResult =
  | { ok: true; url: string; provider: string }
  | { ok: false; reason: string; missing: string[] };

/** Credentials this needs, and what each one is for. */
export const REQUIRED_ENV = [
  ["STRIPE_SECRET_KEY", "create a checkout session"],
  ["STRIPE_WEBHOOK_SECRET", "verify that a payment really happened"],
  ["STRIPE_PRICE_STARTER", "the price id for the $29 plan"],
  ["STRIPE_PRICE_GROWTH", "the price id for the $79 plan"],
  ["STRIPE_PRICE_AGENCY", "the price id for the $199 plan"],
] as const;

/** Read through `globalThis` so this module compiles without node types —
 *  the ledger tests build it standalone, and a billing rule that can only be
 *  tested inside Next.js is a billing rule that will not be tested. */
export const currentEnv = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

export function missingCredentials(
  env: Record<string, string | undefined> = currentEnv(),
): string[] {
  return REQUIRED_ENV.filter(([key]) => !env[key]).map(([key]) => key);
}

export const planFor = (id: string): Plan | undefined =>
  id === VERIFICATION_PLAN.id ? VERIFICATION_PLAN : PLANS.find((p) => p.id === id);

/** Is the one-dollar verification purchase available on this deployment? It is
 *  exactly as available as the environment variable that names its price. */
export const verificationEnabled = (
  env: Record<string, string | undefined> = currentEnv(),
) => !!env.STRIPE_PRICE_TEST;

/**
 * Begin a purchase.
 *
 * Returns a refusal naming every missing credential rather than one at a time,
 * because finding out about five missing keys across five attempts is five
 * times the work and exactly what this project's preflight exists to avoid.
 */
export async function startCheckout(
  intent: CheckoutIntent,
  env: Record<string, string | undefined> = currentEnv(),
): Promise<CheckoutResult> {
  const plan = planFor(intent.planId);
  if (!plan) {
    return { ok: false, reason: `No plan called "${intent.planId}".`, missing: [] };
  }
  if (plan.priceUsd === 0) {
    return {
      ok: false,
      reason: "The free plan needs no checkout — it is granted on sign-up.",
      missing: [],
    };
  }

  const missing = missingCredentials(env);
  if (missing.length) {
    return {
      ok: false,
      missing,
      reason:
        `Payments are not configured. Missing ${missing.length === 1 ? "credential" : "credentials"}: ` +
        missing
          .map((k) => `${k} (${REQUIRED_ENV.find(([n]) => n === k)![1]})`)
          .join("; ") +
        ". Nothing was charged and no account was created.",
    };
  }

  const price = priceIdFor(plan.id, env);
  if (!price) {
    return {
      ok: false,
      missing: [],
      reason: `No Stripe price is configured for the ${plan.name} plan.`,
    };
  }

  try {
    // Loaded here rather than at the top of the file, so that everything else
    // in this module — which plan a price id belongs to, which credentials are
    // missing, what a plan costs — stays importable with no SDK, no keys and
    // no network. That is the same rule `pricing.ts` and `ledger.ts` follow,
    // and it is why 86 assertions about money run in a plain node process.
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${intent.returnUrl}?paid=1`,
      cancel_url: `${intent.returnUrl}?paid=0`,
      // Both, deliberately. `client_reference_id` rides on the session and
      // `metadata` rides on the subscription, so the workspace is recoverable
      // from the first payment *and* from every monthly invoice after it.
      client_reference_id: intent.accountId,
      subscription_data: {
        metadata: { account_id: intent.accountId, plan_id: plan.id },
      },
      metadata: { account_id: intent.accountId, plan_id: plan.id },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return {
        ok: false,
        missing: [],
        reason: "Stripe created a session without a URL to send you to.",
      };
    }
    return { ok: true, url: session.url, provider: "stripe" };
  } catch (err) {
    // Stripe's own message, not a generic one. "Something went wrong" on a
    // payment screen is where customers stop.
    return {
      ok: false,
      missing: [],
      reason: `Stripe refused the checkout: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

/** Which price id belongs to a plan. Named per plan rather than looked up by
 *  amount, because two plans could one day cost the same and an amount lookup
 *  would then charge for the wrong one. */
export function priceIdFor(
  planId: string,
  env: Record<string, string | undefined> = currentEnv(),
): string | undefined {
  return {
    starter: env.STRIPE_PRICE_STARTER,
    growth: env.STRIPE_PRICE_GROWTH,
    agency: env.STRIPE_PRICE_AGENCY,
    [VERIFICATION_PLAN.id]: env.STRIPE_PRICE_TEST,
  }[planId];
}

/** The plan a Stripe price id belongs to — the webhook's direction of travel.
 *  Returns undefined rather than guessing, because guessing here grants the
 *  wrong number of credits. */
export function planForPriceId(
  priceId: string | null | undefined,
  env: Record<string, string | undefined> = currentEnv(),
): Plan | undefined {
  if (!priceId) return undefined;
  const id = (
    [
      ["starter", env.STRIPE_PRICE_STARTER],
      ["growth", env.STRIPE_PRICE_GROWTH],
      ["agency", env.STRIPE_PRICE_AGENCY],
      [VERIFICATION_PLAN.id, env.STRIPE_PRICE_TEST],
    ] as const
  ).find(([, p]) => p && p === priceId)?.[0];
  if (!id) return undefined;
  return id === VERIFICATION_PLAN.id
    ? VERIFICATION_PLAN
    : PLANS.find((p) => p.id === id);
}

/** What a plan costs, for a pricing page that cannot drift from the ledger. */
export function planSummary(plan: Plan) {
  return {
    name: plan.name,
    priceUsd: plan.priceUsd,
    credits: plan.credits,
    perCredit: plan.credits ? plan.priceUsd / plan.credits : 0,
  };
}
