import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Explainer from "@/components/Explainer";
import Bubbles from "@/components/Bubbles";
import Fish from "@/components/Fish";
import School from "@/components/School";
import { MarketingFooter, MarketingNav } from "@/components/MarketingChrome";
import { CTA_HREF, CTA_LABEL, CTA_NOTE, CTA_NOTE_LONG } from "@/lib/launch";
import { composeMessage, host, prettyPhone } from "@/lib/leads";
import type { Market, VerdictKind } from "@/lib/types";

/**
 * The home page, built from the designer's composition of 2026-09-28.
 *
 * ## What was adopted, and what was corrected
 *
 * The layout, the type, the tilted bands, the dot field, the example row and
 * every word of structure are the design's. Four **numbers and names** in it
 * were not measurements, and each one is replaced here by what the repository
 * can actually show. This is the fourth design document in a row to arrive
 * with invented data in the example card, which is why `test_home_copy.mjs`
 * checks the rendered HTML rather than trusting anybody's good intentions —
 * including mine.
 *
 * | The design said | What is true |
 * |---|---|
 * | "42 clinics. Not 600." with "558 that don't, checked and left out" | 42 is right. 600 and 558 are invented: we formed a view on **166** dental sites in Phoenix — 42 fit, 51 did not, 73 we could not tell. |
 * | "We look at every website" | We read 200 of the 2,778 Phoenix dental listings that have one. "Every" is the one word this product cannot use. |
 * | Maplewick Family Dental, Dr Alvarez, (602) 555-0148, hello@maplewickdental.com | No such clinic. The card now shows **Simply Dentistry** in Scottsdale, with the phone and address published on their own site. |
 * | An opening email offering to "set up online booking for Phoenix practices" | We do not know what a visitor sells until they tell us, so we cannot write that. The card shows the draft the product actually produces, from evidence. |
 *
 * ## Why the example row is assembled rather than written
 *
 * It is read out of `public/data/dental-phoenix.json` at build time and its
 * message comes from the same `composeMessage` the product runs. If that data
 * changes the card changes; if the clinic opts out it disappears. A marketing
 * page whose proof is hard-coded is a screenshot, and a screenshot is the
 * thing this page is arguing against.
 */

export const metadata = {
  title: "Small Fish — find the local businesses that fit what you sell",
  description:
    "Tell us the type of business and the city. We read their websites one by " +
    "one and send back only the ones that fit, each with an opening email. " +
    "20 businesses free, no card.",
};

/** The market the example block is built from. */
const SHOWCASE = { file: "dental-phoenix", criterion: "no_online_booking" };
/** The clinic in the example card: real, readable, and published its own
 *  contact details. Named here so a data change that removes it fails the
 *  copy test loudly instead of silently dropping the card. */
const SHOWCASE_BUSINESS = "Simply Dentistry";

const TRADES = [
  "dentists", "salons", "plumbers", "garages",
  "gyms", "law firms", "shops", "clinics",
];

interface Showcase {
  ask: string;
  fit: number;
  notFit: number;
  unclear: number;
  checked: number;
  name: string;
  city: string;
  phone: string | null;
  email: string | null;
  domain: string | null;
  message: string | null;
}

async function showcase(): Promise<Showcase | null> {
  let market: Market;
  try {
    market = JSON.parse(
      await readFile(
        path.join(process.cwd(), "public", "data", `${SHOWCASE.file}.json`),
        "utf8",
      ),
    ) as Market;
  } catch {
    return null;
  }

  const criterion = market.criteria.find((c) => c.id === SHOWCASE.criterion);
  if (!criterion) return null;

  const t = market.tallies?.[SHOWCASE.criterion] ?? {};
  const n = (k: VerdictKind) => (t as Record<string, number>)[k] ?? 0;
  const fit = n("match");
  const notFit = n("no_match");
  // A site that blocked us and a site we read but could not settle are the same
  // thing to a customer: we will not claim either way, and neither is billed.
  const unclear = n("couldnt_tell") + n("blocked");

  const b = market.businesses.find((x) => x.name === SHOWCASE_BUSINESS);
  if (!b) return null;

  let contacts: Record<string, { emails?: { value: string }[]; phones?: { value: string }[]; withheld?: string | null }> = {};
  try {
    contacts = JSON.parse(
      await readFile(
        path.join(process.cwd(), "public", "data", `contacts-${SHOWCASE.file}.json`),
        "utf8",
      ),
    ).contacts;
  } catch {
    contacts = {};
  }
  const c = contacts[b.id] ?? {};
  const usable = !c.withheld;

  return {
    ask: `Dental clinics in Phoenix that ${criterion.text.replace(/^has no/, "don’t have")}.`,
    fit,
    notFit,
    unclear,
    checked: fit + notFit + unclear,
    name: b.name,
    city: b.addr.split(",").slice(-2).join(",").trim(),
    phone: prettyPhone((usable ? c.phones?.[0]?.value : null) ?? b.phone ?? null),
    email: (usable ? c.emails?.[0]?.value : null) ?? null,
    domain: host(b.site),
    message: composeMessage(b, criterion),
  };
}

/** The dot field: one dot per business we formed a view on, in the order the
 *  data happens to sit, so the greens are scattered rather than arranged. */
function Dots({ fit, notFit, unclear }: { fit: number; notFit: number; unclear: number }) {
  const total = fit + notFit + unclear;
  const cols = 38;
  const rows = Math.ceil(total / cols);
  // A fixed shuffle, not `Math.random()`: this renders on the server and again
  // in the browser, and a different arrangement between the two is a hydration
  // mismatch. Deterministic from the index, so both agree.
  const kind = (i: number) => {
    const h = (i * 7919) % total;
    if (h < fit) return "fit";
    if (h < fit + notFit) return "no";
    return "unclear";
  };
  const colour = { fit: "var(--lure)", no: "#D5D9D2", unclear: "#E6E1CC" } as const;

  return (
    <svg
      viewBox={`0 0 ${cols * 16} ${rows * 16}`}
      width="100%"
      role="img"
      aria-label={`${total} businesses checked: ${fit} fit, ${notFit} did not, ${unclear} could not be told either way`}
      style={{ display: "block" }}
    >
      {Array.from({ length: total }, (_, i) => (
        <circle
          key={i}
          cx={(i % cols) * 16 + 8}
          cy={Math.floor(i / cols) * 16 + 8}
          r={4}
          fill={colour[kind(i)]}
        />
      ))}
    </svg>
  );
}

export default async function Home() {
  const s = await showcase();

  return (
    <main className="mkt">
      {/* ------------------------------------------------------------ hero -- */}
      <section style={{ background: "var(--ink)", color: "var(--paper)", position: "relative", overflow: "hidden", paddingBottom: 30 }}>
        <MarketingNav dark />

        <div className="wrap" style={{ position: "relative", zIndex: 1, paddingTop: 22, paddingBottom: 40 }}>
          <h1
            className="dsp"
            style={{ fontSize: "clamp(44px,8.6vw,124px)", maxWidth: "15ch", color: "#EEF0EC" }}
          >
            We find the local businesses that are{" "}
            <span
              style={{
                background: "var(--lure)",
                color: "var(--ink)",
                padding: "0 .06em",
                display: "inline-block",
                transform: "rotate(-1.2deg)",
              }}
            >
              right for what you sell.
            </span>
          </h1>

          <p className="lede" style={{ marginTop: 34, maxWidth: "46ch", color: "#B9BFB6" }}>
            Tell us the type of business and the city. We read their websites
            one by one. You get only the ones that fit, each with an opening
            email written for that business.
          </p>

          <div style={{ marginTop: 30 }}>
            <Link className="cta" href={CTA_HREF}>{CTA_LABEL}</Link>
            <p className="lab" style={{ marginTop: 14, color: "#8A929B" }}>{CTA_NOTE}</p>
          </div>
        </div>

        {/* The school drifting behind the headline. Sits first and lowest so
            the nav and the type stay above it — everything after this in the
            hero carries `zIndex: 1`. */}
        <div
          style={{ position: "absolute", left: -80, top: 0, width: 1600, opacity: 0.55, zIndex: 0 }}
          className="schoolmove"
          aria-hidden
        >
          <School width={1600} height={620} />
        </div>

        {/* The mark, and its bubbles.
            `Bubbles` is positioned in percentages of *this* container, so it
            has to live inside it — rendering it as a sibling puts six circles
            in the top-left corner of the page. And the mark is the outline
            variant: the design draws it as a line, and a solid lure fish that
            size becomes the loudest thing on the screen, louder than the
            headline it sits behind. */}
        <div className="hero-fish swim" aria-hidden>
          <Fish variant="outline" width={720} strokeWidth={0.35} />
          <Bubbles where="hero" />
        </div>
      </section>

      {/* The ticker. "We look at every website" was the design's line and is the
          one claim this product may not make — we read 200 of Phoenix's 2,778.
          The promise that survives is the one we keep. */}
      <div className="band band-lure" style={{ marginTop: 48 }}>
        <div className="mq lab" style={{ fontSize: 12 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i}>
              WE READ THEIR WEBSITES &nbsp;·&nbsp; YOU GET ONLY THE ONES THAT FIT
              &nbsp;·&nbsp; EACH ONE COMES WITH AN OPENING EMAIL &nbsp;·&nbsp;
            </span>
          ))}
        </div>
      </div>

      {s && (
        <>
          {/* ------------------------------------------------ ask and get -- */}
          <section className="wrap" style={{ paddingTop: 76 }}>
            <div className="askget">
              <div className="ask">
                <p className="lab" style={{ color: "var(--ink-3)" }}>You ask for</p>
                <p className="dsp" style={{ fontSize: "clamp(24px,3.2vw,38px)", marginTop: 16, lineHeight: 1.15 }}>
                  {s.ask}
                </p>
              </div>
              <div className="get">
                <p className="lab" style={{ color: "var(--lure-text)" }}>You get</p>
                <p className="dsp" style={{ fontSize: "clamp(24px,3.2vw,38px)", marginTop: 16, lineHeight: 1.15 }}>
                  <span className="lure">{s.fit} clinics.</span> Not {s.checked}. Only
                  the ones that match.
                </p>
              </div>
            </div>

            {/* The field, and the third colour the design did not have. A
                product that only shows fit and not-fit is claiming it always
                knows; 73 of these we could not settle, and saying so is the
                whole argument. */}
            <div className="card" style={{ marginTop: 26, padding: "32px 36px 26px" }}>
              <Dots fit={s.fit} notFit={s.notFit} unclear={s.unclear} />
              <div className="dotkey">
                <span><i style={{ background: "var(--lure)" }} />{s.fit} that fit</span>
                <span><i style={{ background: "#D5D9D2" }} />{s.notFit} that don&rsquo;t</span>
                <span><i style={{ background: "#E6E1CC" }} />{s.unclear} we couldn&rsquo;t tell, never billed</span>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------- the one row -- */}
          <section className="wrap" style={{ paddingTop: 44 }}>
            <div className="card lift" style={{ boxShadow: "0 30px 60px rgba(14,21,32,.08)", overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 32,
                  padding: "32px 38px 26px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div>
                  <p className="dsp" style={{ fontSize: "clamp(26px,3vw,34px)" }}>{s.name}</p>
                  <p className="mono" style={{ marginTop: 8, fontSize: 13, color: "var(--ink-3)" }}>{s.city}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, textAlign: "right", fontSize: 15, color: "var(--ink-2)" }}>
                  {s.phone && <span className="mono">{s.phone}</span>}
                  {s.email && <span className="mono">{s.email}</span>}
                  {s.domain && <span className="mono">{s.domain}</span>}
                </div>
              </div>

              {s.message && (
                <div style={{ padding: "28px 38px 34px", background: "var(--paper-2)" }}>
                  <p className="lab" style={{ color: "var(--lure-text)" }}>Your opening email</p>
                  <p className="cite" style={{ fontSize: 21, lineHeight: 1.55, marginTop: 14, maxWidth: "62ch" }}>
                    {s.message}
                  </p>
                </div>
              )}
            </div>
            <p className="small" style={{ marginTop: 14, color: "var(--ink-3)" }}>
              Written from what is on their site, not from a template. You edit
              it and send it from your own inbox — we never send anything.
            </p>
          </section>
        </>
      )}

      {/* ------------------------------------------------- what you get ----- */}
      <section className="wrap" style={{ paddingTop: 80 }}>
        <div>
          {[
            "Only the businesses that fit. Nothing else in the list.",
            "Their phone, email and website, taken from their own site.",
            "An opening email for each one, written for that business.",
            "A file you can download and use today.",
          ].map((line) => (
            <p key={line} className="getline">{line}</p>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ any trade, any city */}
      <section className="wrap" style={{ paddingTop: 84 }}>
        <div className="g12" style={{ rowGap: 20 }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 6", fontSize: "clamp(32px,5vw,62px)" }}>
            Any local business. Any city in the US.
          </h2>
          {/* The design's line stopped at the promise. Ours names what is
              finished, because a stranger who signs up today gets the three
              markets that are read — not every city in America. */}
          <p className="lede" style={{ gridColumn: "8 / span 5", color: "var(--ink-2)" }}>
            Nothing has to be built for a new trade — what you are looking for
            is read off the page. Three cities are read in full today. Tell us
            yours when you sign up and it goes next.
          </p>
        </div>
      </section>

      <div className="band band-paper" style={{ marginTop: 40 }}>
        <div className="mq dsp" style={{ fontSize: "clamp(34px,6vw,76px)" }}>
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i}>
              {TRADES.map((t) => (
                <span key={t} style={{ marginRight: "0.5em" }}>{t}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ the alternatives -- */}
      <section className="wrap" style={{ paddingTop: 84 }}>
        <div className="three">
          {[
            ["Lists you buy", "The rows are old. Most of them are wrong for you."],
            ["Scraping it yourself", "You get names. You still have to check every one."],
            ["Hiring someone", "It takes days and costs more."],
          ].map(([label, line]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 12, paddingRight: 16 }}>
              <p className="lab" style={{ color: "var(--ink-3)" }}>{label}</p>
              <p className="colline">{line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- the film -- */}
      <section className="wrap" style={{ paddingTop: 84, maxWidth: 980, marginLeft: "auto", marginRight: "auto" }}>
        <Explainer />
      </section>

      {/* ------------------------------------------------------- the price -- */}
      <section className="slab" style={{ marginTop: 92 }}>
        <div className="inner">
          <div className="g12" style={{ rowGap: 26, alignItems: "center" }}>
            <h2 className="dsp" style={{ gridColumn: "1 / span 6", fontSize: "clamp(32px,5vw,64px)", color: "#EEF0EC" }}>
              You pay only for the businesses that fit.
            </h2>
            <div style={{ gridColumn: "8 / span 5" }}>
              <p className="lede" style={{ color: "#B9BFB6" }}>
                $29, $79 or $199 a month. How many you need decides which one.
                Businesses that don&rsquo;t fit are free, and so are the ones we
                couldn&rsquo;t tell about.
              </p>
              <Link
                href="/pricing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 22,
                  color: "var(--lure)",
                  fontWeight: 500,
                  borderBottom: "1px solid rgba(200,240,60,.45)",
                  paddingBottom: 3,
                }}
              >
                See pricing →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- sign-off --- */}
      <section className="signoff">
        {/* Its own mark, drawn in ink rather than lure because the panel is
            already lure. Bubbles inside the same positioned box, for the same
            reason as the hero's. */}
        <div
          style={{ position: "absolute", right: -130, bottom: -110, opacity: 0.45, zIndex: 0 }}
          className="swim"
          aria-hidden
        >
          <Bubbles where="closer" colour="#0E1520" />
          <Fish variant="outline" width={520} strokeWidth={0.3} outlineColour="#0E1520" />
        </div>

        <div className="wrap" style={{ position: "relative", zIndex: 1, paddingTop: 84, paddingBottom: 84 }}>
          <div className="g12" style={{ rowGap: 30, alignItems: "center" }}>
            <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: "clamp(38px,6.4vw,84px)" }}>
              Try it on your own city.
            </h2>
            <div style={{ gridColumn: "9 / span 4" }}>
              <Link
                className="cta"
                href={CTA_HREF}
                style={{ background: "var(--ink)", color: "var(--lure)" }}
              >
                {CTA_LABEL}
              </Link>
              <p className="lab" style={{ marginTop: 14, color: "#4A6508" }}>{CTA_NOTE_LONG}</p>
            </div>
          </div>
        </div>
      </section>

      {/* The ghost wordmark the design puts above the footer, sitting on the
          footer's own ink so the two read as one block. */}
      <div style={{ background: "#0E1520", overflow: "hidden", paddingTop: 34 }} aria-hidden>
        <p className="ghostword wrap" style={{ margin: 0, whiteSpace: "nowrap" }}>small fish</p>
      </div>

      <MarketingFooter />
    </main>
  );
}
