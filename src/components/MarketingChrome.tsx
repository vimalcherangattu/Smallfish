import Link from "next/link";

import Fish from "@/components/Fish";
import { CTA_HREF, NAV_CTA } from "@/lib/launch";

/**
 * The nav and footer the marketing pages share.
 *
 * Three pages were added at once when the home page was cut down to seven
 * blocks, and each needed the same header and the same footer. Copying them
 * was how the old site ended up with a footer that listed a page that had been
 * renamed — so they live here, and a link changes in one place.
 */

export function MarketingNav({ dark = false }: { dark?: boolean }) {
  const ink = dark ? "#EEF0EC" : "var(--ink)";
  return (
    <nav
      className="wrap"
      aria-label="Main"
      style={{
        position: "relative",
        // Above the decoration, belt and braces. The hero's drifting school is
        // `position: absolute` and comes later in the document, so with no
        // z-index here it painted over this whole bar and ate every click.
        // `pointer-events: none` on the decoration is the real fix; this makes
        // the next decorative layer somebody adds unable to repeat it.
        zIndex: 2,
        height: 88,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Link
        href="/"
        className="sf-tap"
        style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
      >
        <Fish width={36} />
        <span className="dsp" style={{ fontSize: 22, fontWeight: 600, color: ink, lineHeight: 1 }}>
          small fish
        </span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <Link className="navlink max-sm:hidden" href="/how-we-check">How we check</Link>
        <Link className="navlink max-sm:hidden" href="/markets">Markets</Link>
        <Link className="navlink max-sm:hidden" href="/pricing">Pricing</Link>
        <Link className="navlink max-sm:hidden" href="/app">Sign in</Link>
        <Link className="cta sm" href={CTA_HREF}>{NAV_CTA}</Link>
      </div>
    </nav>
  );
}

/**
 * The "← somewhere" link that starts every marketing page without the full
 * nav. It existed as the same four class names copied into twelve files, which
 * is how the bug below survived in all twelve at once.
 *
 * ## Why it is positioned
 *
 * The display face is set `line-height: 0.92` (`.mkt .dsp`), tighter than the
 * font's own ascent and descent. That is the design language and it is correct,
 * but it means a heading's **inline box is taller than its border box** and
 * overflows upward out of it — on `/pricing` at 1280px, a 72px heading whose
 * box starts at y=88 hit-tests from y≈78. The back link above it occupies
 * y=69–86. So the heading's empty ascent space lay over the bottom half of the
 * link, and `elementFromPoint` at the link's centre — where a person aims —
 * returned the heading. Clicking the exact middle of "← Small Fish" did
 * nothing; only the top few pixels worked.
 *
 * Nothing is visibly wrong, no margin is too small, and `mt-10` on the heading
 * looks like plenty of room. `position: relative` + `z-index` is the fix
 * because the link only needs to paint above a sibling that is not positioned
 * at all. `check_clickable.mjs` is what found it and is what keeps it fixed.
 */
export function BackLink({
  href = "/",
  label = "Small Fish",
  className = "",
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`sf-tap mono text-[13px] text-[var(--ink-3)] ${className}`.trim()}
      // See above: the heading below this link overflows its own box upward.
      style={{ position: "relative", zIndex: 1 }}
    >
      ← {label}
    </Link>
  );
}

export function MarketingFooter({ flush = false }: { flush?: boolean }) {
  const cols: [string, [string, string][]][] = [
    ["Product", [["Markets", "/markets"], ["Pricing", "/pricing"], ["Sign in", "/app"]]],
    [
      "Company",
      [
        ["How we check", "/how-we-check"],
        ["Why it exists", "/why-it-exists"],
        ["Remove my business", "/opt-out"],
      ],
    ],
    [
      "Small print",
      [
        ["Privacy", "/privacy"],
        ["Terms", "/terms"],
        ["How we crawl", "/bot"],
        ["What we get wrong", "/benchmark"],
      ],
    ],
  ];

  return (
    <footer
      style={{
        background: "#0E1520",
        color: "#B9BFB6",
        padding: "56px 56px 48px",
        // `flush` is for a page that already ends on ink — the home page sets
        // its ghost wordmark on the same colour directly above. With the
        // default 80px the page's own paper showed through between the two as
        // a white band, which read as a rendering fault rather than a gap.
        marginTop: flush ? 0 : 80,
      }}
    >
      <div className="g12" style={{ rowGap: 32 }}>
        <div style={{ gridColumn: "1 / span 4", display: "flex", flexDirection: "column", gap: 14 }}>
          <Link
            href="/"
            className="sf-tap"
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            <Fish width={34} />
            <span className="dsp" style={{ fontSize: 21, fontWeight: 600, color: "#EEF0EC", lineHeight: 1 }}>
              small fish
            </span>
          </Link>
          <span className="small" style={{ color: "#8A929B", fontStyle: "italic" }}>
            We read, we cite, and we say when we could not tell. We never send.
          </span>
        </div>
        {cols.map(([title, links], i) => (
          <div
            key={title}
            style={{
              gridColumn: `${7 + i * 2} / span 2`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <span className="lab" style={{ color: "#5B6470" }}>{title}</span>
            {links.map(([label, href]) => (
              <Link key={label} className="navlink" href={href}>
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
