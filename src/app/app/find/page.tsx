import type { Metadata } from "next";

import PoolSearch from "@/components/app/PoolSearch";

/**
 * PRD v2's entry screen, at its own route while the flow is built.
 *
 * ## Why not at `/app` yet
 *
 * The PRD says the search is the first screen, and it will be. But `/app` is
 * the flow that works today — somebody can search, read sites and get matches
 * with proof on it right now — and replacing it before the new path can read
 * anything would take the product backwards for the sake of being on the right
 * URL. `CLAUDE.md` also asks for a word in chat before a screen is replaced
 * wholesale, and this is how that word gets asked for: the new screen is
 * clickable and judgeable at `/app/find`, and `/app` moves once there is
 * something behind the button.
 *
 * ## No account
 *
 * `middleware.ts` leaves `/app` unprotected on purpose — *"the free match count
 * is anonymous"* — and this inherits that. Nothing here reads a balance or
 * spends a credit, which is what makes it a top of funnel rather than a paywall
 * in front of a claim nobody can check.
 */

export const metadata: Metadata = {
  title: "Which businesses, and where? · Small Fish",
  description:
    "How many of a kind of business exist in a US city, and how many have a website we can read. No account.",
};

export default function FindPage() {
  return <PoolSearch />;
}
