/**
 * Answering every reply, with no person in the loop (GTM, outreach A4).
 *
 * The owner's decision of 2026-10-15: zero human interaction, support
 * included. So a reply is read by the model, sorted into one of a handful of
 * intents, and answered from a fixed sheet of facts. The prompt and the rules
 * around it are what keep that safe:
 *
 * - **Facts come from code, not from the model.** Prices are `PLANS`, the free
 *   allowance is `PLANS.free`, links are built here. The model is told it may
 *   only use the sheet, and a reply that names a dollar figure the sheet does
 *   not contain is not sent.
 * - **Stopping wins every tie.** Anything that reads as "no", "stop",
 *   "remove", or annoyance is `unsubscribe`, which sends nothing and blocks the
 *   address everywhere. A missed sale costs less than a second unwanted email.
 * - **Three answers per thread, then silence.** A conversation that needs a
 *   fourth automated answer needs something the sheet does not have.
 * - **No promise of a person.** There is no call to book and nobody to hand
 *   to, so the model is told never to offer either.
 */

import { PLANS } from "@/lib/pricing";

export type Intent =
  | "interested"
  | "question"
  | "other_list"
  | "unsubscribe"
  | "out_of_office"
  | "wrong_person"
  | "other";

export interface Decision {
  intent: Intent;
  /** For `other_list`: what they asked for instead, in their words. */
  trade?: string | null;
  city?: string | null;
  /** HTML body to send, or null to send nothing. */
  reply: string | null;
  /** Why nothing was sent, when nothing was. */
  held?: string;
}

export const MAX_AUTO_REPLIES = 3;

export interface ReplyContext {
  company: string;
  niche: string;
  city: string;
  listUrl: string;
  signUpUrl: string;
  sender: string;
  site: string;
}

export function factSheet(c: ReplyContext): string {
  const free = PLANS.find((p) => p.id === "free")!;
  const paid = PLANS.filter((p) => ["starter", "growth", "agency"].includes(p.id));
  return [
    `Small Fish finds local businesses that fit a description, in any US city, by reading each business's own website.`,
    `You say the trade, the place, and what to look for in plain words ("no online booking", "no quote form", "no live chat"). It reads their sites and keeps only the ones that fit, each with the reason, taken from the business's own site.`,
    `Contacts: the phone and email each business publishes on its own site, when it publishes them.`,
    `Pricing: you only pay for businesses that fit. The first ${free.credits} are free, no card. Plans: ${paid
      .map((p) => `${p.name} $${p.priceUsd}/month for up to ${p.credits}`)
      .join("; ")}. A wrong match is refunded in one click.`,
    `It works in any US city. It does not cover outside the US yet.`,
    `Exports: CSV, and pushing to a CRM from inside the app.`,
    `There are no calls or demos; everything is self-serve at ${c.site}.`,
    `This prospect's free list: ${c.listUrl}`,
    `Start the full list free: ${c.signUpUrl}`,
  ].join("\n");
}

export function prompt(c: ReplyContext, history: string, incoming: string): string {
  return (
    `You answer replies to a cold email from Small Fish. You write as ${c.sender}. ` +
    `The prospect is ${c.company}, a marketing agency serving ${c.niche} in ${c.city}.\n\n` +
    `FACTS (the only things you may state):\n${factSheet(c)}\n\n` +
    `RULES\n` +
    `- If the reply asks to stop, says no, not interested, remove me, or sounds annoyed: intent "unsubscribe", reply null.\n` +
    `- Out-of-office or automatic reply: intent "out_of_office", reply null.\n` +
    `- They say they are the wrong person and name nobody: intent "wrong_person", reply null.\n` +
    `- They ask for a different city or trade: intent "other_list", fill trade and city in their words, reply null (the link is built for you).\n` +
    `- Interested or asking a question: answer it in at most 90 words, plain and friendly, using only the FACTS. End with the most useful link from the FACTS.\n` +
    `- If the FACTS do not answer their question, say so honestly in one sentence and point to the free list. Never invent a feature, price, number or person.\n` +
    `- Never offer a call, a demo, a meeting, or a human. There are none.\n` +
    `- No em dashes. No sign-off beyond "${c.sender.split(" ")[0]}".\n\n` +
    `EARLIER IN THE THREAD\n${history.slice(0, 4000)}\n\n` +
    `THEIR REPLY\n${incoming.slice(0, 4000)}\n\n` +
    `Answer as JSON only: {"intent":"interested|question|other_list|unsubscribe|out_of_office|wrong_person|other","trade":null,"city":null,"reply":"<text with \\n line breaks, or null>"}`
  );
}

const STOP =
  /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (email|contact)|don'?t (email|contact)|not interested|no thanks|no thank you|leave (me|us) alone|spam|reported)\b/i;

/** The words that mean stop, checked before the model is asked anything. A
 *  bare "no" on its own line counts: the footer tells them to reply "no". */
export function plainlyStop(text: string): boolean {
  const first = (text ?? "").trim().split(/\n/)[0].trim();
  return STOP.test(text ?? "") || /^(no|nope|stop|remove)[.!]*$/i.test(first);
}

/** Dollar figures the sheet does not contain mean the model made one up. */
export function inventsPrice(reply: string, sheet: string): boolean {
  const allowed = new Set(sheet.match(/\$\d[\d,]*/g) ?? []);
  return (reply.match(/\$\d[\d,]*/g) ?? []).some((p) => !allowed.has(p));
}

export const textToHtml = (t: string) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)
    .replace(/\n/g, "<br/>");

/**
 * Settle one reply. `ask` is the model call, injected so the rules above can
 * be tested without one.
 */
export async function decide(
  c: ReplyContext,
  history: string,
  incoming: string,
  priorAutoReplies: number,
  ask: (prompt: string) => Promise<string>,
): Promise<Decision> {
  if (plainlyStop(incoming)) return { intent: "unsubscribe", reply: null, held: "asked to stop" };
  if (priorAutoReplies >= MAX_AUTO_REPLIES) {
    return { intent: "other", reply: null, held: `already answered ${priorAutoReplies} times in this thread` };
  }

  let out: { intent?: Intent; trade?: string | null; city?: string | null; reply?: string | null };
  try {
    const raw = await ask(prompt(c, history, incoming));
    out = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  } catch {
    return { intent: "other", reply: null, held: "the model did not answer usably" };
  }

  const intent = (out.intent ?? "other") as Intent;
  if (intent === "unsubscribe" || intent === "out_of_office" || intent === "wrong_person") {
    return { intent, reply: null };
  }
  if (intent === "other_list") {
    return { intent, trade: out.trade ?? null, city: out.city ?? null, reply: null };
  }
  // No em dashes in anything we send; swapped rather than refused.
  const text = (out.reply ?? "").trim().replace(/\s*—\s*/g, ", ");
  if (!text) return { intent, reply: null, held: "nothing to say" };
  if (inventsPrice(text, factSheet(c))) return { intent, reply: null, held: "the draft named a price not on the sheet" };
  if (/\b(demo|meeting|zoom|calendly|(book|schedule|hop on|jump on|quick) a call)\b/i.test(text)) {
    return { intent, reply: null, held: "the draft offered a call or a demo" };
  }
  return { intent, reply: textToHtml(text) };
}

/** The answer to "send me X in Y instead": a link that opens the app with the
 *  search typed. Free to them and costs us nothing until they run it. */
export function otherListReply(c: ReplyContext, trade: string | null, city: string | null): string | null {
  const what = (trade || c.niche).trim();
  const where = (city || c.city).trim();
  if (!what || !where) return null;
  const q = `${what} in ${where}`;
  const url = `${c.site}/sign-up?${new URLSearchParams({ source: "outreach/reply", q })}`;
  return textToHtml(
    `Here you go, ${q}: ${url}\n\nIt opens with the search already typed. The first ${
      PLANS.find((p) => p.id === "free")!.credits
    } that fit are free.\n\n${c.sender.split(" ")[0]}`,
  );
}
