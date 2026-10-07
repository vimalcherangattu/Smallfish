/**
 * The four messages this product sends, and the one place that sends them.
 *
 * ## Why the messages are pure functions
 *
 * Everything below `sendMail` is a string built from arguments: no fetch, no
 * database, no key. That is what makes an email testable at all. `test_mail.mjs`
 * asserts the things that are actually expensive to get wrong in somebody's
 * inbox — a number that does not match the product, our vocabulary leaking into
 * a customer's reading, an unsubscribe link that is not there — and it does it
 * without a provider and without sending anything.
 *
 * ## Why there is no mail provider here
 *
 * There is no `RESEND_API_KEY` on this deployment. That is a real gap and it is
 * not hidden: `sendMail` returns `{sent: false, why}` and every caller records
 * the `why` against the claim in `mail_sends`, so "nothing arrived" is a fact
 * somebody can query rather than a silence. Set `RESEND_API_KEY` and `MAIL_FROM`
 * and the same code sends. Nothing else in any flow changes.
 *
 * ## Every message can be stopped
 *
 * A product that emails people about businesses that did not ask to be emailed
 * has to be scrupulous about the mail it sends its *own* customers too. Every
 * message carries an unsubscribe line with a real URL. The one exception is the
 * finished-read note, which is a reply to something the person explicitly asked
 * for by leaving their address — and it still carries one, because "you asked
 * for this" is the argument every unwanted sender makes.
 */

import "server-only";

export interface SendResult {
  sent: boolean;
  why?: string;
}

export interface Message {
  subject: string;
  /** Plain text. No HTML: these are short, and a text part always renders. */
  text: string;
}

export const MAIL_KINDS = ["welcome", "nudge", "digest"] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

const trim = (s: string) => s.replace(/\/$/, "");

/**
 * The ISO week, which is what makes the digest once-a-week rather than
 * once-ever.
 *
 * Written out rather than pulled from a date library: it is eight lines, and a
 * dependency whose only job is to produce the key of a primary key is a
 * dependency that can silently change that key on an upgrade.
 */
export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of this week decides the year, which is the whole point of ISO
  // weeks and the part every hand-rolled version gets wrong.
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The line every message ends with. A real URL, not a mailto nobody reads. */
const footer = (siteUrl: string, email: string) =>
  `Stop these: ${trim(siteUrl)}/opt-out?email=${encodeURIComponent(email)}`;

// ---------------------------------------------------------------- welcome --

/**
 * Sent once, when a workspace is created.
 *
 * It does one job: get them back to the list they were looking at. The
 * user-flow document's spine is that nothing the person has told us is asked
 * again, and the door already carried their search through sign-up, so this
 * carries it one step further into their inbox rather than describing features.
 *
 * No onboarding sequence, no "here are five tips". They signed up ninety
 * seconds ago from a page showing their own market; the useful thing is the
 * link back to it and the number of credits they can spend.
 */
export function welcomeEmail(args: {
  email: string;
  siteUrl: string;
  credits: number;
  /** The search the door promised, if a door brought them. */
  query?: string | null;
}): Message {
  const site = trim(args.siteUrl);
  const link = args.query
    ? `${site}/app?q=${encodeURIComponent(args.query)}`
    : `${site}/app`;

  const text = [
    args.query
      ? `Your list is ready: ${args.query}.`
      : `Your workspace is ready.`,
    `${link}`,
    `You have ${args.credits} credits. One credit unlocks one business, its name, ` +
      `its number, and a line you can open with. Businesses that did not fit, and ` +
      `ones we could not read well enough to say either way, cost nothing and ` +
      `never will.`,
    `If a business turns out not to fit, tell us and we refund the credit.`,
    footer(site, args.email),
  ].join("\n\n");

  return {
    subject: args.query ? `Your list: ${args.query}` : "Your Small Fish workspace",
    text,
  };
}

// ------------------------------------------------------------------ nudge --

/**
 * Sent once, roughly two days after sign-up, to somebody who has not taken a
 * single row.
 *
 * **It is not sent to somebody who did.** A nudge that arrives after the person
 * already did the thing is the clearest possible signal that nobody is reading
 * their account, and it is the most common way a drip sequence makes a product
 * feel automated in the bad sense. The caller checks; this only writes.
 *
 * It names what is sitting there rather than asking how they are getting on.
 */
export function nudgeEmail(args: {
  email: string;
  siteUrl: string;
  credits: number;
  /** Matches waiting on their first search, if they ran one. */
  waiting?: number | null;
  query?: string | null;
}): Message {
  const site = trim(args.siteUrl);
  const link = args.query
    ? `${site}/app?q=${encodeURIComponent(args.query)}`
    : `${site}/app`;

  const opening =
    args.waiting && args.query
      ? `${args.waiting} businesses are still sitting on your list for "${args.query}", ` +
        `each with a number and a drafted opener.`
      : `You have ${args.credits} credits and haven't used one yet.`;

  return {
    subject:
      args.waiting && args.waiting > 0
        ? `${args.waiting} businesses are still waiting on your list`
        : "Your credits are still here",
    text: [
      opening,
      link,
      `If the search wasn't right, changing it costs nothing, you're only ` +
        `charged for a business you take, and never for one that didn't fit.`,
      footer(site, args.email),
    ].join("\n\n"),
  };
}

// ----------------------------------------------------------------- digest --

export interface DigestLine {
  query: string;
  /** New matches since the last digest. */
  added: number;
}

/**
 * Sent weekly, to somebody with saved searches that found something new.
 *
 * **Not sent when nothing changed.** A weekly email that says "no change this
 * week" teaches people to filter the sender, and then the week something does
 * change they do not see it. The caller decides; `hasNews` is here so that
 * decision is made from the same data the message is built from, rather than
 * from a second query that can disagree with it.
 */
export const hasNews = (lines: DigestLine[]) => lines.some((l) => l.added > 0);

export function digestEmail(args: {
  email: string;
  siteUrl: string;
  lines: DigestLine[];
}): Message {
  const site = trim(args.siteUrl);
  const news = args.lines.filter((l) => l.added > 0).sort((a, b) => b.added - a.added);
  const total = news.reduce((n, l) => n + l.added, 0);

  return {
    subject: `${total} new ${total === 1 ? "business" : "businesses"} this week`,
    text: [
      `Since last week, on the searches you're watching:`,
      news
        .map(
          (l) =>
            `${l.added} new, ${l.query}\n${site}/app?q=${encodeURIComponent(l.query)}`,
        )
        .join("\n\n"),
      `Each one was read this week and matched. Nothing is charged until you take it.`,
      footer(site, args.email),
    ].join("\n\n"),
  };
}

// ------------------------------------------------------------------ send --

const from = () => process.env.MAIL_FROM ?? "Small Fish <hello@getsmallfish.com>";

/**
 * Hand one message to the provider.
 *
 * The only function here that touches the network, so it is the only one that
 * can be wrong about whether something was sent. Callers never infer it — a
 * `SendResult` with `sent: false` and a `why` is the whole contract, and
 * `mail_sends.why` is where it ends up.
 */
export async function sendMail(to: string, msg: Message): Promise<SendResult> {
  if (!to.includes("@")) return { sent: false, why: "No address to send to." };

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      sent: false,
      why:
        "No mail provider is configured on this deployment (RESEND_API_KEY is " +
        "not set), so nothing was sent.",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from(), to: [to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) return { sent: false, why: `The mail provider refused it (${res.status}).` };
    return { sent: true };
  } catch {
    return { sent: false, why: "The mail provider could not be reached." };
  }
}

/** Is there a provider at all? Read by `/api/status`, so a deployment can be
 *  asked rather than guessed about. */
export const mailConfigured = () => !!process.env.RESEND_API_KEY;
