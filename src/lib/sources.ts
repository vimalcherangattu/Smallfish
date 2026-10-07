/**
 * Public records worth reading about a business, beyond its own website.
 *
 * ## Why this is a catalogue and not a pile of fetchers
 *
 * `signals.ts` already holds the rule that made this product work: one list of
 * things we can observe, each one either `provable` or refused out loud. This
 * is the same idea pointed at the world outside the website. A source that we
 * have not read the terms of, or that does not cover the trade being searched,
 * is listed here with `status` saying so rather than quietly left out — because
 * the failure mode is not "we forgot Ohio", it is "we implied we checked and we
 * did not".
 *
 * ## The rule that governs all of them
 *
 * **Absence needs positive proof.** "No contractor licence found" is only a
 * finding when the right registry for that state and trade was actually
 * queried and came back empty. Every other case is "couldn't tell", the same
 * as an unreadable website. `settleable` is false for exactly the sources
 * where a miss cannot be distinguished from a gap in coverage.
 *
 * ## What is deliberately not here
 *
 * Anything requiring a login, anything behind a paywall, and anything whose
 * terms forbid storing what it returns. Google Places stays a gap-fill that
 * stores place ids only, as its terms require, and Google Maps is never
 * scraped — that is a contract question, not a computer-crime one, and
 * `hiQ v. LinkedIn` does not make it safe.
 */

export type SourceStatus =
  /** Free, documented, and we can use it today. */
  | "ready"
  /** Real and free, but needs work before it can be trusted in a verdict. */
  | "needs_work"
  /** Terms have to be read and agreed before a single call is made. */
  | "terms_unread";

export interface PublicSource {
  id: string;
  name: string;
  /** What it tells you about a business, in one line. */
  tells: string;
  /** Why a seller would care — the buying signal, not the datum. */
  whyItMatters: string;
  home: string;
  /** Free at the volume this product needs? */
  free: boolean;
  /** National, per-state, or one industry only. */
  coverage: "national" | "per_state" | "by_industry";
  status: SourceStatus;
  /**
   * Can a **miss** in this source be reported as a finding?
   *
   * False wherever an empty result is indistinguishable from the source not
   * covering that business — which is most per-state registries, because a
   * trade licensed in Arizona may simply not be licensed in Nevada.
   */
  settleable: boolean;
  /** What has to be true before this moves to `ready`. */
  blocker?: string;
}

export const PUBLIC_SOURCES: PublicSource[] = [
  {
    id: "nppes",
    name: "NPPES / NPI Registry",
    tells: "Every US healthcare provider: name, taxonomy, practice address, sole proprietor or organisation.",
    whyItMatters:
      "Distinguishes a one-dentist practice from a twelve-provider group without reading a word of the site, the size question the website almost never answers.",
    home: "https://npiregistry.cms.hhs.gov/api-page",
    free: true,
    coverage: "by_industry",
    status: "ready",
    settleable: true,
  },
  {
    id: "sos_registry",
    name: "Secretary of State business registries",
    tells: "Incorporation date, entity type, status, registered agent, sometimes officers.",
    whyItMatters:
      "Business age is one of the few hard numbers about a small business, and a lapsed registration is the clearest possible sign not to bother.",
    home: "https://www.sec.gov/", // per-state; no single national home
    free: true,
    coverage: "per_state",
    status: "needs_work",
    settleable: false,
    blocker:
      "Fifty registries, fifty shapes, and a dozen with no machine interface at all. A miss means nothing until we know the state was actually searchable.",
  },
  {
    id: "state_licence",
    name: "State licensing boards",
    tells: "Licence number, status, expiry, and disciplinary history for contractors, cosmetology, HVAC, plumbing, medical.",
    whyItMatters:
      "The strongest signal in the trades. An expired licence or an open complaint changes who you call and what you open with.",
    home: "https://www.cslb.ca.gov/",
    free: true,
    coverage: "per_state",
    status: "needs_work",
    settleable: false,
    blocker:
      "Coverage varies by state and by trade. Absence is only a finding where we know that trade is licensed in that state, otherwise a clean miss is meaningless.",
  },
  {
    id: "osha",
    name: "OSHA establishment search",
    tells: "Workplace inspections, citations and penalties by establishment.",
    whyItMatters:
      "Rare, but decisive when present: a recent citation tells you what the business is currently spending management attention on.",
    home: "https://www.osha.gov/ords/imis/establishment.html",
    free: true,
    coverage: "national",
    status: "needs_work",
    settleable: false,
    blocker: "Name matching is fuzzy and there is no stable identifier, so a miss is not proof.",
  },
  {
    id: "propublica_np",
    name: "ProPublica Nonprofit Explorer",
    tells: "Form 990 filings: revenue, expenses, officers and their pay, for every US nonprofit.",
    whyItMatters:
      "Actual revenue for a whole sector, free and structured. Nothing else on this list gives you a size number you can sort on.",
    home: "https://projects.propublica.org/nonprofits/api",
    free: true,
    coverage: "by_industry",
    status: "ready",
    settleable: true,
  },
  {
    id: "cbp",
    name: "Census County Business Patterns",
    tells: "Establishment counts and employment bands by NAICS code and geography.",
    whyItMatters:
      "Sizes a market before a single site is read, how many of this trade exist in this county, so a search can be quoted honestly.",
    home: "https://www.census.gov/data/developers/data-sets/cbp-nonemp-zbp/cbp-api.html",
    free: true,
    coverage: "national",
    status: "ready",
    settleable: true,
  },
  {
    id: "sam_gov",
    name: "SAM.gov and USAspending",
    tells: "Federal contractor registration, awards, and the money that changed hands.",
    whyItMatters: "Only relevant to businesses that sell to government, and decisive for the ones that do.",
    home: "https://api.sam.gov/",
    free: true,
    coverage: "national",
    status: "needs_work",
    settleable: false,
    blocker: "Registration covers a small slice of local businesses, so absence says almost nothing.",
  },
  {
    id: "yelp",
    name: "Yelp Fusion",
    tells: "Review count, rating and categories.",
    whyItMatters: "Review volume is a proxy for how much a business already invests in being found.",
    home: "https://docs.developer.yelp.com/",
    free: true,
    coverage: "national",
    status: "terms_unread",
    settleable: false,
    blocker:
      "The display and storage terms are restrictive and have to be read line by line before a single call. Listed so it is a decision, not an oversight.",
  },
];

/** Sources that can be used today, and whose misses mean something. */
export const readySources = () => PUBLIC_SOURCES.filter((s) => s.status === "ready");

/**
 * What we may say about a business from a source that came back empty.
 *
 * The whole point of the module: a miss is a finding only when the source both
 * covers the business and was actually queried. Everything else is the same
 * "couldn't tell" the website reader already produces, and is never billed.
 */
export function absenceMeans(source: PublicSource): "no" | "couldnt_tell" {
  return source.status === "ready" && source.settleable ? "no" : "couldnt_tell";
}
