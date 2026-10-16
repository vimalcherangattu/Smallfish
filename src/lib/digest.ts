/**
 * The owner's morning email (GTM): what the automation did yesterday, and
 * anything it held back for a person. Pure, so `test_digest.mjs` holds it.
 *
 * Zero human interaction means the machine needs one place to report to.
 * This is it: counts first, then the few things that need eyes, then the
 * link to /ops/outreach for the rest. Plain text, no dashes, short.
 */

import type { Message } from "@/lib/mail";

export interface DigestStats {
  day: string;
  found: number;
  queued: number;
  sent: number;
  opened: number;
  replied: number;
  autoReplied: number;
  unsubscribed: number;
  bounced: number;
  visits: number;
  listsBuilt: number;
  checks: number;
  embedChecks: number;
  mcpCalls: number;
  pagesCounted: number;
  pagesTotal: number;
  signups: Record<string, number>;
  paying: number;
  queueReady: { agency: number; seller: number; widget: number };
  held: Array<{ kind: string; who: string; why: string }>;
  goLive: string;
  sending: boolean;
}

const line = (label: string, n: number) => `${label}: ${n.toLocaleString("en-US")}`;

export function buildDigest(s: DigestStats, site = "https://www.getsmallfish.com"): Message {
  const totalSignups = Object.values(s.signups).reduce((a, b) => a + b, 0);
  const heads = [
    s.replied ? `${s.replied} repl${s.replied === 1 ? "y" : "ies"}` : null,
    totalSignups ? `${totalSignups} signup${totalSignups === 1 ? "" : "s"}` : null,
    s.held.length ? `${s.held.length} to look at` : null,
  ].filter(Boolean);
  const subject = `Small Fish, ${s.day}: ${heads.length ? heads.join(", ") : "quiet day, all running"}`;

  const out: string[] = [];
  out.push(s.sending ? "Sending is on." : `Sending starts ${s.goLive}. Until then the machine finds and queues.`);
  out.push("");
  out.push("OUTREACH");
  out.push(line("New prospects found", s.found));
  out.push(line("Queued in Instantly", s.queued));
  out.push(line("Emails sent", s.sent));
  out.push(line("Opened their free list", s.visits));
  out.push(line("Replies", s.replied));
  out.push(line("Answered automatically", s.autoReplied));
  if (s.unsubscribed || s.bounced) out.push(`Asked to stop: ${s.unsubscribed}, bounced: ${s.bounced}`);
  out.push(
    `Ready to send: ${s.queueReady.agency} agencies by trade, ${s.queueReady.widget} widget, ${s.queueReady.seller} sellers`,
  );
  out.push("");
  out.push("FREE TOOLS AND PAGES");
  out.push(line("Website checks", s.checks) + (s.embedChecks ? ` (${s.embedChecks} from agency widgets)` : ""));
  out.push(line("AI assistant calls (MCP)", s.mcpCalls));
  out.push(`How-many pages: ${s.pagesCounted} new, ${s.pagesTotal.toLocaleString("en-US")} live`);
  out.push("");
  out.push("MONEY");
  if (totalSignups) {
    out.push(
      `Signups: ${totalSignups} (${Object.entries(s.signups)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")})`,
    );
  } else {
    out.push("Signups: 0");
  }
  out.push(line("Paying workspaces from these channels", s.paying));
  if (s.held.length) {
    out.push("");
    out.push("NEEDS A LOOK");
    for (const h of s.held.slice(0, 8)) out.push(`- ${h.kind}: ${h.who}. ${h.why}`);
    if (s.held.length > 8) out.push(`- and ${s.held.length - 8} more`);
  }
  out.push("");
  out.push(`Everything: ${site}/ops/outreach`);
  return { subject, text: out.join("\n") };
}

/** "outreach/AbC123" and "check/acme.com" are one channel each. */
export const channelOf = (source: string | null): string => {
  const s = (source ?? "direct").split("/")[0];
  return s || "direct";
};
