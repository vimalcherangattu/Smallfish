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

import { PLANS, type Plan } from "@/lib/pricing";

export type CheckoutIntent = {
  planId: string;
  /** Where Stripe should send the customer back to. */
  returnUrl: string;
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
  PLANS.find((p) => p.id === id);

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

  // Deliberately unimplemented until the keys exist. Writing a session call and
  // a webhook verifier against no key produces code that compiles, looks
  // finished and has never once been run — which is worse than an honest gap,
  // because the gap is visible and the code is not.
  return {
    ok: false,
    missing: [],
    reason:
      "Credentials are present but the Stripe session call is not written yet. " +
      "It is the last step and it needs a real key to be written against, not a guess.",
  };
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
