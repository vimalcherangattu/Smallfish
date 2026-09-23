/**
 * The templates library (S2-01).
 *
 * A template is a search someone can start from instead of composing one: a
 * signal, a polarity, and the wording that goes with them. The GTM plan wants
 * these as public SEO pages with counts on them, and the open question in
 * `PROJECT_PLAN.md` is which five drive the most first searches.
 *
 * Three rules, and two of them are refusals.
 *
 * **A template is a signal from `signals.ts`, never a new list.** The
 * catalogue already decides what the engine can settle; a second list of
 * "searches you can run" would quietly diverge from it, and the direction it
 * would diverge in is obvious — toward the appealing searches the engine
 * cannot deliver. So the library is derived, and a signal that loses its
 * detector loses its template on the next build.
 *
 * **Only `provable: true` signals become templates.** The rest are listed
 * anyway, with what it would take to settle them. That is `docs/icp-discovery.md`
 * rule 1 applied to a second surface: refuse out loud rather than omit, because
 * an omission reads as "we never thought of it" and a refusal reads as "we
 * looked and here is why not".
 *
 * **A template gets a public page only once a measured market backs it**, at
 * the same `MIN_PROVEN_MATCHES` threshold the programmatic pages use. One
 * threshold, one meaning. A template page with nothing measured behind it is a
 * promise, and the whole product is an argument against those.
 *
 * ## The count is stored, not live
 *
 * S2-01's own wording says "live counts". It ships with stored counts, for the
 * reason S1-14 already established: a page that counts on demand pays for a
 * market read every time a crawler visits, and crawlers visit far more than
 * buyers do. The number on a template page is the one measured when those
 * markets were last read, and the page says so with the date. The decision log
 * carries this departure.
 */

import { SIGNALS, signalForCriterion, type ObservableSignal } from "@/lib/signals";
import { MIN_PROVEN_MATCHES, slugFor } from "@/lib/saturation";
import type { MarketIndex } from "@/lib/types";

/** One measured market that this template has actually been run against. */
export type TemplateUse = {
  marketId: string;
  niche: string;
  metro: string;
  criterionId: string;
  criterionText: string;
  /**
   * True when this count is the *complement* of the criterion that was run.
   *
   * A market read for "has no online booking" settles both directions at once:
   * a `match` is a business with no booking, and a `no_match` is a business
   * where the engine found booking on the page. The second is the presence
   * template's evidence, and it is proven in the stronger sense of the two —
   * it rests on a widget that was found, not on pages that were read and came
   * back empty. Not counting it would have the library claim nothing had been
   * measured for "has online booking" while a hundred proven examples sat in
   * the tallies.
   */
  derived: boolean;
  matches: number;
  couldNotSettle: number;
  blocked: number;
  judged: number;
  /** The programmatic page for this market, when the market earned one. */
  pageSlug: string | null;
};

export type Template = {
  slug: string;
  signalId: string;
  polarity: "absence" | "presence";
  /** The search as a searcher would type it. */
  title: string;
  /** The question the engine puts to each site. */
  question: string;
  /** How the check is made, in the catalogue's own words. */
  how: string;
  /** What the gap costs the business — a likely, not a fact. */
  consequence: string;
  uses: TemplateUse[];
  matches: number;
  couldNotSettle: number;
  judged: number;
  /** Markets read for this template, i.e. `uses.length`. */
  markets: number;
  /** Every count here is the complement of a criterion run the other way. */
  derivedOnly: boolean;
};

/** A template the engine can run but no market has been read for yet. */
export type Unmeasured = {
  slug: string;
  signalId: string;
  polarity: "absence" | "presence";
  title: string;
  question: string;
  how: string;
};

/** A search people ask for that the engine cannot settle, and what is missing. */
export type Refused = {
  signalId: string;
  title: string;
  why: string;
  wouldTake: string;
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "has no online booking" → "no-online-booking". The polarity is in the text
 *  already, so it does not need to be in the slug twice. */
export const templateSlug = (signal: ObservableSignal, polarity: "absence" | "presence") =>
  slugify(
    (polarity === "absence" ? signal.absenceText : signal.presenceText)
      .replace(/^(has|is|offers|collects|shows)\s+/i, "")
      .replace(/^(a|an|the)\s+/i, ""),
  );

const titleFor = (signal: ObservableSignal, polarity: "absence" | "presence") =>
  `Businesses that ${polarity === "absence" ? signal.absenceText : signal.presenceText}`
    .replace("that has", "that have")
    .replace("that is", "that are")
    .replace("that offers", "that offer")
    .replace("that collects", "that collect")
    .replace("that shows", "that show");

/**
 * The library: what publishes, what is runnable but unproven, what is refused.
 *
 * All three halves are returned, for the same reason `saturationSet` returns
 * its refusals — a build that silently drops what it cannot justify looks
 * identical to a build with nothing to drop.
 */
export function templateLibrary(index: MarketIndex | null): {
  published: Template[];
  unmeasured: Unmeasured[];
  refused: Refused[];
} {
  // Signal + polarity → the markets measured for it.
  const uses = new Map<string, TemplateUse[]>();

  for (const market of index?.markets ?? []) {
    for (const criterion of market.criteria) {
      const signal = signalForCriterion(criterion.text);
      if (!signal || !signal.provable) continue;
      const t = market.tallies?.[criterion.id] ?? {};
      const judged =
        (t.match ?? 0) + (t.no_match ?? 0) + (t.couldnt_tell ?? 0) + (t.blocked ?? 0);
      const opposite = criterion.type === "absence" ? "presence" : "absence";

      // One criterion, two templates. See `derived` above.
      for (const [polarity, matches, derived] of [
        [criterion.type, t.match ?? 0, false],
        [opposite, t.no_match ?? 0, true],
      ] as const) {
        const key = `${signal.id}:${polarity}`;
        const list = uses.get(key) ?? [];
        list.push({
          marketId: market.id,
          niche: market.niche,
          metro: market.metro,
          criterionId: criterion.id,
          // Always the criterion that was actually put to the site, even for
          // the complement — that is the whole point of marking it.
          criterionText: criterion.text,
          derived,
          matches,
          couldNotSettle: t.couldnt_tell ?? 0,
          blocked: t.blocked ?? 0,
          judged,
          // Only the criterion actually run has a programmatic page; the
          // complement has no page of its own to link to.
          pageSlug:
            !derived && matches >= MIN_PROVEN_MATCHES
              ? slugFor(market.niche, market.metro, criterion.id)
              : null,
        });
        uses.set(key, list);
      }
    }
  }

  const published: Template[] = [];
  const unmeasured: Unmeasured[] = [];
  const refused: Refused[] = [];

  for (const signal of SIGNALS) {
    if (!signal.provable) {
      refused.push({
        signalId: signal.id,
        title: titleFor(signal, "absence"),
        why: signal.how,
        wouldTake: signal.wouldTake ?? "unrecorded",
      });
      continue;
    }

    for (const polarity of ["absence", "presence"] as const) {
      const slug = templateSlug(signal, polarity);
      const found = (uses.get(`${signal.id}:${polarity}`) ?? [])
        // A market that produced nothing for this direction is not evidence
        // for it, and listing it as a row reading 0 would pad the page.
        .filter((u) => u.matches > 0)
        .sort((a, b) => b.matches - a.matches);
      const matches = found.reduce((n, u) => n + u.matches, 0);

      if (matches < MIN_PROVEN_MATCHES) {
        // Runnable — the detector exists — but nothing measured stands behind
        // it, so it gets a row in the library and no page of its own.
        unmeasured.push({
          slug,
          signalId: signal.id,
          polarity,
          title: titleFor(signal, polarity),
          question: signal.question,
          how: signal.how,
        });
        continue;
      }

      published.push({
        slug,
        signalId: signal.id,
        polarity,
        title: titleFor(signal, polarity),
        question: signal.question,
        how: signal.how,
        consequence: signal.costsWhenMissing,
        uses: found,
        matches,
        couldNotSettle: found.reduce((n, u) => n + u.couldNotSettle, 0),
        judged: found.reduce((n, u) => n + u.judged, 0),
        markets: found.length,
        derivedOnly: found.every((u) => u.derived),
      });
    }
  }

  published.sort((a, b) => b.matches - a.matches);
  return { published, unmeasured, refused };
}

export function templateFor(index: MarketIndex | null, slug: string): Template | undefined {
  return templateLibrary(index).published.find((t) => t.slug === slug);
}
