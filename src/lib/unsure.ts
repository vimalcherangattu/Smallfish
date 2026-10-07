import type { Business, Criterion, VerdictKind } from "@/lib/types";

/**
 * The couldn't-tell tab, grouped by what actually stopped us.
 *
 * ## Why this is a module and not a `filter` in the screen
 *
 * `PRODUCT-HANDOFF.md` §5.4 makes "couldn't tell" a first-class tab — *"the tab
 * nobody else in this market builds"* — and §11 says an `unknown` row has to
 * carry "the list of pages examined and what was being looked for". A count
 * cannot do that. `LeadResult.unclear` was a number, so the screen could say
 * *38* and nothing more, which is the same shrug the product exists to replace.
 *
 * ## The groups are measured, not designed
 *
 * `AppUnsure.dc.html` draws three groups: never mentions booking · did not load
 * · asked us not to be read. The real data has more, and they are not the same
 * three. Counted across all four markets on 2026-10-04:
 *
 * | Read outcome | What it means | dental Phoenix |
 * |---|---|---|
 * | `blocked`     | a bot wall or robots.txt    | 32 |
 * | `dead`        | the domain resolves to nothing | 17 |
 * | `timeout`     | no answer in time           | 32 |
 * | `http_error`  | their server returned an error | 6 |
 * | `js_shell`    | the HTML is empty; a browser is required | 2 |
 * | `social_only` | a Facebook page, not a website | 0 (8 in med spa Dallas) |
 * | `ok`/`thin`   | read, but one page is too little to prove an absence | 15 |
 * | `probe_error` | **our** network, not their site | never, today — see below |
 *
 * So the screen gets the groups the data has. Inventing the artboard's three
 * would have meant folding "we broke" into "their site would not load".
 *
 * `timeout` and `probe_error` are in the table but do not reach this tab today.
 * `export_app_data.py` deliberately relabels both as `unread` rather than
 * couldn't-tell — *"saying 'couldn\'t tell' implies we looked and the site was
 * unclear. We did not look."* The groups stay here because the relabel is a
 * judgement that could reasonably be revisited, and because the upload path
 * judges its own reads without going through that export. A group with nothing
 * in it is not rendered.
 *
 * So the only `ours` group that fires on today\'s data is `needs_model`, and it
 * fires hard: it is the **entire** non-unread population of hvac Tampa\'s "does
 * commercial work" and med spa Dallas\'s "offers Botox" — 200 each.
 *
 * ## `ours` is the whole reason this is careful
 *
 * `CLAUDE.md`: *"Never blame the environment on the business. Our own proxy and
 * network failures are excluded from every measured rate, not counted as
 * unreadable sites."* The same rule has to hold on screen, or we are telling a
 * customer a business has a broken website when what broke was our crawler.
 * `probe_error` and `needs_model` are ours and say so in the first person.
 *
 * ## What is not in here
 *
 * `unread` — businesses nobody has opened yet. They are not a couldn't-tell:
 * there is no judgement to report, only work not done. They dominate every
 * market (2,960 of dental Phoenix's 3,126), and rolling them in would turn an
 * honest "we couldn't tell on 73" into a dishonest "we couldn't tell on 3,033".
 * `LeadResult.unread` carries them separately and the progress screen is where
 * they belong.
 */

/** Read outcomes, in the order the groups should appear: the ones that are
 *  about their site first, ours last, because a list that opens with our own
 *  excuses reads like a product making them. */
const GROUPS: Array<{
  id: string;
  outcomes: string[];
  headline: string;
  detail: string;
  ours: boolean;
}> = [
  {
    id: "blocked",
    outcomes: ["blocked"],
    headline: "Their site asked us not to read it",
    detail:
      "Their site publishes a note asking automated readers to stay out, or it turned us away at the door. We stopped rather than work around it.",
    ours: false,
  },
  {
    id: "dead",
    outcomes: ["dead"],
    headline: "The website in their listing is gone",
    detail:
      "The address does not resolve to anything any more. The business may well still be trading, the site is what is missing.",
    ours: false,
  },
  {
    id: "timeout",
    outcomes: ["timeout"],
    headline: "Their site did not answer in time",
    detail: "We waited, tried again later, and still got nothing back.",
    ours: false,
  },
  {
    id: "http_error",
    outcomes: ["http_error"],
    headline: "Their site answered with nothing we could read",
    detail: "The address is live, but the pages we asked for never came back.",
    ours: false,
  },
  {
    id: "js_shell",
    outcomes: ["js_shell"],
    headline: "Their page is empty until a browser runs it",
    detail:
      "The HTML we received had no words in it, the content is assembled in the visitor's browser. We read what a page sends, so there was nothing to read.",
    ours: false,
  },
  {
    id: "social_only",
    outcomes: ["social_only"],
    headline: "They have a social page, not a website",
    detail:
      "Their listing points at a profile on someone else's platform. There is no site of their own to read.",
    ours: false,
  },
  {
    id: "thin",
    outcomes: ["ok", "thin"],
    headline: "We read their site but not enough of it to be sure",
    detail:
      "One page is not proof that something is absent from the whole site. Rather than call it either way, we left it open.",
    ours: false,
  },
  {
    id: "needs_model",
    outcomes: [],
    headline: "Nobody has read the words on their page yet",
    detail:
      "This question needs the page text judged, and that judgement has not run. This one is on us, not on them, and it costs you nothing.",
    ours: true,
  },
  {
    id: "probe_error",
    outcomes: ["probe_error"],
    headline: "Our own read failed",
    detail:
      "Our request never completed, our network, not their site. We do not count this against the business and we will try again.",
    ours: true,
  },
];

export interface UnsureRow {
  id: string;
  name: string;
  town: string | null;
  domain: string | null;
  /** Pages we did open before giving up. Zero is common and honest. */
  pages: number;
}

export interface UnsureGroup {
  id: string;
  headline: string;
  detail: string;
  /** True when the reason is our failure, not theirs. Rendered in the first
   *  person so a customer never hears "their site is broken" about ours. */
  ours: boolean;
  count: number;
  /** A few named examples, so the group is checkable rather than a tally.
   *  These are never matches, so they are never charged for. */
  rows: UnsureRow[];
}

/** Verdicts that belong on the couldn't-tell tab. `unread` is deliberately
 *  absent — see the module note. */
const UNSURE: ReadonlySet<VerdictKind> = new Set<VerdictKind>([
  "couldnt_tell",
  "blocked",
  "needs_model",
]);

export function isUnsure(v: VerdictKind): boolean {
  return UNSURE.has(v);
}

export function unsureGroups(
  businesses: Business[],
  criterion: Criterion,
  opts: { examples?: number; town?: (addr: string) => string | null; host?: (site: string | null) => string | null } = {},
): UnsureGroup[] {
  const examples = opts.examples ?? 3;
  const buckets = new Map<string, UnsureRow[]>();

  for (const b of businesses) {
    const v = b.verdicts[criterion.id];
    if (!v || !isUnsure(v.verdict)) continue;

    const outcome = b.read?.outcome ?? null;
    // `needs_model` is the verdict, whatever the read did — the pages came back
    // fine and nothing judged them. Keying it on the read outcome instead would
    // scatter our own gap across six groups about their sites.
    const id =
      v.verdict === "needs_model"
        ? "needs_model"
        : (GROUPS.find((g) => outcome && g.outcomes.includes(outcome))?.id ?? "thin");

    const rows = buckets.get(id) ?? [];
    rows.push({
      id: b.id,
      name: b.name,
      town: opts.town?.(b.addr) ?? null,
      domain: opts.host?.(b.site) ?? null,
      pages: b.read?.pages ?? 0,
    });
    buckets.set(id, rows);
  }

  return GROUPS.filter((g) => buckets.has(g.id)).map((g) => {
    const rows = buckets.get(g.id)!;
    return {
      id: g.id,
      headline: g.headline,
      detail: g.detail,
      ours: g.ours,
      count: rows.length,
      rows: rows.slice(0, examples),
    };
  });
}

/** The sentence the honest block uses above the results. Separate from the
 *  groups because it has to survive being the only thing someone reads. */
export function unsureSentence(groups: UnsureGroup[], thing: string): string | null {
  const n = groups.reduce((a, g) => a + g.count, 0);
  if (n === 0) return null;
  const ours = groups.filter((g) => g.ours).reduce((a, g) => a + g.count, 0);
  const tail =
    ours === 0
      ? "Their sites don't settle it either way, so we left them out rather than guess."
      : ours === n
        ? "That is our gap, not theirs, the reading that would settle it has not run."
        : `${ours} of those are our own gap, not theirs.`;
  return `We couldn't tell on ${n} ${thing}. ${tail} You were not charged for any of them.`;
}
