/**
 * The "get specific" step: what the seller sells, and what we look for because
 * of it. Pure, so `stage0/tests/test_intake.mjs` holds it.
 *
 * ## Why — QA sweep, 2026-11-01
 *
 * `/app/find` ends with **"Get specific — Tell us what you sell, and we read
 * these sites to find the ones worth calling."** The next screen never asked.
 * It offered a fixed menu of twelve website checks, and the handoff to it
 * dropped three things on the way: the categories the customer had just
 * chosen, the door they came from (`?source=`, the attribution GTM's funnel
 * needs), and anything they had said about what they sell.
 *
 * ## GEW, on purpose (CLAUDE.md §2)
 *
 * PRD v2's intake is one skippable screen. This is one optional field above
 * the same menu, not a wizard: typing an offer puts the checks it implies
 * first and says why; not typing anything changes nothing. `icp.ts` already
 * does the reasoning (offer → the observable gap that makes it needed) and
 * refuses what a website cannot show, so this adds no second list of signals.
 */

import { inferFromOffer } from "@/lib/icp";

export interface Check {
  /** `<signal id>:<absence|presence>`, as `/api/supply` builds it. */
  check: string;
  text: string;
  label: string;
}

export interface OfferFit {
  /** The menu, with the checks the offer implies first and in their order. */
  checks: Check[];
  /** Which of those are there because of the offer. */
  fits: Set<string>;
  /** Named in the offer and not provable from a website, with what it would take. */
  refused: Array<{ label: string; wouldTake: string }>;
  /** They typed something and none of it is visible on a website. */
  nothingObservable: boolean;
}

export function fitOffer(offer: string, menu: Check[]): OfferFit {
  const typed = offer.trim();
  if (typed.length < 3) {
    return { checks: menu, fits: new Set(), refused: [], nothingObservable: false };
  }
  const inf = inferFromOffer(typed);
  const keys = inf.propose.map((p) => `${p.signal.id}:${p.type}`);
  const fits = new Set(keys.filter((k) => menu.some((c) => c.check === k)));
  const first = keys.map((k) => menu.find((c) => c.check === k)).filter((c): c is Check => !!c);
  return {
    checks: [...first, ...menu.filter((c) => !fits.has(c.check))],
    fits,
    refused: inf.refused.map((r) => ({ label: r.signal.label, wouldTake: r.wouldTake })),
    nothingObservable: inf.nothingObservable,
  };
}

/** What travels from one step to the next, and into sign-up. */
export interface Carry {
  /** The door they came in by — GTM's attribution. */
  source?: string | null;
  /** What they said they sell. */
  sells?: string | null;
  /** Overture categories the customer confirmed on `/app/find`. */
  cats?: string[] | null;
}

const SOURCE = /^[a-z0-9/_-]{1,80}$/i;
const CAT = /^[a-z0-9_]{1,80}$/;

/** Read a carry back out of a URL, refusing anything malformed rather than
 *  passing it to a query. Same `source` rule as `handoff.ts`. */
export function readCarry(sp: Record<string, string | string[] | undefined>): Carry {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  const source = one("source");
  const cats = (one("cats") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => CAT.test(c))
    .slice(0, 20);
  return {
    source: source && SOURCE.test(source) ? source : null,
    sells: one("sells")?.slice(0, 80) ?? null,
    cats: cats.length ? cats : null,
  };
}

function withCarry(p: URLSearchParams, c: Carry): URLSearchParams {
  if (c.cats?.length) p.set("cats", c.cats.join(","));
  if (c.source) p.set("source", c.source);
  if (c.sells?.trim()) p.set("sells", c.sells.trim().slice(0, 80));
  return p;
}

/** The results screen for a query, with what came with it. */
export function appHref(q: string, c: Carry = {}): string {
  return `/app?${withCarry(new URLSearchParams({ q }), c).toString()}`;
}

/** Sign-up for a query. `handoff.ts` on the other side reads `q`, `source`
 *  and `sells`; `cats` is ours and harmless to it. */
export function signUpHref(q: string, c: Carry = {}): string {
  return `/sign-up?${withCarry(new URLSearchParams({ q }), { ...c, cats: null }).toString()}`;
}
