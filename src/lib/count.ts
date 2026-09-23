/**
 * The free match count (S1-02).
 *
 * The product's whole demo: before anyone pays or signs in, read a sample of
 * the market and say how many matches are in there, with the price per match
 * shown at the same time.
 *
 * **It reports a range, and that is a departure from the founding document.**
 * The product document promises a single number — "about 140 matches". A
 * 25-business sample cannot carry one. Four matches in 25 reads 16%, and its
 * 95% interval is [5.3%, 36.9%]; on a 2,400-business market that is anywhere
 * between 127 and 886 matches. Printing "about 380" would be inventing three
 * significant figures out of four observations, in a product whose entire
 * claim is that it does not do that. So the count is a range, the sample
 * behind it is shown, and the range narrows if the user pays for more reading.
 *
 * Why not sample more? Cost, and it does not help enough. 25 reads cost $0.42;
 * 60 cost $1.01 per anonymous visitor and still leave [0.3%, 8.9%] on a single
 * match. The sample's job is to quote a band and refuse the hopeless, not to
 * settle the market — see `NO_HOPE_RATE` in `pricing.ts`.
 */

import { groupForBilling } from "@/lib/billing";
import {
  SAMPLE_SIZE,
  bandFor,
  planScan,
  quoteBand,
  wilsonCC,
  type BANDS,
} from "@/lib/pricing";
import { BILLABLE, type Business, type Criterion, type VerdictKind } from "@/lib/types";

/** Deterministic shuffle: two identical searches must give an identical count. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: string): T[] {
  const rnd = seeded(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function verdictOf(b: Business, criteria: Criterion[]): VerdictKind {
  const kinds = criteria.map(
    (c) => (b.verdicts[c.id]?.verdict ?? "unread") as VerdictKind,
  );
  return kinds.includes("no_match")
    ? "no_match"
    : kinds.every((k) => k === "match")
      ? "match"
      : kinds.includes("blocked")
        ? "blocked"
        : kinds.includes("couldnt_tell")
          ? "couldnt_tell"
          : kinds.includes("needs_model")
            ? "needs_model"
            : "unread";
}

export type Proof = { name: string; line: string };

export type FreeCount = {
  /** Businesses the projection scales to: those with a website. */
  eligible: number;
  /** Businesses that could actually be sampled here — read, with a verdict. */
  frame: number;
  /** True when the sample frame is smaller than the population it projects to. */
  frameLimited: boolean;
  /** Of the sample, how many were reachable and settled either way. */
  sampled: number;
  read: number;
  matched: number;
  /** Read but not settled: blocked, or the evidence did not decide it. */
  unsettled: number;
  /** matched / sampled. The rate the price is set from — see the note below. */
  deliveredRate: number;
  /** matched / settled. What the rate would be if every site could be read. */
  decidedRate: number;
  range: { lo: number; hi: number };
  projected: { lo: number; hi: number };
  /** The band quoted on the confirm screen. Conservative — see `quoteBand`. */
  band: (typeof BANDS)[number];
  /** The band the observed rate alone would suggest. Shown only to explain a gap. */
  bandIfObserved: (typeof BANDS)[number];
  /** Up to three matches shown with their evidence, free, before paying. */
  proofs: Proof[];
  scan: ReturnType<typeof planScan>;
};

/**
 * Count from a sample.
 *
 * The rate that sets the price is **matched / sampled**, not matched / settled.
 * A site we could not read delivers the customer nothing, so counting it out of
 * the denominator would quote a band the scan cannot honour: cost per match is
 * cost per read ÷ delivered rate, and the reading happens either way. The
 * kinder-looking `decidedRate` is reported beside it, labelled, because it is
 * the honest ceiling — it is what this market becomes worth as crawling
 * improves, and that is a real thing to tell someone. It is not what they are
 * charged against today.
 */
export function freeCount(args: {
  businesses: Business[];
  criteria: Criterion[];
  seed: string;
  remainingCredits: number;
  sampleSize?: number;
}): FreeCount {
  const { businesses, criteria, seed, remainingCredits } = args;
  const sampleSize = args.sampleSize ?? SAMPLE_SIZE;

  // Two different populations, and conflating them was a bug worth naming.
  //
  // `population` is every business the projection scales to: those with a
  // website. Businesses with no website are a separate paid unlock, never a
  // free leak and never a silent drag on the rate.
  //
  // `frame` is what can actually be sampled *here*. In production the free
  // count reads 25 sites on demand and the two are the same. In this repo only
  // a few hundred businesses per market have been read, so drawing 25 from the
  // whole population returned 3 readable sites and called it a sample. Drawing
  // from the read set is the faithful simulation of a live count — with one
  // caveat that is real and is surfaced rather than buried: the read set was
  // chosen by the crawler, not at random, so a rate measured on it is only as
  // representative as that ordering was. `frameLimited` says when this applies.
  //
  // Both are deduplicated first. Overture carries a row per listing, and 830
  // of dental Phoenix's 2,778 records with a website share a domain with
  // another — 30%. Projecting onto listings would promise a third more matches
  // than we would ever bill for, and reading the same site twice in a sample
  // of 25 would make the rate a measurement of our supplier's duplicates.
  const population = groupForBilling(businesses.filter((b) => b.site)).map(
    (g) => g.lead,
  );
  const frame = population.filter((b) => verdictOf(b, criteria) !== "unread");
  const sample = shuffled(frame, seed).slice(0, sampleSize);

  let matched = 0;
  let unsettled = 0;
  let read = 0;
  const proofs: Proof[] = [];

  for (const b of sample) {
    const v = verdictOf(b, criteria);
    read++;
    if (BILLABLE[v]) {
      matched++;
      if (proofs.length < 3) {
        // `proof` when the engine quoted something, otherwise `reason` — the
        // same fallback `csv.ts` uses. For an absence criterion the reason IS
        // the evidence: "3 relevant pages read; no sign of it" is precisely
        // the positive proof the absence rule demands, and it is the sentence
        // that earns a stranger's trust before they have paid anything.
        const line = criteria
          .map((c) => b.verdicts[c.id]?.proof ?? b.verdicts[c.id]?.reason)
          .filter(Boolean)
          .join("; ");
        if (line) proofs.push({ name: b.name, line });
      }
    } else if (v !== "no_match") {
      unsettled++;
    }
  }

  const sampled = read;
  const settled = Math.max(0, sampled - unsettled);
  const deliveredRate = sampled ? matched / sampled : 0;
  const decidedRate = settled ? matched / settled : 0;
  const { lo, hi } = wilsonCC(matched, sampled);

  return {
    eligible: population.length,
    frame: frame.length,
    frameLimited: frame.length < population.length,
    sampled,
    read,
    matched,
    unsettled,
    deliveredRate,
    decidedRate,
    range: { lo, hi },
    projected: {
      lo: Math.floor(lo * population.length),
      hi: Math.ceil(hi * population.length),
    },
    band: quoteBand(matched, sampled),
    bandIfObserved: bandFor(deliveredRate),
    proofs,
    scan: planScan({
      sampleMatchRate: deliveredRate,
      remainingCredits,
      criteriaCount: criteria.length,
    }),
  };
}

/** How wide the range is, as a multiple. Used to say so out loud when it is wide. */
export const rangeWidth = (c: FreeCount) =>
  c.projected.lo > 0 ? c.projected.hi / c.projected.lo : Infinity;
