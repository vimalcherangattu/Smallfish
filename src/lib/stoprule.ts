/**
 * When cold email has had a fair test, and whether it passed (owner,
 * 2026-11-10). Pure, so `test_stoprule.mjs` holds it.
 *
 * ## Why there is a rule at all
 *
 * The first eight days emailed 210 people and nobody replied, and the owner
 * was ready to shut the product down. 210 is too few to say that: at a 1%
 * reply rate, zero replies from 210 happens about one time in eight. So the
 * decision is written down before the numbers come in, not after:
 *
 * > **Once 500 people have been reached with the try-the-product copy, if
 * > none of them has replied wanting it or signed up, stop cold email or
 * > change who it goes to and what it says.**
 *
 * - **Reached** = sent at least one email, did not bounce, is not one of our
 *   own seed addresses. Counted from `SINCE`, the day the copy changed from
 *   "here is a free list" to "here is the product".
 * - **Wanted it** = a reply the reply bot classed as interested, a question,
 *   or asking for another trade or city. Out-of-office, "no" and "wrong person"
 *   are not wanting it.
 * - **Signed up** = an account whose `source` starts `outreach`.
 *
 * The rule only means something if the email reached an inbox. That is what
 * the seed addresses are for (`seedsFrom`): our own addresses, added to every
 * campaign, so a person can look at where the same email from the same
 * inboxes landed. If seeds land in spam, the count tests deliverability, not
 * the product, and the digest says so rather than reporting a verdict.
 */

export const STOP_RULE = { since: "2026-11-10", people: 500 } as const;

/** Reply intents that mean someone wants it (see `replies.ts`). */
export const WANTED = new Set(["interested", "question", "other_list"]);

/** OUTREACH_SEEDS: comma-separated addresses we own. Lower-cased, deduped. */
export function seedsFrom(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(/[,\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
    ),
  ].sort();
}

export interface StopEvent {
  kind: string;
  email: string | null;
  detail?: Record<string, unknown> | null;
}

export interface StopStatus {
  reached: number;
  wanted: number;
  signups: number;
  verdict: "testing" | "working" | "stop";
  /** One sentence for the digest. */
  line: string;
}

/** `events` are every `email_sent`, `email_bounced` and `reply_classified`
 *  since `STOP_RULE.since`; `signups` the outreach accounts since then. */
export function stopStatus(events: StopEvent[], seeds: string[], signups: number): StopStatus {
  const seed = new Set(seeds);
  const who = (e: StopEvent) => (e.email ?? "").toLowerCase();
  const sent = new Set<string>();
  const bounced = new Set<string>();
  const wantedBy = new Set<string>();
  for (const e of events) {
    const w = who(e);
    if (!w || seed.has(w)) continue;
    if (e.kind === "email_sent") sent.add(w);
    else if (e.kind === "email_bounced") bounced.add(w);
    else if (e.kind === "reply_classified" && WANTED.has(String(e.detail?.intent ?? ""))) wantedBy.add(w);
  }
  const reached = [...sent].filter((w) => !bounced.has(w)).length;
  const wanted = wantedBy.size;
  const n = STOP_RULE.people;
  const good = wanted + signups;
  const verdict: StopStatus["verdict"] = good > 0 ? "working" : reached >= n ? "stop" : "testing";
  const line =
    verdict === "working"
      ? `Someone wants it: ${wanted} interested repl${wanted === 1 ? "y" : "ies"}, ${signups} signup${signups === 1 ? "" : "s"}, from ${reached} people reached. Keep going.`
      : verdict === "stop"
        ? `STOP POINT REACHED: ${reached} people reached since ${STOP_RULE.since} and nobody wanted it. Stop cold email or change who it goes to and what it says (if the seeds landed in the inbox).`
        : `${reached} of ${n} people reached since ${STOP_RULE.since}. Nobody has wanted it yet. Verdict at ${n}.`;
  return { reached, wanted, signups, verdict, line };
}
