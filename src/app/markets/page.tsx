import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { MarketingFooter, MarketingNav } from "@/components/MarketingChrome";
import MarketProof, { type MarketCard } from "@/components/MarketProof";
import { VERDICT_LABEL, type Market, type VerdictKind } from "@/lib/types";

/**
 * Markets — the finished reads.
 *
 * The market picker and its citation cards moved here from the home page on
 * 2026-09-26, with one exception the copy names: "a single real row stays on
 * the home page in block 2".
 *
 * Everything on this page is assembled from `public/data`, which is the whole
 * reason the picker survives the move intact. A page of examples is only worth
 * having if the examples are real, and these are the same files the product
 * serves.
 */

export const metadata = {
  title: "Markets we have read — Small Fish",
  description:
    "The markets read end to end, with every verdict and the page it came from.",
};

const SHOWN: { file: string; criterion: string; niche: string }[] = [
  { file: "dental-phoenix", criterion: "no_online_booking", niche: "Dental" },
  { file: "med-spa-dallas", criterion: "no_online_booking", niche: "Med spa" },
  { file: "hvac-tampa", criterion: "no_quote_form", niche: "HVAC" },
];

const host = (url: string | null) =>
  (url ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];

const READ_ON = "2026-09-22";

/** Same assembly as the home page used before the cut-down — including the
 *  guard against Overture's `website` field carrying somebody else's domain. */
async function proofCards(): Promise<MarketCard[]> {
  const cards: MarketCard[] = [];

  for (const s of SHOWN) {
    let market: Market;
    try {
      market = JSON.parse(
        await readFile(path.join(process.cwd(), "public", "data", `${s.file}.json`), "utf8"),
      ) as Market;
    } catch {
      continue;
    }

    const criterion = market.criteria.find((c) => c.id === s.criterion);
    if (!criterion) continue;

    const verdictOf = (b: (typeof market.businesses)[number]) =>
      (b.verdicts[s.criterion]?.verdict ?? "unread") as VerdictKind;

    const looksOwn = (name: string, site: string | null) => {
      const h = host(site).split(".")[0].replace(/[^a-z0-9]/gi, "").toLowerCase();
      const words = name
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      return !!h && words.some((w) => h.includes(w));
    };

    const pick = (kind: VerdictKind) =>
      market.businesses
        .filter((b) => verdictOf(b) === kind && b.site && b.read?.pages)
        .filter((b) => looksOwn(b.name, b.site))
        .sort((a, b) => (b.read?.pages ?? 0) - (a.read?.pages ?? 0))[0];

    const match = pick("match");
    const miss = pick("no_match");
    if (!match || !miss) continue;

    const judged = market.businesses.filter((b) => {
      const v = verdictOf(b);
      return v !== "unread" && v !== "needs_model";
    }).length;

    cards.push({
      key: s.file,
      niche: s.niche,
      metro: market.metro,
      judged,
      question: criterion.text,
      explain: criterion.explain,
      match: {
        name: match.name,
        evidence:
          match.verdicts[s.criterion]?.proof ?? match.verdicts[s.criterion]?.reason ?? "",
        source: `${host(match.site)} · read ${READ_ON}`,
        pages: match.read?.pages ?? 0,
      },
      miss: {
        name: miss.name,
        verdict: VERDICT_LABEL[verdictOf(miss)],
        reason: miss.verdicts[s.criterion]?.reason ?? "",
        plain:
          `We found what the search said should be missing, so "${criterion.text}" ` +
          `is not true of them. Nothing was charged.`,
        source: host(miss.site),
        pages: miss.read?.pages ?? 0,
      },
    });
  }

  return cards;
}

export default async function Markets() {
  const cards = await proofCards();

  return (
    <main className="mkt" style={{ background: "var(--paper)" }}>
      <MarketingNav />

      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 16 }}>
        <h1 className="dsp" style={{ fontSize: "clamp(34px,5vw,64px)", maxWidth: "20ch" }}>
          The markets we have read, end to end.
        </h1>
        <p className="lede" style={{ marginTop: 22, maxWidth: "58ch", color: "var(--ink-2)" }}>
          Every row in these came out of the business&rsquo;s own website. Pick
          one and see a match, a business that did not match, and the reason for
          each.
        </p>
      </div>

      {cards.length > 0 ? (
        <div style={{ paddingBottom: 72 }}>
          <MarketProof markets={cards} />
        </div>
      ) : (
        <p className="wrap lede" style={{ paddingBottom: 72, color: "var(--ink-2)" }}>
          The measured markets are not on this deployment, so there is nothing to
          show here rather than something made up.
        </p>
      )}

      <section className="wrap" style={{ paddingBottom: 96 }}>
        <div className="panel" style={{ maxWidth: "64ch" }}>
          <p className="lab" style={{ color: "var(--ink-3)" }}>What is not here</p>
          <p className="small" style={{ color: "var(--ink-2)", lineHeight: 1.65, marginTop: 10 }}>
            A fourth market — vet clinics in Columbus — was read, and neither of
            the things we asked about it could be settled on enough sites to be
            worth showing. It is left off rather than padded out, which is the
            same rule as everything else here.
          </p>
          <p className="small" style={{ color: "var(--ink-2)", lineHeight: 1.65, marginTop: 12 }}>
            Any other market works the same way — what you are looking for is
            read off the page, so nothing has to be built for a new one.{" "}
            <Link href="/how-we-check" style={{ textDecoration: "underline" }}>
              How we check
            </Link>
            .
          </p>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
