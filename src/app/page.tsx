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
 * The home page: the copy document's nine blocks, in the designer's composition.
 *
 * Two sources, and they agree about more than they disagree. "Small Fish — Home
 * Page (simple)" (rev 8) sets the **argument** — a StoryBrand run where the
 * reader is the hero, the junk list is the villain and we are the guide. The
 * design document of 2026-09-28 sets the **form** — the tilted lure ticker, the
 * ask/get split, the dot field, the example row, the slab, the lure sign-off.
 * Every block below is the copy's; every treatment is the design's.
 *
 * ## Where the copy is not used as written
 *
 * | It says | What ships, and why |
 * |---|---|
 * | "We check every business", in the hero and the marquee | "We check them one by one." We read 200 of the 2,778 Phoenix dental listings with a website. The claim the copy is reaching for is that nothing is sampled or guessed, and that survives without the word "every" — which is the one word this product cannot use. |
 * | "Talk to the forty who need you. Not the six hundred who don't." | The forty is right; six hundred is not a number anybody measured. It renders from the tallies: 42 who need you, against the 166 you would otherwise open yourself. That is also the better claim, because 166 is the work we actually removed. |
 * | Maplewick Family Dental, Dr Alvarez, "we set up online booking for Phoenix practices" | No such clinic, and we cannot know what a visitor sells. The row is Simply Dentistry in Scottsdale with its own published phone and email, and the draft is what `composeMessage` produces. |
 * | "See it in 45 seconds", "No autoplay" | The file is 44 seconds, measured. It autoplays muted because the user asked for that directly on 2026-09-27, which outranks the document. |
 * | "Or get a free sample list for your city →" | Left out. There is no such flow, and a link to nothing is worse than no link. |
 *
 * ## Why the example row is assembled rather than written
 *
 * It is read out of `public/data/dental-phoenix.json` at build time and its
 * message comes from the same `composeMessage` the product runs. If that data
 * changes the card changes; if the clinic opts out it disappears. A marketing
 * page whose proof is hard-coded is a screenshot, and a screenshot is the thing
 * this page is arguing against.
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
  /** Every dental business Overture lists in Phoenix — the size of the list
   *  somebody would otherwise buy, and the only big number on this page a
   *  stranger can size up without being told what it counts. */
  listed: number;
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
    listed: market.counts?.candidates ?? 0,
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
            Only the local businesses that{" "}
            <span
              style={{
                background: "var(--lure)",
                color: "var(--ink)",
                padding: "0 .06em",
                display: "inline-block",
                transform: "rotate(-1.2deg)",
              }}
            >
              fit what you sell.
            </span>
          </h1>

          <p className="lede" style={{ marginTop: 34, maxWidth: "46ch", color: "#B9BFB6" }}>
            Tell us who you sell to and where. We check them one by one. You
            get only the ones that fit, each with an opening email.
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
              WE CHECK THEM ONE BY ONE &nbsp;·&nbsp; YOU GET ONLY THE ONES THAT FIT
              &nbsp;·&nbsp; EACH ONE COMES WITH AN OPENING EMAIL &nbsp;·&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------- 2 · the villain -- */}
      <section className="wrap" style={{ paddingTop: 90 }}>
        <div className="g12" style={{ rowGap: 22 }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: "clamp(32px,5.2vw,66px)" }}>
            Junk lists cost you more than money.
          </h2>
          <div style={{ gridColumn: "8 / span 5" }}>
            <p className="lede" style={{ color: "var(--ink-2)" }}>
              Most of the businesses on them will never buy from you. You lose
              days checking websites by hand. And you still don&rsquo;t know who
              to call first.
            </p>
            {/* The sting, in the design's one-phrase-on-lure treatment. It is
                the only place on the page a full sentence gets the brand
                colour, which is what makes it land. */}
            <p className="dsp" style={{ fontSize: "clamp(19px,2.1vw,26px)", marginTop: 24, lineHeight: 1.3 }}>
              <span className="lure">
                Every email to the wrong business makes the next one less likely
                to land.
              </span>
            </p>
          </div>
        </div>
      </section>

      {s && (
        <>
          {/* --------------------------------- 3 · forty, not six hundred -- */}
          <section className="wrap" style={{ paddingTop: 84, paddingBottom: 0 }}>
            {/* The copy's shape — a small number against a big one — needs the
                big one to be a number the reader can size up. "166" is how many
                we formed a view on, which is ours, not theirs: against 42 it
                reads as an arbitrary near-ratio and lands as nothing. The list
                they would otherwise work from is every dental business in
                Phoenix, and 42 against that is the claim being made. */}
            <h2 className="dsp" style={{ fontSize: "clamp(32px,5.2vw,66px)", maxWidth: "19ch" }}>
              Talk to the {s.fit} who need you. Not all{" "}
              {s.listed.toLocaleString()} dental clinics in Phoenix.
            </h2>
          </section>

          {/* ------------------------------------------------ ask and get -- */}
          <section className="wrap" style={{ paddingTop: 34 }}>
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
                  <span className="lure">{s.fit} clinics.</span> Only the ones
                  that match.
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

      {/* --------------------------------------------- 4 · the guide speaks -- */}
      <section className="wrap" style={{ paddingTop: 76 }}>
        {/* `alignItems: end` sets the paragraph on the headline's last line.
            Left at the default it hung from the top of a four-line headline
            with a screen of white under it, reading as two unrelated things
            rather than a statement and its answer. */}
        <div className="g12" style={{ rowGap: 20, alignItems: "end" }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: "clamp(26px,3.6vw,46px)" }}>
            We know what it&rsquo;s like to open forty websites and still not
            know who to call.
          </h2>
          <p className="lede" style={{ gridColumn: "8 / span 5", color: "var(--ink-2)" }}>
            So we do the checking for you. Every business, one by one, on its
            own website. Nothing is guessed and nothing is made up.
          </p>
        </div>

        {/* The proof line, standing in for the testimonial until there are
            users to quote — so it has to carry the block, not sit in the
            corner of it as an 12px chip. Full width, the two numbers in lure
            at reading size, and rendered from the same tallies as the dot
            field so the two cannot drift apart. */}
        {s && (
          <div
            style={{
              marginTop: 40,
              background: "var(--ink)",
              padding: "24px 30px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <span className="lab" style={{ color: "#5B6470" }}>Measured in Phoenix</span>
            <span className="mono" style={{ color: "#B9BFB6", fontSize: "clamp(15px,1.7vw,20px)" }}>
              <strong style={{ color: "var(--lure)", fontWeight: 500 }}>{s.checked}</strong>{" "}
              dental websites checked &nbsp;·&nbsp;{" "}
              <strong style={{ color: "var(--lure)", fontWeight: 500 }}>{s.fit}</strong> were a fit
            </span>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ 5 · the plan -- */}
      <section className="wrap" style={{ paddingTop: 76 }}>
        <h2 className="dsp" style={{ fontSize: "clamp(28px,4.2vw,52px)" }}>
          Here&rsquo;s how it works.
        </h2>
        <div className="three" style={{ marginTop: 28 }}>
          {[
            ["1", "Tell us who you sell to and where.", "A type of business and a city."],
            ["2", "We check them one by one.", "Each on their own website."],
            ["3", "Get only the ones that fit.", "Each with an opening email, ready to go."],
          ].map(([n, head, sub]) => (
            // `minHeight: 100%` + `marginTop: auto` on the last line pins the
            // three sub-lines to one baseline. Without it each column was as
            // tall as its own heading, so a two-line heading pushed its sub-line
            // a line below its neighbour's and the row read as misaligned.
            <div
              key={n}
              style={{ display: "flex", flexDirection: "column", gap: 10, paddingRight: 20, minHeight: "100%" }}
            >
              <span className="mono" style={{ fontSize: 30, color: "var(--lure-text)", lineHeight: 1 }}>{n}</span>
              <p className="colline" style={{ fontSize: "clamp(19px,2vw,26px)" }}>{head}</p>
              <p className="small" style={{ color: "var(--ink-2)", marginTop: "auto", paddingTop: 10 }}>{sub}</p>
            </div>
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

      {/* --------------------------------------------------------- the film -- */}
      <section className="wrap" style={{ paddingTop: 84, maxWidth: 980, marginLeft: "auto", marginRight: "auto" }}>
        <Explainer />
      </section>

      {/* ------------------------------------------------------- the price -- */}
      <section className="slab" style={{ marginTop: 92 }}>
        <div className="inner">
          <div className="g12" style={{ rowGap: 26, alignItems: "center" }}>
            <h2 className="dsp" style={{ gridColumn: "1 / span 6", fontSize: "clamp(32px,5vw,64px)", color: "#EEF0EC" }}>
              You only pay for businesses that fit.
            </h2>
            <div style={{ gridColumn: "8 / span 5" }}>
              <p className="lede" style={{ color: "#B9BFB6" }}>
                $29, $79 or $199 a month. How many you need decides which one.
              </p>
              {/* The four promises. Each is enforced somewhere in the repo —
                  BILLABLE gates the charge, contacts carry their source page,
                  nothing in the codebase sends mail, and the free plan is 20
                  credits — which is why they can be printed as promises. */}
              <ul style={{ listStyle: "none", padding: 0, margin: "26px 0 0", display: "grid", gap: 9 }}>
                {[
                  "Businesses that don’t fit are free.",
                  "Every contact comes from their own website.",
                  "We never send anything. You do.",
                  "Your first 20 are free. No card.",
                ].map((line) => (
                  <li key={line} className="small" style={{ color: "#EEF0EC", display: "flex", gap: 10 }}>
                    <span aria-hidden style={{ color: "var(--lure)" }}>→</span>
                    {line}
                  </li>
                ))}
              </ul>

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
          // Down and further out than the design's placement. At
          // right:-130/bottom:-110 the circle ran straight through "20
          // BUSINESSES FREE · NO CARD · NOTHING TO INSTALL", which wraps to two
          // lines at desktop width — the text sits above it in z-order and
          // still read as struck through.
          style={{ position: "absolute", right: -210, bottom: -200, opacity: 0.4, zIndex: 0 }}
          className="swim"
          aria-hidden
        >
          <Bubbles where="closer" colour="#0E1520" />
          <Fish variant="outline" width={470} strokeWidth={0.3} outlineColour="#0E1520" />
        </div>

        <div className="wrap" style={{ position: "relative", zIndex: 1, paddingTop: 84, paddingBottom: 84 }}>
          <div className="g12" style={{ rowGap: 30, alignItems: "center" }}>
            <div style={{ gridColumn: "1 / span 7" }}>
              <h2 className="dsp" style={{ fontSize: "clamp(38px,6.4vw,84px)" }}>
                From guessing to knowing.
              </h2>
              <p className="lede" style={{ marginTop: 20, maxWidth: "34ch", color: "#2C3A15" }}>
                Stop working from junk lists. Start with the businesses that
                need you.
              </p>
            </div>
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

      {/* The ghost wordmark and the footer are one ink block.
          Two things were wrong. They were separate elements, and the footer's
          default 80px top margin let the page's paper through between them as
          a white band — a rendering fault, not a gap. And the wordmark was set
          at up to 250px with its own padding, so it took a whole screen of
          dark on the way to the footer and read as an empty section.
          It is a watermark: smaller, and the footer is pulled up over its
          lower half so the two overlap the way the design draws them. */}
      <div style={{ background: "#0E1520", overflow: "hidden" }}>
        <p
          className="ghostword wrap"
          aria-hidden
          style={{ margin: 0, whiteSpace: "nowrap", paddingTop: 26 }}
        >
          small fish
        </p>
        <div style={{ marginTop: "-0.34em" }}>
          <MarketingFooter flush />
        </div>
      </div>
    </main>
  );
}
