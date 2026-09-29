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

const CMS_NAME: Record<string, string> = {
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  shopify: "Shopify",
  webflow: "Webflow",
  godaddy_website_builder: "GoDaddy",
};

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
  /** Listings with no website at all — nothing to read, and a bought list
   *  carries them anyway. */
  noSite: number;
  /** Listings sharing a domain with another listing: chains and platform
   *  pages, where nothing published can be attributed to one location. */
  sharedRows: number;
  worstDomain: string;
  worstDomainRows: number;
  blocked: number;
  couldntTell: number;
  /** The second real business in the junk list's "keep" rows. */
  keep2: string;
  name: string;
  city: string;
  phone: string | null;
  email: string | null;
  domain: string | null;
  message: string | null;
  pagesRead: number;
  cms: string | null;
  address: string;
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

  // The junk-list block's rejection reasons, counted rather than imagined.
  // The design shipped eight named clinics — "Cedar Point Dental · closed in
  // 2024", "Sonoran Smile Co · email bounced" — and seven of the eight names
  // are in no data file we hold. Publishing a trading claim like that about a
  // business that may well exist is the one invention on this page that could
  // do somebody real harm, so the rows are the real categories instead.
  const domains = new Map<string, number>();
  for (const x of market.businesses) {
    const h = host(x.site);
    if (h) domains.set(h, (domains.get(h) ?? 0) + 1);
  }
  let worstDomain = "";
  let worstDomainRows = 0;
  let sharedRows = 0;
  for (const [d, n2] of domains) {
    if (n2 > 1) sharedRows += n2;
    if (n2 > worstDomainRows) {
      worstDomainRows = n2;
      worstDomain = d;
    }
  }

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
    noSite: (market.counts?.candidates ?? 0) - (market.counts?.withSite ?? 0),
    sharedRows,
    worstDomain,
    worstDomainRows,
    blocked: n("blocked"),
    couldntTell: n("couldnt_tell"),
    keep2:
      market.businesses.find(
        (x) =>
          x.name !== SHOWCASE_BUSINESS &&
          x.verdicts[SHOWCASE.criterion]?.verdict === "match" &&
          !contacts[x.id]?.withheld &&
          (contacts[x.id]?.emails?.length ?? 0) > 0,
      )?.name ?? "",
    name: b.name,
    city: b.addr.split(",").slice(-2).join(",").trim(),
    phone: prettyPhone((usable ? c.phones?.[0]?.value : null) ?? b.phone ?? null),
    email: (usable ? c.emails?.[0]?.value : null) ?? null,
    domain: host(b.site),
    message: composeMessage(b, criterion),
    pagesRead: b.read?.pages ?? 0,
    cms: b.read?.cms?.[0] ?? null,
    address: b.addr,
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
      <section className="wrap tight">
        <p className="lab eyebrow">What a bought list actually costs</p>
        <div className="g12" style={{ rowGap: "var(--s3)" }}>
          <h2 className="dsp h-sec" style={{ gridColumn: "1 / span 7" }}>
            Junk lists cost you more than money.
          </h2>
          <div style={{ gridColumn: "8 / span 5" }}>
            <p className="lede" style={{ color: "var(--ink-2)" }}>
              Most of the businesses on them will never buy from you. You lose
              days checking websites by hand. And you still don&rsquo;t know who
              to call first.
            </p>
            <p className="dsp" style={{ fontSize: "clamp(18px,2vw,25px)", marginTop: "var(--s3)", lineHeight: 1.3 }}>
              <span className="lure">
                Every email to the wrong business makes the next one less likely
                to land.
              </span>
            </p>
          </div>
        </div>

        {s && (
          <>
            {/* Eight rows off a list you would pay for.
                The design named eight clinics and gave each a trading claim —
                "closed in 2024", "email bounced". Seven of the eight names are
                in no file we hold, and a false claim of that kind about a real
                business is the one invention here that could do harm. So these
                are the categories, each with its own measured count from the
                3,126 dental listings Overture has for Phoenix, and the two
                keepers are businesses we actually read. */}
            <div className="junk">
              {[
                [`${s.noSite.toLocaleString()} rows`, "no website at all — nothing to check"],
                [`${s.sharedRows.toLocaleString()} rows`, "share a domain with another listing"],
                // Nested under the row above rather than beside it: these 23
                // are part of that 1,192, and listing them as a separate line
                // read as double counting.
                [`${s.worstDomainRows} of those`, `one chain, all on ${s.worstDomain}`],
                [`${s.notFit} rows`, "already have what you'd be selling"],
                [`${s.blocked} rows`, "the site refused to be read"],
                [`${s.couldntTell} rows`, "read, and still not clear either way"],
              ].map(([nm, why]) => (
                <div className="jrow out" key={nm + why}>
                  <span className="nm">{nm}</span>
                  <span className="lead" aria-hidden />
                  <span className="why">{why}</span>
                </div>
              ))}
              {[s.name, s.keep2].filter(Boolean).map((nm) => (
                <div className="jrow keep" key={nm}>
                  <span className="nm">{nm}</span>
                  <span className="lead" aria-hidden />
                  <span className="why">a fit</span>
                </div>
              ))}
            </div>
            <p className="lab" style={{ marginTop: "var(--s3)", color: "var(--ink-3)" }}>
              {s.listed.toLocaleString()} rows &nbsp;·&nbsp; {s.fit} worth sending
              &nbsp;·&nbsp; {s.checked} of them read so far
            </p>
          </>
        )}
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

          {/* ---------------------------------------- how we can tell it -- */}
          <section className="wrap tight">
            <p className="lab eyebrow">How we can tell</p>
            <h2 className="dsp h-sec wide">
              We read their website the way you would. Just faster.
            </h2>
            <p className="lede" style={{ marginTop: "var(--s3)", maxWidth: "58ch", color: "var(--ink-2)" }}>
              This is the page we read for one clinic in Scottsdale, and the
              four things we took off it. Each marker is numbered to the finding
              beside it.
            </p>

            <div className="readergrid">
              <div className="browsercol">
                {/* A drawing of their page, not a screenshot of it: we store
                    extracted facts, never page copies, so the mock carries only
                    what our own read recorded — the domain, the pages read, the
                    phone, the platform, and that there is no booking route. */}
                <div className="browser">
                  <div className="chrome">
                    <span style={{ display: "flex", gap: 5 }} aria-hidden>
                      {["#D5D9D2", "#D5D9D2", "#D5D9D2"].map((c, i) => (
                        <i key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, display: "block" }} />
                      ))}
                    </span>
                    <span className="url">{s.domain}</span>
                    <span className="lab" style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                      {s.pagesRead} pages read
                    </span>
                  </div>

                  <div className="sitemenu">
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>{s.name}</span>
                    <span>Home</span>
                    <span>About</span>
                    <span>Services</span>
                    <span>Contact</span>
                    <span className="pin" style={{ top: -13, right: -13 }} aria-hidden>1</span>
                  </div>

                  <div className="sitehero">
                    <h4>The page we read, as the crawler saw it.</h4>
                    <div className="btnrow" style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                      <span className="mono" style={{ fontSize: 13, background: "var(--ink)", color: "var(--paper)", padding: "9px 14px" }}>
                        {s.phone}
                      </span>
                      <span className="mono" style={{ fontSize: 13, border: "1px solid var(--line-strong)", padding: "9px 14px" }}>
                        Directions
                      </span>
                      <span className="pin" style={{ top: 22, right: -13 }} aria-hidden>2</span>
                    </div>
                  </div>

                  <div className="sitecards">
                    {["Cleanings", "Whitening", "Implants"].map((t) => (
                      <div key={t}>
                        <b>{t}</b>
                        <i /><i style={{ width: "70%" }} />
                      </div>
                    ))}
                  </div>

                  <div className="sitefoot">
                    {s.address}
                    {s.cms && <> &nbsp;·&nbsp; Powered by {CMS_NAME[s.cms] ?? s.cms}</>}
                    <span className="pin" style={{ bottom: -13, right: -13 }} aria-hidden>3</span>
                  </div>
                </div>
              </div>

              <div className="findcol">
                {[
                  ["1", "Online booking", "Not found",
                   "No booking link anywhere in the menu, and the only thing to click is a phone number.",
                   `read across ${s.pagesRead} pages`],
                  ["2", "Phone", s.phone ?? "—",
                   "Printed on the page itself, so this is the number they want used.",
                   "read on the page"],
                  ["3", "Built on", s.cms ? (CMS_NAME[s.cms] ?? s.cms) : "—",
                   "Named in the footer. Booking is normally an add-on here, not a rebuild.",
                   "read in the footer"],
                ].map(([i, k, v, why, src]) => (
                  <div className="find" key={i}>
                    <span className="idx">{i}</span>
                    <span>
                      <b>{k}</b>
                      <span className="val">{v}</span>
                      <p>{why}</p>
                      <span className="src">{src}</span>
                    </span>
                  </div>
                ))}
                {/* The finding that is not a finding, and the best thing on
                    this page: we say so rather than filling the field. */}
                <div className="find none">
                  <span className="idx">—</span>
                  <span>
                    <b>Owner&rsquo;s name</b>
                    <span className="val">We couldn&rsquo;t tell</span>
                    <p>
                      There is no name anywhere on the site, so the field stays
                      empty. We would rather leave a blank than invent one.
                    </p>
                    <span className="src">nothing found</span>
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------- the one row -- */}
          <section className="wrap tight" style={{ paddingTop: 0 }}>
            <p className="lab eyebrow">And this is the row it becomes</p>
            <div className="rowcard">
              <div className="head">
                <div>
                  <p className="name">{s.name}</p>
                  <p className="place">{s.city}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "right" }}>
                  {s.phone && <span className="mono" style={{ fontSize: 15 }}>{s.phone}</span>}
                  {s.email && <span className="mono" style={{ fontSize: 15 }}>{s.email}</span>}
                  {s.domain && <span className="mono" style={{ fontSize: 15, color: "var(--ink-3)" }}>{s.domain}</span>}
                </div>
              </div>

              {s.message && (
                <div className="mailwrap">
                  <p className="lab" style={{ color: "var(--lure-text)" }}>Your opening email</p>
                  {/* Rendered as the paragraphs it is written in. As one block
                      it read as a wall; the draft is four short beats —
                      greeting, what is true of their site, why it costs them
                      something, and the ask. */}
                  {s.message.split("\n\n").map((para, i) => (
                    <p
                      key={i}
                      className="cite"
                      style={{ fontSize: "clamp(17px,1.8vw,20px)", lineHeight: 1.55, marginTop: i === 0 ? 14 : 14, maxWidth: "58ch" }}
                    >
                      {para}
                    </p>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "var(--s3)",
                      justifyContent: "space-between",
                      marginTop: "var(--s4)",
                      paddingTop: "var(--s3)",
                      borderTop: "1px solid var(--line)",
                    }}
                  >
                    <span className="small" style={{ color: "var(--ink-3)" }}>
                      Every line traces back to something on the page above.
                    </span>
                    <span className="lab" style={{ color: "var(--ink-3)" }}>
                      You edit it · you send it · we never send anything
                    </span>
                  </div>
                </div>
              )}
            </div>
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
      <section className="wrap tight">
        <p className="lab eyebrow">Three steps</p>
        <h2 className="dsp h-sec">Here&rsquo;s how it works.</h2>

        <div className="steps">
          <div className="step">
            <div className="stepart">
              <div className="miniform">
                <div className="minifield"><span>who</span> dentists</div>
                <div className="minifield"><span>where</span> Phoenix</div>
                <span className="sf-btn-lure" style={{ height: 34, fontSize: 13, pointerEvents: "none" }}>
                  Find them
                </span>
              </div>
            </div>
            <div className="stepbody">
              <span className="stepnum">01</span>
              <h3>Tell us who you sell to and where.</h3>
              <p>A type of business and a city. That&rsquo;s the whole form.</p>
            </div>
          </div>

          <div className="step">
            <div className="stepart">
              <div className="sheets" aria-hidden><i /><i /><i /></div>
            </div>
            <div className="stepbody">
              <span className="stepnum">02</span>
              <h3>We read them one by one.</h3>
              <p>Each on its own website, page by page. No guessing from a database.</p>
            </div>
          </div>

          <div className="step">
            <div className="stepart">
              <div className="minirow">
                <div className="top">
                  <span className="dot" aria-hidden />
                  <span className="nm2">{s?.name ?? "A business that fits"}</span>
                </div>
                <i className="ln" /><i className="ln s" />
                <span className="mail">opening email ready</span>
              </div>
            </div>
            <div className="stepbody">
              <span className="stepnum">03</span>
              <h3>Get only the ones that fit.</h3>
              <p>Contacts, the reason it fits, and an email you can send as it is.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ any trade, any city */}
      <section className="wrap tight">
        <p className="lab eyebrow">Coverage</p>
        <h2 className="dsp h-sec wide">Any local business. Any city in the US.</h2>

        <div className="mapgrid">
          <div className="mapcol">
            <p className="lede" style={{ color: "var(--ink-2)", maxWidth: "52ch" }}>
              Nothing has to be built for a new trade — what you are looking for
              is read off the page, not looked up in a list of industries we
              prepared in advance.
            </p>
            <div className="mqband">
              <div className="mq dsp" style={{ fontSize: "clamp(26px,4vw,54px)" }}>
                {Array.from({ length: 3 }, (_, i) => (
                  <span key={i}>
                    {TRADES.map((t) => (
                      <span key={t} style={{ marginRight: "0.5em" }}>{t}</span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="legcol">
            <div className="legrow">
              <i style={{ background: "var(--lure)" }} />
              <span>
                <b>Phoenix, Austin, Tampa</b>
                <span>Read in full today, so a search here comes back at once.</span>
              </span>
            </div>
            <div className="legrow">
              <i style={{ background: "var(--line-strong)" }} />
              <span>
                <b>Everywhere else</b>
                {/* The design promised "the answer comes back the same day".
                    Reading a city cold is not switched on at all yet, so that
                    is a delivery date we cannot keep — it says what happens
                    instead. */}
                <span>We start reading a city the first time somebody asks for it.</span>
              </span>
            </div>
            <div className="legrow">
              <i style={{ background: "var(--ink)" }} />
              <span>
                <b>Any trade, no setup</b>
                <span>Dentists, salons, plumbers, garages, gyms, law firms. Nothing is hard-coded per industry.</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- the film -- */}
      <section className="wrap" style={{ paddingTop: 84, maxWidth: 980, marginLeft: "auto", marginRight: "auto" }}>
        <Explainer />
      </section>

      {/* ------------------------------------------------------- the price -- */}
      <section className="slab-v3">
        <div className="wrap">
          <p className="lab eyebrow" style={{ color: "#5B6470" }}>Pricing</p>
          <div className="g12" style={{ rowGap: "var(--s4)" }}>
            <div style={{ gridColumn: "1 / span 6" }}>
              <h2 className="dsp h-sec" style={{ color: "#EEF0EC" }}>
                You only pay for businesses that fit.
              </h2>
              <div className="prices">
                {["$29", "$79", "$199"].map((p2) => (
                  <span className="price" key={p2}>
                    <b>{p2}</b>
                    <span>a month</span>
                  </span>
                ))}
              </div>
              <p className="small" style={{ color: "#B9BFB6", marginTop: "var(--s3)" }}>
                How many businesses you need decides which one.
              </p>
            </div>

            <div style={{ gridColumn: "8 / span 5" }}>
              {/* Each of these is enforced somewhere in the repo, which is why
                  they can be printed as promises: BILLABLE gates the charge,
                  every published contact carries the page it came from,
                  nothing in the codebase sends mail, and the free plan is 20
                  credits. */}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--s2)" }}>
                {[
                  "Businesses that don’t fit are free.",
                  "Every contact comes from their own website.",
                  "We never send anything. You do.",
                  "Your first 20 are free. No card.",
                ].map((line) => (
                  <li key={line} style={{ display: "flex", gap: 12, color: "#EEF0EC", fontSize: 16, lineHeight: 1.5 }}>
                    <span aria-hidden style={{ color: "var(--lure)" }}>→</span>
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="sf-tap"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: "var(--s4)",
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
