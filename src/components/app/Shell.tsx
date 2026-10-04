"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

import { Card, Fish, Flag, List, Plus, Tick } from "@/components/app/icons";

/**
 * The App v2 shell: a 252px sidebar, a 64px appbar, and the content column.
 *
 * ## Five destinations, and the rule about the sixth
 *
 * `PRODUCT-HANDOFF.md` §4: *"deliberately short… Every time someone proposes a
 * sixth, the answer is that the product does one thing."* The shell this
 * replaces had eight, including two that were views of the same list and one
 * ("Reads") that was the measurement rig showing through.
 *
 * ## Two divergences between the handoff prose and the kit, both resolved to
 *    the kit
 *
 * §4 describes the sidebar as `--ink` with `--paper` text and a lure left bar
 * on the active item. `kit.css`'s `.nav` is white with `--ink-3` text and
 * `.navitem.on` is a `--fill` plate. The kit is the stylesheet the designer
 * shipped and `Menu.dc.html` renders it that way, so the kit wins. Noted
 * rather than silently picked — see the decision log.
 *
 * ## No sidebar on first run
 *
 * §4 again: *"a navigation rail to five empty destinations is worse than
 * none."* `bare` drops it, and the first-run screen passes it.
 */

export interface ShellProps {
  children: React.ReactNode;
  /** The route the sidebar should mark active. */
  here?: "lists" | "saved" | "contacted" | "credits";
  /** Appbar only. Left undefined, the shell decides from the path and whether
   *  the visitor has an account. */
  bare?: boolean;
  /** Whether this visitor has somewhere to navigate to. */
  signedIn?: boolean;
  /** What the free plan grants. Shown to a signed-out visitor as an offer,
   *  never as a balance they already hold. */
  freeGrant?: number;
  /** The credit pill. `null` hides it — never show a counter we are guessing. */
  credits?: { left: number; of: number } | null;
}

/** §4's five, and no more. "New search" is the button above, so these are the
 *  four destinations plus Get more. `Menu.dc.html` draws six — it also draws a
 *  Help item and a referral link — but that board is the earlier exploration
 *  `SCREENS.md` marks as superseded, and §4's list is the one that is current. */
const ITEMS = [
  { key: "lists", href: "/app/runs", label: "My lists", icon: List },
  { key: "saved", href: "/app/destinations", label: "Saved searches", icon: Flag },
  { key: "contacted", href: "/app/contacted", label: "Contacted", icon: Tick },
  { key: "credits", href: "/account", label: "Get more", icon: Card },
] as const;

export default function Shell({ children, here, bare, credits = null, signedIn = false, freeGrant = 0 }: ShellProps) {
  const path = usePathname();
  // §4: the first-run screen has no rail — but only when there is nothing
  // behind it. A returning account has lists, saved searches and a balance, and
  // hiding the one piece of navigation in the product from them to satisfy a
  // rule about empty destinations would be following the letter of §4 against
  // its reason. The layout supplies the fact; the path supplies the screen.
  const noRail = bare ?? (path === "/app" && !signedIn);
  const at = here ?? derive(path);
  return (
    <div className="sf">
      <div className={noRail ? undefined : "appwrap"}>
        {!noRail && (
          <nav className="nav" aria-label="Primary">
            <Link className="navlogo" href="/app">
              <Fish w={34} />
              <span className="navname">small fish</span>
            </Link>

            <Link className="btn ink" href="/app">
              New search
              <Plus s={17} />
            </Link>

            <div className="navlist">
              {ITEMS.map(({ key, href, label, icon: Icon }) => (
                <Link key={key} className={`navitem${at === key ? " on" : ""}`} href={href}
                  aria-current={at === key ? "page" : undefined}>
                  <Icon s={17} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>

            {credits && (
              <div className="navfoot">
                <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                  <div className="between" style={{ gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: "var(--mut)" }}>Credits left</span>
                    <span className="mono" style={{ fontSize: 12.5 }}>
                      {credits.left} of {credits.of}
                    </span>
                  </div>
                  <div className="meter">
                    <i style={{ width: `${pct(credits.left, credits.of)}%` }} />
                  </div>
                  <p className="sm" style={{ fontSize: 12 }}>
                    Businesses that don&rsquo;t fit are free.
                  </p>
                </div>
              </div>
            )}
          </nav>
        )}

        <div className="appmain">
          <header className="appbar">
            {/* The rail already carries the wordmark, so the appbar drops it.
                Two of them on one screen is the artboard's appbar and the menu
                board's nav rendered together, which neither drawing intended —
                and a lone fish with the words removed looks like a logo that
                failed to load. With no rail the appbar carries it in full. */}
            {noRail && (
              <Link className="row" style={{ gap: 12 }} href="/app">
                <Fish w={32} />
                <span className="navname" style={{ fontSize: 19 }}>
                  small fish
                </span>
              </Link>
            )}
            <div className="row" style={{ gap: 12 }}>
              {credits ? (
                <span className="credit">
                  <Card s={14} />
                  {credits.left} of {credits.of} credits left
                </span>
              ) : (
                freeGrant > 0 && (
                  <span className="credit">
                    <Card s={14} />
                    {/* One text node, not two: `.credit` is a flex row with a
                        9px gap, so a sibling span rendered "20 free , no
                        card". */}
                    <span>
                      {freeGrant} free<span className="nocard">, no card</span>
                    </span>
                  </span>
                )
              )}
              <Link className="qbtn" href="/account">
                Account
              </Link>
            </div>
          </header>

          {children}
        </div>
      </div>

      {/* §5.7: on a phone the rail becomes three. */}
      {!noRail && (
        <nav className="botbar" aria-label="Primary">
          <Link href="/app" className={at ? undefined : "on"}>
            <Plus s={18} />
            Search
          </Link>
          <Link href="/app/runs" className={at === "lists" ? "on" : undefined}>
            <List s={18} />
            Lists
          </Link>
          <Link href="/account" className={at === "credits" ? "on" : undefined}>
            <Card s={18} />
            Account
          </Link>
        </nav>
      )}
    </div>
  );
}

function pct(left: number, of: number): number {
  if (of <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((left / of) * 100)));
}

/** Which rail item a path belongs to, so a page does not have to say. */
function derive(path: string | null): ShellProps["here"] {
  if (!path) return undefined;
  if (path.startsWith("/app/runs") || path.startsWith("/app/reads")) return "lists";
  if (path.startsWith("/app/destinations")) return "saved";
  if (path.startsWith("/app/contacted")) return "contacted";
  if (path.startsWith("/account")) return "credits";
  return undefined;
}
