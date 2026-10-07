import "server-only";

import { claimJobNotification, type JobRow } from "@/lib/accounts";
import { mailConfigured, sendMail, type SendResult } from "@/lib/mail";

/**
 * The "your list is ready" note.
 *
 * ## It does not pretend to have sent anything
 *
 * There is no mail provider configured in this repository. That is a real gap,
 * not a hidden one: `send` returns `{ sent: false, why }` and every caller is
 * expected to surface it, because a queue that silently drops the one message
 * a person is waiting for is worse than one that never offered to write.
 *
 * Set `RESEND_API_KEY` and `MAIL_FROM` and it sends; until then it says why it
 * cannot. Nothing else in the flow changes.
 *
 * ## Sent once, enforced in the database
 *
 * `mark_job_notified` sets `notified_at` only when it is still null and reports
 * whether it won. A retrying worker, or two workers, therefore cannot send the
 * same person the same note twice — the claim happens before the send, so the
 * failure mode is a note that is missed rather than one that is duplicated.
 * That is the right way round: a missing note is visible on the page, a
 * duplicate one is only visible in somebody's inbox.
 */

export type { SendResult };

/** The note itself. Plain, short, and it leads with the number they came for. */
export function readFinishedEmail(job: JobRow, siteUrl: string) {
  const link = `${siteUrl.replace(/\/$/, "")}/app?q=${encodeURIComponent(job.query)}`;
  const subject =
    job.matched > 0
      ? `${job.matched} businesses that fit, ${job.query}`
      : `Nothing fit, ${job.query}`;

  const body = [
    job.matched > 0
      ? `We finished reading. ${job.matched.toLocaleString()} of the ${job.sites_judged.toLocaleString()} we could settle fit what you asked for.`
      : `We finished reading ${job.sites_read.toLocaleString()} websites and none of them fit what you asked for. Nothing was charged.`,
    job.unclear > 0
      ? `${job.unclear.toLocaleString()} we could not settle either way, those are left out rather than guessed at, and they cost you nothing.`
      : null,
    `Your list: ${link}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, body };
}

export async function send(job: JobRow, siteUrl: string): Promise<SendResult> {
  if (!job.notify_email) return { sent: false, why: "Nobody asked to be written to." };
  if (job.notified_at) return { sent: false, why: "Already sent." };

  // The provider is checked before the claim is taken, and the order matters.
  // Claiming first on a deployment with no key would mark the note as sent by
  // somebody, so the day the key arrives every waiting customer's note is
  // already spoken for and never goes out.
  if (!mailConfigured()) {
    return {
      sent: false,
      why:
        "No mail provider is configured on this deployment (RESEND_API_KEY is " +
        "not set), so the finished list is waiting in the app instead.",
    };
  }

  // Claim before sending. Losing the claim means somebody else is sending it.
  if (!(await claimJobNotification(job.id))) {
    return { sent: false, why: "Another worker is sending this one." };
  }

  const { subject, body } = readFinishedEmail(job, siteUrl);
  return sendMail(job.notify_email, { subject, text: body });
}
