import { signalForCriterion } from "@/lib/signals";
import type { Business, Criterion } from "@/lib/types";

/**
 * What a business row can honestly show — the bridge between the engine and
 * the product handoff's `.evbox`.
 *
 * ## The one requirement in the handoff this engine cannot meet
 *
 * `PRODUCT-HANDOFF.md` §6.1 and §11 are unambiguous: every `fit` row carries a
 * **verbatim quote** from the business's own site plus the page and date it was
 * read, and *"a `fit` without them cannot be rendered and should be treated as
 * an error upstream, not as a row with a gap."*
 *
 * Measured on 2026-10-04 across `public/data/dental-phoenix.json`: `proof` is
 * populated on **all 51 `no_match` rows and on none of the 42 matches.** That
 * is not a gap in the data — it is the absence-proof rule showing through.
 * `CLAUDE.md`: *"A 'no X' verdict requires that the X-relevant pages were read
 * and no signal was found."* **You can quote the booking widget you found. You
 * cannot quote the absence of one.**
 *
 * So for the flagship criteria — "has no online booking", "has no quote form" —
 * there will never be a sentence of theirs to put in the evidence box, however
 * good the crawler gets.
 *
 * ## What is shown instead, and why it is still evidence
 *
 * The honest evidence for an absence is the *search*: what we looked for, how
 * many of their pages we opened, and what was not on any of them. That is
 * checkable — a reader can open the same pages and look for the same thing —
 * which is the property §3.3 is protecting. It is not a quote, and this module
 * does not dress it up as one: `kind` says which it is, and the component
 * renders them differently.
 *
 * **A presence verdict is held to the handoff's rule exactly.** "Their site
 * shows X" is a claim about something that is there, so it must carry the
 * sentence that says so. Without one `evidenceFor` returns `missing`, and the
 * row refuses to render rather than showing a confident claim with a hole
 * where its proof should be.
 *
 * This divergence is **not resolved here**. It is the same shape as the
 * scores-versus-verdicts fork in `docs/design-system.md` §5, it needs a
 * decision and a Decision log entry, and a module is not the place to take it.
 */

export type Evidence =
  | { kind: "quote"; text: string; source: string }
  | {
      kind: "absence";
      /**
       * What we looked for, as a noun phrase — "online booking", "a way to
       * request a quote online".
       *
       * **Null when no catalogue entry covers this criterion**, which is not an
       * edge case: `CLAUDE.md` requires that "any criterion in any vertical
       * must produce a usable check plan without a catalogue", and vet
       * Columbus's `independent` is exactly that. Its text is "not part of a
       * group", which no prefix strip turns into a noun, so building the
       * sentence anyway produced *"We looked for not part of a group on 4
       * pages"*. The component renders a different sentence instead of a
       * broken one, and the general layer stays usable without the catalogue —
       * which is the whole point of having two layers.
       */
      lookedFor: string | null;
      /** The criterion as written, for the no-catalogue sentence. */
      criterion: string;
      pages: number;
      source: string;
    }
  | { kind: "missing"; why: string };

/**
 * The thing a criterion is about, as a noun phrase. "has no online booking" →
 * "online booking". Shared with `composeEmail`'s wording so the row and the
 * draft never name the same gap two different ways.
 *
 * The article is **kept**. Stripping it produced *"We looked for way to request
 * a quote online on 4 pages of their site"* — `signals.ts` describes `label` as
 * a "short noun phrase, as it reads mid-sentence", and two of the seven carry
 * their own article because they need one. The strip existed to turn "a booking
 * widget" into "booking widget", which nothing asked for.
 */
export function thingOf(criterion: Criterion): string {
  const signal = signalForCriterion(criterion.text);
  return (
    signal?.label ??
    criterion.text
      .replace(/^has no /i, "")
      .replace(/^has /i, "")
      .replace(/^is not /i, "")
      .replace(/^does not /i, "")
  );
}

export function evidenceFor(b: Business, criterion: Criterion): Evidence {
  const v = b.verdicts[criterion.id];
  const r = b.read;
  const pages = r?.pages ?? 0;

  if (!v) return { kind: "missing", why: "This business was never checked against this question." };
  if (!r || r.outcome !== "ok" || pages === 0) {
    return { kind: "missing", why: "We could not read their site, so there is nothing to show." };
  }

  // A claim about something present must carry the sentence that says so.
  if (criterion.type === "presence") {
    return v.proof
      ? { kind: "quote", text: v.proof, source: sourceLine(pages, r.at) }
      : {
          kind: "missing",
          why:
            "This says their site shows something, but no sentence from the site " +
            "came back with it. The row is withheld rather than shown without proof.",
        };
  }

  // An absence. There is nothing of theirs to quote, by construction.
  const signal = signalForCriterion(criterion.text);
  return {
    kind: "absence",
    lookedFor: signal ? thingOf(criterion) : null,
    criterion: criterion.text,
    pages,
    source: sourceLine(pages, r.at),
  };
}

/**
 * The source line, which is `§11`'s *"the source page and the date it was
 * read"* as far as the data actually goes.
 *
 * The page count is measured. The **date is often absent**: the probe only
 * started stamping `read.at` on 2026-10-04, so nothing already in
 * `public/data/` carries one. The obvious substitute — `index.json`'s
 * `release`, `2026-08-19.0` — is when Overture published the *listings*, not
 * when we opened a website, and putting it on screen as "read 19 August" would
 * be a fabricated claim about our own activity on the one surface whose whole
 * job is that it does not do that.
 *
 * So the date appears when it exists and is silent when it does not.
 */
function sourceLine(pages: number, at: string | undefined): string {
  const pp = `${pages} page${pages === 1 ? "" : "s"} of their own site`;
  return at ? `${pp} · read ${prettyDay(at)}` : pp;
}

/** `2026-10-04` to `4 October`. No year: a date this recent reads as a date,
 *  and §8 wants numbers in mono inside sentences, which a slash-separated
 *  stamp cannot be. */
export function prettyDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const month = months[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month}` : iso;
}

/** A contact we do not have is **absent and named**, never an empty chip and
 *  never a guess (§3.6: "do not fall back to `info@domain`"). */
export interface Contact {
  kind: "phone" | "email" | "site";
  value: string | null;
  /** Said in words when `value` is null. */
  absent: string | null;
}

export function contactsFor(args: {
  phone: string | null;
  email: string | null;
  domain: string | null;
}): Contact[] {
  return [
    { kind: "phone", value: args.phone, absent: args.phone ? null : "no phone on the site" },
    {
      kind: "email",
      value: args.email,
      absent: args.email ? null : "no email on the site, a form or a phone only",
    },
    { kind: "site", value: args.domain, absent: args.domain ? null : "no website" },
  ];
}

/**
 * A criterion, agreed with a plural subject.
 *
 * Criterion text is written for one business — `has no online booking` — because
 * that is how a verdict reads about a row. Every sentence the app builds around
 * it has a plural subject: *"HVAC companies in Tampa that **has** no quote
 * form"*, which was on the first screen a visitor sees. The engine's wording is
 * right where it is and wrong where it is reused, so the fix belongs in the
 * reuse.
 *
 * Explicit verbs first, then a conservative fallback that only touches a lone
 * third-person `-s` and leaves anything it does not recognise exactly as it
 * found it — a criterion that reads slightly stiff is a much smaller problem
 * than one that has been mangled into saying something else.
 */
const PLURAL: Record<string, string> = {
  has: "have",
  is: "are",
  does: "do",
  offers: "offer",
  collects: "collect",
  needs: "need",
  shows: "show",
  takes: "take",
  uses: "use",
  runs: "run",
  lists: "list",
  sells: "sell",
  accepts: "accept",
};

export function agree(criterion: string): string {
  const m = /^(\w+)(\b[\s\S]*)$/.exec(criterion.trim());
  if (!m) return criterion;
  const [, first, rest] = m;
  const plural = PLURAL[first.toLowerCase()];
  if (plural) return plural + rest;
  // `-s` that is not a plural noun and not one of the irregulars above. Left
  // alone when the word is short enough to be a noun ("is", "as") or ends in
  // "ss" ("across"), neither of which is a verb we can safely strip.
  if (/^[a-z]{4,}s$/.test(first) && !/ss$/.test(first)) return first.slice(0, -1) + rest;
  return criterion;
}
