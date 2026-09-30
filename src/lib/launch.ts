/**
 * Whether the front door is open, and the two strings that depend on it
 * (S2-13).
 *
 * The 2026-09-26 home page copy points every button at sign-up, and sets its
 * own condition for that:
 *
 *   > The whole page now points at sign-up, so sign-up has to work. A new user
 *   > must be able to describe a market and get a real list back, or the page
 *   > is promising something the product can't do yet.
 *   >
 *   > If that isn't ready, change two strings and nothing else: the buttons
 *   > become **Join the waitlist**, and the line under them becomes *We're
 *   > letting people in a few at a time.*
 *
 * **Decided 2026-09-28: the door opens anyway.** Sign-up is the call to
 * action everywhere and the waitlist is retired.
 *
 * The condition above is still not fully met, and it is worth writing down
 * exactly which half works, because the honest version of this decision
 * depends on it. Somebody can sign up right now and get a real list — names,
 * phone numbers, a drafted opener, a CSV — for any market that has been read.
 * What they cannot yet do is name a market of their own and have it read
 * cold; that pipeline lives in `stage0/` and does not run on the web app.
 *
 * So the risk this flag was protecting against is real, and the answer to it
 * is not a closed door — it is `/app` telling the truth. A search we have not
 * read says so plainly and offers the ones that are ready, rather than
 * returning an empty list or the nearest market pretending to be the one that
 * was asked for. `test_leads.mjs` holds that: an unread trade returns nothing,
 * never the nearest market.
 *
 * A waitlist would have been the safer-looking choice and the less honest one,
 * because it withholds a product that genuinely works for the markets it
 * covers.
 */

/**
 * `true` since 2026-09-28. Sign-up is the only call to action.
 *
 * Kept as a switch rather than deleted: if sign-up ever has to close again —
 * capacity, abuse, a pricing change — this is still the one boolean that does
 * it, and every other word on every page is identical either way.
 */
export const SIGNUP_OPEN = true;

/** The primary action, everywhere it appears. */
export const CTA_LABEL = SIGNUP_OPEN ? "Sign up free →" : "Join the waitlist →";

/** Where that action goes. */
/** Where that action goes. The home page is a door too, so it names itself —
 *  without a source every direct and word-of-mouth signup is indistinguishable
 *  from one a channel earned. */
export const CTA_HREF = SIGNUP_OPEN ? "/sign-up?source=home" : "/waitlist";

/** The line under the hero button. */
export const CTA_NOTE = SIGNUP_OPEN
  ? "20 businesses free · no card"
  : "We're letting people in a few at a time";

/** The line under the closing button, which carries one extra clause. */
export const CTA_NOTE_LONG = SIGNUP_OPEN
  ? "20 businesses free · no card · nothing to install"
  : "We're letting people in a few at a time · no card · nothing to install";

/** The nav button, which is shorter than the page buttons. */
export const NAV_CTA = SIGNUP_OPEN ? "Sign up" : "Waitlist";
