/** Build-your-ICP: from what you sell to who observably needs it (S1-23 – S1-26).
 *
 *  `docs/icp-discovery.md` names the one piece of reasoning this flow adds:
 *
 *      What must be observably true on a business's website for this seller's
 *      offer to be needed there?
 *
 *  Two rules from that document are enforced here rather than left to the UI,
 *  because they are the difference between a useful flow and a flattering one:
 *
 *  1. **Only propose criteria the engine can prove.** Anything matching an
 *     unprovable signal comes back in `refused`, with what it would take, and
 *     never becomes a candidate. An ICP the engine cannot deliver is worse
 *     than no ICP.
 *  2. **Show the reasoning, not just the answer.** Every proposal and every
 *     refusal carries the question it came from, so the user can check the
 *     chain instead of trusting it.
 *
 *  Step 2 of the designed flow — read the seller's own site — needs a model and
 *  is not built. This is the rest of the flow, working on a described offer
 *  instead of a fetched one. The catalogue of named offers is an optimisation
 *  over the free-text path, never a precondition: `signalsForOffer` works on an
 *  arbitrary description with no catalogue entry at all, which is the same
 *  two-layer rule `engine/check_plan.py` follows.
 */

import { SIGNALS, type ObservableSignal } from "@/lib/signals";
import type { MarketIndex } from "@/lib/types";

export interface NamedOffer {
  id: string;
  label: string;
  /** How a seller would describe it; also the free-text seed. */
  describes: string;
}

/** Common offers, as a head start on typing. Not a closed set — the free-text
 *  path below takes anything and is the layer that must work. */
export const NAMED_OFFERS: NamedOffer[] = [
  {
    id: "receptionist",
    label: "AI phone receptionist",
    describes: "We answer calls 24/7 so clinics stop losing after-hours bookings.",
  },
  {
    id: "scheduling",
    label: "Online scheduling software",
    describes: "Appointment booking that customers can do themselves on the website.",
  },
  {
    id: "leadgen",
    label: "Lead capture and quoting",
    describes: "We add quote request and intake forms so enquiries arrive in writing.",
  },
  {
    id: "chatbot",
    label: "Website chat assistant",
    describes: "A chat assistant that answers questions on the site and books the job.",
  },
  {
    id: "redesign",
    label: "Website redesign",
    describes: "We rebuild outdated, non-mobile websites for local service businesses.",
  },
];

export interface Proposal {
  signal: ObservableSignal;
  /** The criterion this becomes, in the shape the normal search produces. */
  criterionText: string;
  type: "absence" | "presence";
}

export interface Refusal {
  signal: ObservableSignal;
  /** What it would take to make this provable. Never hidden. */
  wouldTake: string;
}

export interface Inference {
  propose: Proposal[];
  refused: Refusal[];
  /** True when the description named nothing a website can show. */
  nothingObservable: boolean;
}

/** The inference. Reads an offer description for signals the offer implies, and
 *  splits them into what can be proven and what cannot.
 *
 *  An offer is needed where its signal is *missing* — someone selling booking
 *  software wants businesses with no booking — so proposals are absence
 *  criteria. That is also why they are the expensive half: `settleable_without_
 *  model` is false for every absence criterion by design. */
export function inferFromOffer(description: string): Inference {
  const hits = SIGNALS.filter((s) => s.inOffer.test(description));

  return {
    propose: hits
      .filter((s) => s.provable)
      .map((s) => ({ signal: s, criterionText: s.absenceText, type: "absence" as const })),
    refused: hits
      .filter((s) => !s.provable)
      .map((s) => ({ signal: s, wouldTake: s.wouldTake ?? "unspecified" })),
    nothingObservable: hits.length === 0,
  };
}

export interface Candidate {
  marketId: string;
  criterionId: string;
  /** The market's own criterion text, which is what will be searched. */
  criterionText: string;
  niche: string;
  metro: string;
  /** Measured matches for this criterion in this market, whole market. */
  matches: number;
  /** How many of the market's candidates have been read at all. */
  read: number;
  candidates: number;
  /** The reasoning line: why this ICP follows from the offer. */
  why: string;
}

/** Live counts for the proposed criteria, across every market we have measured.
 *
 *  These are real tallies from `public/data/index.json`, not estimates, and
 *  they are whole-market counts — the region filter narrows them afterwards.
 *  The honest caveat travels with them: only a fraction of each market has been
 *  read, so a count is a floor, not a total. The UI says so; this function does
 *  not round it up to look better. `docs/icp-discovery.md` open question 3
 *  chose the honest number over the flattering one. */
export function candidatesFor(
  inference: Inference,
  index: MarketIndex | null,
): Candidate[] {
  if (!index || !inference.propose.length) return [];

  const out: Candidate[] = [];
  for (const m of index.markets) {
    for (const c of m.criteria ?? []) {
      const proposal = inference.propose.find((p) => p.signal.inCriterion.test(c.text));
      if (!proposal || c.type !== proposal.type) continue;
      out.push({
        marketId: m.id,
        criterionId: c.id,
        criterionText: c.text,
        niche: m.niche,
        metro: m.metro,
        matches: m.tallies?.[c.id]?.match ?? 0,
        read: m.counts.read,
        candidates: m.counts.candidates,
        why:
          `Your offer answers "${proposal.signal.question}" — so we looked for ` +
          `${m.niche.replace(/_/g, " ")} businesses whose site shows no ` +
          `${proposal.signal.label}.`,
      });
    }
  }
  // Most matches first: the counts are the argument, per the design doc.
  return out.sort((a, b) => b.matches - a.matches);
}
