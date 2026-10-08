import type { SiteContacts } from "@/lib/contacts";

/** Shapes of the measured data in `public/data/`, written by
 *  `stage0/src/coverage/export_app_data.py`. */

/** Verdicts the engine can return. Six, not three: "we haven't read this yet",
 *  "nothing that can judge this has run" and "the site refuses automated reading"
 *  are all honest answers a three-state model would have to lie about. None of
 *  the three is billable. */
export type VerdictKind =
  | "match"
  | "no_match"
  | "couldnt_tell"
  | "blocked"
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
  /** The day we opened their site, `YYYY-MM-DD`. Absent for everything read
   *  before the probe started recording it — the row then shows the page count
   *  and no date rather than borrowing the Overture release date, which is when
   *  the listings were published and not when we read anything. */
  at?: string;
  pages: number;
  chars: number;
  booking: boolean;
  vendors: string[];
  quote: boolean;
  chat: boolean;
  cms: string[];
  /**
   * What the site publishes about reaching them, found while we were on it.
   *
   * Optional because it arrived after the four measured markets were written
   * and their files do not carry it — those are served from
   * `public/data/contacts-*.json` instead, by the batch extractor this was
   * ported from. Absent means "not looked for on this read", never "they
   * publish nothing": `withheld` inside it is how the second thing is said.
   */
  contacts?: SiteContacts;
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

/** The index carries each market's criteria and tallies as well as its counts.
 *  It is ~2 KB; the market files are over a megabyte each. The ICP flow shows
 *  live match counts for three candidate ICPs side by side, and loading four
 *  megabytes to display three numbers would make the free count expensive in
 *  exactly the place the product promises it is free. */
export interface MarketIndex {
  release: string;
  markets: Array<Omit<Market, "businesses" | "checkPlanTargets">>;
}

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  match: "Match",
  no_match: "No match",
  couldnt_tell: "Couldn't tell",
  blocked: "Site blocks reading",
  needs_model: "Not yet judged",
  unread: "Not read yet",
};

/** Only matches are ever charged for. This mapping is the pricing promise made
 *  visible in the UI, so it cannot drift from what the user is told. */
export const BILLABLE: Record<VerdictKind, boolean> = {
  match: true,
  no_match: false,
  couldnt_tell: false,
  blocked: false,
  needs_model: false,
  unread: false,
};
