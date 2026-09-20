/** Shapes of the measured data in `public/data/`, written by
 *  `stage0/src/coverage/export_app_data.py`. */

/** Verdicts the engine can return. Five, not three — because "we haven't read
 *  this yet" and "nothing that can judge this has run" are honest answers that a
 *  three-state model would have to lie about. */
export type VerdictKind =
  | "match"
  | "no_match"
  | "couldnt_tell"
  | "needs_model"
  | "unread";

export interface Verdict {
  verdict: VerdictKind;
  reason: string;
  /** The evidence, when there is any. Never invented. */
  proof?: string;
}

export interface ReadResult {
  outcome: string;
  pages: number;
  chars: number;
  booking: boolean;
  vendors: string[];
  quote: boolean;
  chat: boolean;
  cms: string[];
}

export interface Business {
  id: string;
  name: string;
  cat: string;
  lat: number;
  lon: number;
  addr: string;
  site: string | null;
  phone: string | null;
  primary: boolean;
  read?: ReadResult;
  verdicts: Record<string, Verdict>;
}

export interface Criterion {
  id: string;
  type: "presence" | "absence";
  text: string;
  /** The one-line "how this is checked" the confirm step shows. */
  explain: string;
  needsModel: boolean;
}

export interface Market {
  id: string;
  niche: string;
  metro: string;
  center: { lat: number; lon: number };
  search: string;
  criteria: Criterion[];
  checkPlanTargets: string[];
  counts: {
    candidates: number;
    primary: number;
    withSite: number;
    read: number;
  };
  tallies: Record<string, Record<string, number>>;
  businesses: Business[];
}

export interface MarketIndex {
  release: string;
  markets: Array<Omit<Market, "businesses" | "criteria" | "tallies" | "checkPlanTargets">>;
}

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  match: "Match",
  no_match: "No match",
  couldnt_tell: "Couldn't tell",
  needs_model: "Not yet judged",
  unread: "Not read yet",
};

/** Only matches are ever charged for. This mapping is the pricing promise made
 *  visible in the UI, so it cannot drift from what the user is told. */
export const BILLABLE: Record<VerdictKind, boolean> = {
  match: true,
  no_match: false,
  couldnt_tell: false,
  needs_model: false,
  unread: false,
};
