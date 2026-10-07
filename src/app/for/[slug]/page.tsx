import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingFooter, MarketingNav } from "@/components/MarketingChrome";
import { doorFor, nameFromSlug, signUpHref } from "@/lib/doors";

/**
 * The personal page: the door a cold email opens.
 *
 * `/for/northshore-digital?market=med-spa-dallas&sells=AI+receptionists`
 *
 * The GTM plan makes this the highest-converting door because it is the closest
 * to the reader's own market: the email says "38 med spas in Dallas still book
 * by phone", and this page says the same number, then proves it with three of
 * them in full — contacts, and the email we would open with.
 *
 * ## Three real businesses, and the wall
 *
 * The design's mock shows Lumen Med Spa, Still Water Aesthetics and Bishop Arts
 * Skin Studio with `555-` numbers. Those are invented, and this is the one page
 * where that would cost the most: its entire job is to prove to a stranger that
 * the rows are real. So the three are assembled from the measured market, and a
 * row is only shown if it has both a contact and a drafted email — a row with
 * nothing to send proves nothing.
 *
 * The rest are blurred, which is honest in a way a paywall usually is not: the
 * count is real, the three are real, and what is behind the blur is the same
 * kind of row.
 *
 * ## Only markets we have read
 *
 * A door for a market nobody has read cannot print a count, so `doorFor`
 * returns null and this 404s. Emailing a promise and landing somebody on an
 * invented number is the one failure this page must not have.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ market?: string }>;
}) {
  const [{ slug }, { market }] = await Promise.all([params, searchParams]);
  const door = await doorFor({ marketId: market, who: nameFromSlug(slug) });
  if (!door) return { title: "Small Fish" };
  return {
    title: `${door.fit} ${door.niche} in ${door.metro.split(",")[0]} with ${door.criterionText} | Small Fish`,
    description:
      `We read ${door.read} ${door.niche} websites in ${door.metro}. ` +
      `${door.fit} ${door.criterionPredicate}. Three of them, in full, with the email we would open with.`,
    // A page built for one prospect is not a page for Google.
    robots: { index: false, follow: false },
  };
}

export default async function DoorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ market?: string; sells?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const who = nameFromSlug(slug);
  const door = await doorFor({
    marketId: sp.market,
    who,
    sells: sp.sells ? sp.sells.slice(0, 80) : null,
  });
  if (!door) notFound();

  const href = signUpHref(door, `for/${slug}`);
  const city = door.metro.split(",")[0];

  return (
    <main className="mkt">
      <MarketingNav />

      <section className="wrap" style={{ paddingTop: "var(--s6)" }}>
        <p className="lab" style={{ color: "var(--lure-text)" }}>
          Made for {who}
          {door.sells && <> · you sell {door.sells}</>}
        </p>

        <h1 className="dsp h-sec" style={{ marginTop: 18, maxWidth: "17ch" }}>
          {door.fit} {door.niche} in {city} {door.criterionPredicate}.
        </h1>

        <p className="lede" style={{ marginTop: 20, maxWidth: "56ch", color: "var(--ink-2)" }}>
          {/* The honest version of the design's "we read all 612". We read 200
              of the sites that have one, and the count is of those. Saying the
              bigger number would be the overclaim this whole product argues
              against, on the page where a stranger decides whether to believe
              us. */}
          We read {door.read.toLocaleString()} {door.niche} websites in {city},
          one at a time. {door.fit} of them {door.criterionPredicate}. Three are
          below, with the email we would open with.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 26, alignItems: "center" }}>
          <Link className="cta" data-magnet href={href}>
            See all {door.fit}. Sign up free →
          </Link>
          <Link href="/how-we-check" className="sf-tap small" style={{ color: "var(--ink-3)", textDecoration: "underline", textUnderlineOffset: 3 }}>
            How we checked
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------ three, in full ---- */}
      <section className="wrap" style={{ paddingTop: "var(--s6)" }}>
        <div className="between" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16 }}>
          <p className="lab" style={{ color: "var(--ink-3)" }}>
            Three of the {door.fit}, in full
          </p>
          <p className="lab" style={{ color: "var(--ink-3)" }}>
            read on their own websites
          </p>
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          {door.shown.map((l) => (
            <div key={l.id} className="card" style={{ display: "grid", gridTemplateColumns: "1fr 300px" }} data-door-row>
              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 11, borderRight: "1px solid var(--line)" }}>
                <div>
                  <p className="dsp" style={{ fontSize: 23, fontWeight: 500 }}>{l.name}</p>
                  <p className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>{l.domain}</p>
                </div>
                <span
                  className="mono"
                  style={{
                    alignSelf: "flex-start",
                    fontSize: 12.5,
                    color: "var(--lure-text)",
                    background: "#e9f7b5",
                    padding: "5px 11px",
                    borderRadius: 999,
                  }}
                >
                  {l.why}
                </span>
                {l.message && (
                  <p className="cite" style={{ fontSize: 16.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
                    {l.message.split("\n\n").slice(1, 3).join(" ")}
                  </p>
                )}
              </div>
              <div style={{ padding: "20px 22px", background: "var(--paper-2)", display: "flex", flexDirection: "column", gap: 10 }}>
                <p className="lab" style={{ color: "var(--ink-3)" }}>Contacts</p>
                {l.phone && <span className="mono" style={{ fontSize: 13 }}>{l.phone}</span>}
                {l.email && <span className="mono" style={{ fontSize: 13 }}>{l.email}</span>}
                {l.site && (
                  <a href={l.site} target="_blank" rel="noopener noreferrer nofollow" className="mono" style={{ fontSize: 13, color: "var(--ink-3)" }}>
                    {l.domain}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- the wall --- */}
      {door.hidden > 0 && (
        <section className="wrap" style={{ paddingTop: "var(--s5)", position: "relative" }}>
          <div style={{ filter: "blur(5px)", opacity: 0.5, userSelect: "none" }} aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="card" style={{ height: 112, marginTop: 14, display: "grid", gridTemplateColumns: "1fr 300px" }}>
                <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12, borderRight: "1px solid var(--line)" }}>
                  <div style={{ width: 230 - i * 20, height: 20, background: "var(--fill)" }} />
                  <div style={{ width: 200, height: 12, background: "#e9f7b5" }} />
                  <div style={{ width: 430 - i * 25, height: 12, background: "var(--fill)" }} />
                </div>
                <div style={{ padding: "20px 22px", background: "var(--paper-2)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ width: 120, height: 11, background: "var(--fill)" }} />
                  <div style={{ width: 150, height: 11, background: "var(--fill)" }} />
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              textAlign: "center",
              padding: "0 20px",
            }}
          >
            <p className="dsp" style={{ fontSize: "clamp(22px,3vw,30px)" }}>
              {door.hidden} more, all with contacts and an email.
            </p>
            <Link className="cta" href={href}>
              See all {door.fit}. Sign up free →
            </Link>
            <p className="lab" style={{ color: "var(--ink-3)" }}>
              no card · takes 30 seconds · your market is already filled in
            </p>
          </div>
        </section>
      )}

      <MarketingFooter />
    </main>
  );
}
