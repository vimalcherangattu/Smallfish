import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import SearchBox from "@/components/SearchBox";
import { COST } from "@/lib/cost";
import { splitQuery } from "@/lib/query";
import { readsFor, resolveRegion, type Places, type Resolution } from "@/lib/region";
import type { MarketIndex } from "@/lib/types";

/**
 * The confirm screen: what we understood, what it will read, and what it costs
 * — before anything is spent.
 *
 * ## It shows the split back
 *
 * `query.ts` guesses where the business type ends and the place begins, and it
 * will sometimes be wrong ("Blinds in Motion installers"). A parser that is
 * silently wrong costs somebody a search they cannot see the cause of, so the
 * three fields are rendered back, editable, as the first thing on the page.
 * That is `docs/design-system.md` P1 — evidence is the interface — pointed at
 * the input rather than the output.
 *
 * ## Nothing is refused for being big
 *
 * "in Texas" and "across the US" both resolve. `region.ts` caps the read and
 * spreads it across the cities where the businesses actually are, and this page
 * says so in the same sentence as the number. A capped read presented as a
 * complete one is the same defect as a guessed verdict.
 *
 * ## And nothing is claimed that has not been read
 *
 * Four markets have been read end to end. Everything else resolves to a
 * perfectly valid search this deployment cannot yet run, and says which of the
 * two it is. "Not read yet" is a different sentence from "not recognised", and
 * the difference is the whole product.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Search — Small Fish" };

async function json<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", name), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}

const NICHE_WORDS: Record<string, RegExp> = {
  med_spa: /\b(med(ical)?[ -]?spas?|aesthetics?|botox)\b/i,
  dental: /\b(dental|dentists?|orthodont\w*)\b/i,
  hvac: /\b(hvac|heating|air ?conditioning|furnace)\b/i,
  veterinary: /\b(vets?|veterinar\w+|animal hospitals?)\b/i,
};

/** Does this search land on a market we have actually read? */
function readMarketFor(index: MarketIndex | null, what: string, where: string) {
  if (!index) return null;
  const niche = Object.entries(NICHE_WORDS).find(([, re]) => re.test(what))?.[0];
  if (!niche) return null;

  const candidates = index.markets.filter((m) => m.niche === niche);
  if (!candidates.length) return null;

  const city = where.split(",")[0].trim().toLowerCase();
  const market =
    candidates.find((m) => city && m.metro.toLowerCase().includes(city)) ?? candidates[0];

  // Only a criterion something actually settled. A market whose verdicts are
  // all `needs_model` has been listed, not read.
  const settled = market.criteria
    .map((c) => ({ c, matches: market.tallies?.[c.id]?.match ?? 0 }))
    .filter((x) => x.matches > 0)
    .sort((a, b) => b.matches - a.matches)[0];
  if (!settled) return null;

  const sameCity = !!city && market.metro.toLowerCase().includes(city);
  return { market, criterion: settled.c, matches: settled.matches, sameCity };
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="sf-label">{label}</p>
      <p
        className={`sf-h3 mt-1.5 ${muted ? "text-[var(--muted)]" : ""}`}
        style={{ fontWeight: muted ? 400 : 600 }}
      >
        {value}
      </p>
    </div>
  );
}

function RegionPlan({ r }: { r: Resolution }) {
  const reads = readsFor(r);
  return (
    <div className="sf-card mt-6 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="sf-h2">What this will read</p>
        <p className="sf-data text-[var(--muted)]">
          {reads.toLocaleString()} websites · about ${(reads * COST.measuredPerRead).toFixed(2)} of reading
        </p>
      </div>

      {r.note && (
        <p className="sf-body mt-3 max-w-[70ch] text-[var(--ink-2)]">{r.note}</p>
      )}

      {r.sampled && (
        <div className="mt-5">
          <p className="sf-label">Spread across</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {r.sample.map((c, i) => (
              <span
                key={`${c.name}-${c.state}`}
                className="sf-small rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1"
              >
                {c.name} <span className="sf-data text-[var(--muted)]">{r.perCity[i]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {r.narrowTo.length > 0 && (
        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <p className="sf-label">For a list you can work through, narrow to</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {r.narrowTo.map((c) => (
              <span key={`${c.name}-${c.state}`} className="sf-small text-[var(--lure-text)]">
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const split = splitQuery(q);
  const [places, index] = await Promise.all([
    json<Places>("places-us.json"),
    json<MarketIndex>("index.json"),
  ]);

  const region = places && split.where ? resolveRegion(places, split.where) : null;
  const hit = readMarketFor(index, split.what, split.where);
  // Counted, not typed. Four markets were read; three produced a criterion
  // anything settled, and a page that says "four" while the overview lists
  // three is the kind of small inconsistency that costs more trust than the
  // number is worth.
  const readCount = new Set(
    (index?.markets ?? [])
      .filter((m) => m.criteria.some((c) => (m.tallies?.[c.id]?.match ?? 0) > 0))
      .map((m) => m.id),
  ).size;

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-10 sm:px-10">
      <SearchBox initial={q} />

      {!q.trim() && (
        <p className="sf-body mt-10 text-[var(--muted)]">
          Type a trade, a place, and the one thing that decides whether a
          business is a fit.
        </p>
      )}

      {q.trim() && (
        <>
          {/* ------------------------------------------- what we understood -- */}
          <div className="sf-card mt-8 grid gap-6 p-6 sm:grid-cols-3">
            <Field label="Business type" value={split.what || "anything"} muted={!split.what} />
            <Field
              label="Where"
              value={region ? region.label : split.where || "anywhere"}
              muted={!region}
            />
            <Field
              label="What decides a fit"
              value={split.criterion || "not set — everything matches"}
              muted={!split.criterion}
            />
          </div>

          {/* A place we could not place. Said plainly, with what to do, and
              never widened into "everywhere" — reading all of America because
              somebody misspelt a city is the most expensive possible reading
              of a typo. */}
          {split.where && !region && (
            <p className="sf-body mt-4 max-w-[70ch] text-[var(--ink-2)]">
              We could not place <strong>{split.where}</strong>. US cities and
              states work, as do &ldquo;the US&rdquo; and a state on its own.
              We have not widened this to the whole country — that would be an
              expensive way to handle a typo.
            </p>
          )}

          {/* The plan is for a read that has not happened. On a market already
              read it would announce "1,000 websites, about $16.80 of reading"
              for work that is finished — a cost quoted for something nobody is
              about to buy. */}
          {region && !hit && <RegionPlan r={region} />}

          {/* -------------------------------------------------- the answer -- */}
          {hit ? (
            <div className="sf-card mt-6 p-6">
              <p className="sf-label">Read in full</p>
              <p className="sf-h1 mt-3">
                {hit.matches} matched in {hit.market.metro}.
              </p>
              <p className="sf-data mt-2 text-[var(--muted)]">
                {(hit.market.counts?.read ?? 0).toLocaleString()} websites read ·{" "}
                {hit.market.counts?.candidates?.toLocaleString() ?? "—"} businesses found
              </p>
              <p className="sf-body mt-3 max-w-[66ch] text-[var(--ink-2)]">
                This market has been read end to end, so every verdict carries
                the page it came from and the ones we could not judge are there
                with their reason.
                {!hit.sameCity && split.where && (
                  <>
                    {" "}
                    You asked for {split.where}; this is the {hit.market.metro}{" "}
                    read, which is the one that exists.
                  </>
                )}
              </p>
              <Link
                href={`/app/explore?market=${hit.market.id}&criterion=${hit.criterion.id}`}
                className="sf-btn-lure mt-6"
              >
                Open the {hit.matches} matches →
              </Link>
            </div>
          ) : (
            <div className="sf-card mt-6 p-6">
              <p className="sf-label">Not read yet</p>
              <p className="sf-h1 mt-3">
                We haven&rsquo;t read {split.what || "this"}
                {region ? ` in ${region.label}` : ""} yet.
              </p>
              <p className="sf-body mt-3 max-w-[70ch] text-[var(--ink-2)]">
                This is a perfectly ordinary search — the engine reads what
                you&rsquo;re looking for off the page, so an unfamiliar trade
                needs no work from us and no catalogue. What it needs is a read,
                and reading a market cold is the part still being switched on.
                We would rather say that than show you a number with nothing
                behind it.
              </p>
              <p className="sf-small mt-4 text-[var(--muted)]">
                {readCount} markets are read in full today, and they run on the
                same engine yours will.
              </p>
              <Link href="/app" className="sf-btn mt-6">
                See what is read →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
