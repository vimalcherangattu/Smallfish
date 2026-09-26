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
 * **That condition is not met today**, and it is worth being precise about
 * why, because it is close. Somebody can sign up right now and get a real list
 * — names, contacts, evidence, a CSV — for any of the three markets that have
 * been read. What they cannot do is describe a market of their own and have it
 * read, because reading one cold needs a model key that is not set in any
 * environment. The copy's promise is "tell us who you sell to and where", and
 * that is the half that does not work.
 *
 * So the switch is here, it is one boolean, and flipping it changes exactly
 * what the document says it should. Everything else on the page — every other
 * word, every link, every block — is identical either way.
 */

/**
 * `false` until a stranger can describe their own market and get it read.
 *
 * Flip this the day the model key is set and a cold read works end to end.
 * Nothing else needs to change.
 */
export const SIGNUP_OPEN = false;

/** The primary action, everywhere it appears. */
export const CTA_LABEL = SIGNUP_OPEN ? "Sign up free →" : "Join the waitlist →";

/** Where that action goes. */
export const CTA_HREF = SIGNUP_OPEN ? "/sign-up" : "/waitlist";

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
