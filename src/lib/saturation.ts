/**
 * The saturation set and the gate on publishing it (S1-13, S1-14).
 *
 * Programmatic pages are the GTM plan's main organic bet, and they are also
 * the fastest way to publish a claim nobody checked. Two rules keep that from
 * happening, and both are refusals.
 *
 * **A page serves a stored count, never a scan.** The critique identified this
 * as a cost blow-up waiting to happen: a page that counts on demand pays for a
 * market read every time a crawler visits, and crawlers visit far more than
 * buyers do. The count on a page is the one measured when the market was last
 * read, with the date it was measured.
 *
 * **A page publishes only when the market has at least `MIN_PROVEN_MATCHES`
 * proven matches.** A page headed "dental practices in Phoenix with no online
 * booking" that lands on three results is worse than no page: it spends the
 * visitor's attention, ranks for a term we cannot serve, and teaches them the
 * product is thin. Today that gate publishes three of the four measured
 * markets and refuses the fourth — which is the gate doing its job, not a
 * problem to route around.
 */

import type { MarketIndex } from "@/lib/types";

/** Below this, the page is not worth a visitor's time and does not publish. */
export const MIN_PROVEN_MATCHES = 20;

export type Page = {
  slug: string;
  marketId: string;
  criterionId: string;
  niche: string;
  metro: string;
  /** The criterion in the words a searcher would use. */
  headline: string;
  matches: number;
  /** Read but not settled — shown on the page, because the gap is the honesty. */
  couldNotSettle: number;
  blocked: number;
  judged: number;
};

export type Refused = {
  slug: string;
  matches: number;
  why: string;
};

const NICHE_WORDS: Record<string, string> = {
  dental: "dental practices",
  med_spa: "med spas",
  hvac: "HVAC companies",
  veterinary: "veterinary clinics",
};

const CRITERION_WORDS: Record<string, string> = {
  no_online_booking: "with no online booking",
  no_quote_form: "with no online quote form",
  offers_botox: "that offer Botox",
  does_commercial: "that do commercial work",
  exotic_pet_care: "that treat exotic pets",
  independent: "that are independent",
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function slugFor(niche: string, metro: string, criterionId: string) {
  return slugify(
    `${NICHE_WORDS[niche] ?? niche} ${CRITERION_WORDS[criterionId] ?? criterionId} ${metro.split(",")[0]}`,
  );
}

/**
 * Every page the measured data can support, and every one it cannot.
 *
 * Returns both halves on purpose. A build that silently drops the pages it
 * cannot justify looks identical to a build with nothing to drop, and the
 * refused list is what says which markets need more reading before they earn
 * a page.
 */
export function saturationSet(index: MarketIndex | null): {
  pages: Page[];
  refused: Refused[];
} {
  const pages: Page[] = [];
  const refused: Refused[] = [];
  if (!index) return { pages, refused };

  for (const market of index.markets) {
    for (const criterion of market.criteria) {
      const t = market.tallies?.[criterion.id] ?? {};
      const matches = t.match ?? 0;
      const slug = slugFor(market.niche, market.metro, criterion.id);
      const judged =
        (t.match ?? 0) + (t.no_match ?? 0) + (t.couldnt_tell ?? 0) + (t.blocked ?? 0);

      if (matches < MIN_PROVEN_MATCHES) {
        refused.push({
          slug,
          matches,
          why:
            matches === 0 && (t.needs_model ?? 0) > 0
              ? `Nothing judged yet — ${t.needs_model} businesses need a model run before this market has anything to publish.`
              : `${matches} proven ${matches === 1 ? "match" : "matches"}, and a page needs ${MIN_PROVEN_MATCHES}. A thin page is worse than no page.`,
        });
        continue;
      }

      pages.push({
        slug,
        marketId: market.id,
        criterionId: criterion.id,
        niche: NICHE_WORDS[market.niche] ?? market.niche,
        metro: market.metro,
        headline: `${NICHE_WORDS[market.niche] ?? market.niche} in ${market.metro.split(",")[0]} ${CRITERION_WORDS[criterion.id] ?? criterion.text}`,
        matches,
        couldNotSettle: t.couldnt_tell ?? 0,
        blocked: t.blocked ?? 0,
        judged,
      });
    }
  }
  return { pages, refused };
}
