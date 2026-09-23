/**
 * The credit ledger (S1-08).
 *
 * Everything the customer is charged, refunded or refused passes through here,
 * so this file is the one place the pricing promise is either kept or broken.
 * It holds no Stripe code: payment moves money into a balance, and the balance
 * is spent by rules that have nothing to do with a card. Keeping the two apart
 * means the rules below are testable today, with no keys and no network, which
 * is the same pattern `engine/llm.py` uses for the model.
 *
 * **Credits are integers here, in thousandths.** The pricing has a 0.25-credit
 * unlock for a business with no website, and a balance that can be charged
 * quarter-credits and refunded them is a balance that will drift: `0.1 + 0.2`
 * is not `0.3` in binary floating point, and a customer who ends a month at
 * −0.0000000004 credits is a support ticket that nobody can explain. So the
 * unit stored is a **milli-credit**, all arithmetic is integer, and the
 * fractional value is a presentation concern.
 *
 * Every entry says what it was for and what it can be traced to. A ledger you
 * cannot explain a line of is the billing equivalent of a verdict without a
 * quote.
 */

import {
  PLANS,
  READS_PER_CREDIT,
  type Plan,
  settleBand,
} from "@/lib/pricing";

/** One credit, in the integer unit everything below is stored in. */
export const MILLI = 1000;

/** A business with no website is a paid unlock at a quarter of a credit. */
export const NO_WEBSITE_UNLOCK = 250;

/** Places-sourced discovery: one credit per ten businesses bought in. */
export const DISCOVERY_PER_BUSINESS = MILLI / 10;

/**
 * How long an unlocked business stays free to the workspace that unlocked it.
 *
 * The promise is "a business unlocked once is free to that workspace for 12
 * months". It is not generosity — re-charging for a row the customer already
 * has is the single fastest way to make a per-match price feel like a meter,
 * and the row costs us nothing to serve twice.
 */
export const UNLOCK_MONTHS = 12;

/** Unused credits carry one month, and no further. */
export const ROLLOVER_MONTHS = 1;

export type EntryKind =
  | "grant" // a period's allowance, or a pack
  | "rollover" // unused credits carried from last period
  | "expiry" // rollover that was not used in time
  | "match" // a matched business unlocked
  | "no_website_unlock"
  | "discovery" // gap-filled candidates bought from Places
  | "refund"; // a match the customer told us was wrong

export type Entry = {
  kind: EntryKind;
  /** Positive adds to the balance, negative spends it. Milli-credits. */
  milli: number;
  at: string;
  /** The business this line is about, when it is about one. */
  businessId?: string;
  /** Plain words. A ledger line nobody can explain is a support ticket. */
  why: string;
};

export type Account = {
  planId: string;
  entries: Entry[];
  /** businessId → ISO date it was first unlocked. */
  unlocked: Record<string, string>;
  /** Reads spent this period, against the plan's allowance. */
  readsThisPeriod: number;
};

export const emptyAccount = (planId = "free"): Account => ({
  planId,
  entries: [],
  unlocked: {},
  readsThisPeriod: 0,
});

export const planOf = (a: Account): Plan =>
  PLANS.find((p) => p.id === a.planId) ?? PLANS[0];

/** Milli-credits available now. */
export const balance = (a: Account): number =>
  a.entries.reduce((n, e) => n + e.milli, 0);

/** For display. Whole credits when whole, two decimals when not. */
export function credits(milli: number): string {
  const v = milli / MILLI;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function months(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return (
    (b.getFullYear() - a.getFullYear()) * 12 +
    (b.getMonth() - a.getMonth()) -
    (b.getDate() < a.getDate() ? 1 : 0)
  );
}

/**
 * Has this workspace already paid for this business, recently enough?
 *
 * Exactly twelve months is still free; the thirteenth is not.
 */
export function alreadyUnlocked(a: Account, businessId: string, now: string) {
  const when = a.unlocked[businessId];
  return !!when && months(when, now) < UNLOCK_MONTHS;
}

export type Charge =
  | { charged: true; milli: number; entry: Entry }
  | { charged: false; reason: string; milli: 0 };

/**
 * Charge for a matched business.
 *
 * `quotedBandCredits` is what the confirm screen showed and `deliveredRate` is
 * what the scan actually found, so the band billed is the cheaper of the two —
 * `settleBand` enforces that the quote can only go down. A business already
 * unlocked inside the window is free and says so rather than silently costing
 * nothing, because a customer re-running a search should be able to see why
 * their balance did not move.
 */
export function chargeForMatch(
  account: Account,
  args: {
    businessId: string;
    quotedBandCredits: number;
    deliveredRate: number;
    now: string;
  },
): Charge {
  const { businessId, quotedBandCredits, deliveredRate, now } = args;

  if (alreadyUnlocked(account, businessId, now)) {
    return {
      charged: false,
      milli: 0,
      reason: `Already unlocked on ${account.unlocked[businessId].slice(0, 10)} — free to this workspace for ${UNLOCK_MONTHS} months.`,
    };
  }

  const band = settleBand(quotedBandCredits, deliveredRate);
  const cost = band * MILLI;
  if (balance(account) < cost) {
    return {
      charged: false,
      milli: 0,
      reason: `${credits(balance(account))} credits left, and this match costs ${band}.`,
    };
  }

  const entry: Entry = {
    kind: "match",
    milli: -cost,
    at: now,
    businessId,
    why:
      band < quotedBandCredits
        ? `Matched. Billed ${band} rather than the ${quotedBandCredits} quoted, because the scan matched more often than its sample did.`
        : `Matched. ${band} credit${band === 1 ? "" : "s"}, the rate shown before the scan.`,
  };
  account.entries.push(entry);
  account.unlocked[businessId] = now;
  return { charged: true, milli: cost, entry };
}

/** A business with no website, unlocked deliberately rather than leaked. */
export function chargeForNoWebsite(
  account: Account,
  args: { businessId: string; now: string },
): Charge {
  if (alreadyUnlocked(account, args.businessId, args.now)) {
    return { charged: false, milli: 0, reason: "Already unlocked." };
  }
  if (balance(account) < NO_WEBSITE_UNLOCK) {
    return { charged: false, milli: 0, reason: "Not enough credits left." };
  }
  const entry: Entry = {
    kind: "no_website_unlock",
    milli: -NO_WEBSITE_UNLOCK,
    at: args.now,
    businessId: args.businessId,
    why: `No website to read, so nothing was proved about it — ${credits(NO_WEBSITE_UNLOCK)} of a credit for the listing itself.`,
  };
  account.entries.push(entry);
  account.unlocked[args.businessId] = args.now;
  return { charged: true, milli: NO_WEBSITE_UNLOCK, entry };
}

/**
 * Refund a match the customer says is wrong.
 *
 * Refunds exactly what that business was charged, found in the ledger rather
 * than recomputed — the band may have been settled differently at the time,
 * and refunding a recomputed number is how a customer ends up a quarter-credit
 * short with nobody able to say why. Refunding twice is refused.
 */
export function refundMatch(
  account: Account,
  args: { businessId: string; now: string },
): Charge {
  const { businessId, now } = args;
  const charged = account.entries.find(
    (e) =>
      e.businessId === businessId &&
      (e.kind === "match" || e.kind === "no_website_unlock"),
  );
  if (!charged) {
    return { charged: false, milli: 0, reason: "Nothing was charged for this." };
  }
  if (account.entries.some((e) => e.kind === "refund" && e.businessId === businessId)) {
    return { charged: false, milli: 0, reason: "Already refunded." };
  }
  const entry: Entry = {
    kind: "refund",
    milli: -charged.milli,
    at: now,
    businessId,
    why: "You told us this match was wrong, so it costs nothing.",
  };
  account.entries.push(entry);
  delete account.unlocked[businessId];
  return { charged: true, milli: -charged.milli, entry };
}

/** Candidates bought from Places to fill a coverage gap, shown before it happens. */
export function chargeForDiscovery(
  account: Account,
  args: { businesses: number; now: string },
): Charge {
  const cost = args.businesses * DISCOVERY_PER_BUSINESS;
  if (cost <= 0) return { charged: false, milli: 0, reason: "Nothing to buy." };
  if (balance(account) < cost) {
    return { charged: false, milli: 0, reason: "Not enough credits left." };
  }
  const entry: Entry = {
    kind: "discovery",
    milli: -cost,
    at: args.now,
    why: `${args.businesses} businesses open data was missing, bought in at 1 credit per 10.`,
  };
  account.entries.push(entry);
  return { charged: true, milli: cost, entry };
}

/**
 * Start a new billing period.
 *
 * Unused credits carry for one month and are capped at one month's allowance,
 * so a dormant account cannot accumulate a balance it could spend all at once —
 * the read allowance behind those credits is what actually costs us, and it is
 * granted per period, not banked.
 */
export function renew(account: Account, now: string): Account {
  const plan = planOf(account);
  const left = balance(account);
  const cap = plan.credits * MILLI;
  const carried = Math.max(0, Math.min(left, cap));
  const lost = Math.max(0, left - cap);

  const entries: Entry[] = [];
  if (lost > 0) {
    entries.push({
      kind: "expiry",
      milli: -lost,
      at: now,
      why: `${credits(lost)} credits expired. Unused credits carry ${ROLLOVER_MONTHS} month and are capped at one month's allowance.`,
    });
  }
  if (carried > 0) {
    entries.push({
      kind: "rollover",
      milli: 0,
      at: now,
      why: `${credits(carried)} credits carried over.`,
    });
  }
  entries.push({
    kind: "grant",
    milli: cap,
    at: now,
    why: `${plan.name}: ${plan.credits} credits for the period.`,
  });

  return {
    ...account,
    entries: [...account.entries, ...entries],
    readsThisPeriod: 0,
  };
}

/** Reads left before the plan's period allowance is spent. */
export function readsRemaining(account: Account): number {
  return Math.max(
    0,
    planOf(account).credits * READS_PER_CREDIT - account.readsThisPeriod,
  );
}

/**
 * Record reading, whether or not it matched.
 *
 * This is the only thing that bounds cost when a criterion matches nothing:
 * credits deplete on matches, so an impossible criterion never touches the
 * balance. Returns how many reads were actually permitted.
 */
export function spendReads(account: Account, reads: number): number {
  const allowed = Math.min(reads, readsRemaining(account));
  account.readsThisPeriod += allowed;
  return allowed;
}
