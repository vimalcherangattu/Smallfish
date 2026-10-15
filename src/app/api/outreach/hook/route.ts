import { block, reply, thread, type Email } from "@/lib/instantly";
import { hookAuthorised } from "@/lib/outreachauth";
import { listCriterion, logEvent, rest, suppressOutreach } from "@/lib/prospecting";
import { NICHES } from "@/lib/prospects";
import { decide, otherListReply, type ReplyContext } from "@/lib/replies";
import { companyName } from "@/lib/sequence";

/**
 * Instantly's webhook (GTM, outreach A4).
 *
 * Every event is written to `gtm_events` as Instantly names it, which is the
 * whole tracking story for the email half of the funnel. Four of them also
 * change something:
 *
 *   reply_received     answered automatically, see `replies.ts`
 *   lead_unsubscribed  suppressed here and blocked in Instantly
 *   email_bounced      the prospect is marked bounced and never retried
 *   (a reply that says stop) the same as unsubscribed
 *
 * Authorised by the derived header `ensureWebhook` registered. Always answers
 * 200 once authorised, even when handling fails, so Instantly does not retry
 * a reply into a second answer; the failure is in the log instead.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.getsmallfish.com").replace(/\/$/, "");
const MODEL = process.env.SMALLFISH_MODEL_REPLY ?? process.env.SMALLFISH_MODEL_WORKER ?? "claude-sonnet-5";

type Hook = Record<string, unknown> & { event_type?: string; lead_email?: string; email_account?: string };

const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? null;

async function prospectFor(email: string) {
  const rows = (await rest(
    `gtm_prospects?email=eq.${encodeURIComponent(email.toLowerCase())}&select=domain,name,niche,city,state,list_token,list_query&limit=1`,
  )) as Array<{ domain: string; name: string | null; niche: string | null; city: string | null; state: string | null; list_token: string | null; list_query: string | null }> | null;
  return rows?.[0] ?? null;
}

async function setStatus(domain: string, status: string) {
  await rest(`gtm_prospects?domain=eq.${encodeURIComponent(domain)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
}

async function stop(email: string, domain: string | null, why: string) {
  await suppressOutreach(email, why);
  await block(email).catch(() => null);
  if (domain) await setStatus(domain, "suppressed");
  await logEvent("suppressed", { domain, email }, { why });
}

async function ask(prompt: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: prompt }] });
  return res.content.map((c) => ("text" in c ? c.text : "")).join("");
}

const textOf = (e: Email) =>
  e.body?.text ?? (e.body?.html ?? e.content_preview ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Their words only: cut the quoted thread under the first "On … wrote:". */
const fresh = (t: string) => t.split(/\n?On .{5,120}wrote:|\n>|-----Original Message-----/)[0].trim();

async function answer(email: string) {
  const p = await prospectFor(email);
  const domain = p?.domain ?? domainOf(email);
  const msgs = await thread(email);
  const incoming = msgs.find((m) => (m.from_address_email ?? "").toLowerCase() === email.toLowerCase());
  if (!incoming) return logEvent("reply_unhandled", { domain, email }, { why: "reply not found in thread" });
  if (incoming.is_auto_reply === 1) return logEvent("auto_reply_ignored", { domain, email });

  const ours = msgs.filter((m) => m !== incoming && (m.from_address_email ?? "").toLowerCase() !== email.toLowerCase());
  const prior = ((await rest(
    `gtm_events?email=eq.${encodeURIComponent(email.toLowerCase())}&kind=eq.auto_replied&select=id`,
  )) as unknown[] | null)?.length ?? 0;

  const n = NICHES.find((x) => x.id === p?.niche);
  const ctx: ReplyContext = {
    company: companyName(p?.name ?? null, domain ?? email),
    niche: n?.label ?? "local businesses",
    city: p?.city ?? "your city",
    listUrl: p?.list_token ? `${SITE}/hi/${p.list_token}` : SITE,
    signUpUrl: `${SITE}/app/find?${new URLSearchParams({ source: `outreach/${p?.list_token ?? "reply"}` })}`,
    sender: incoming.eaccount.split("@")[0].replace(/^\w/, (c) => c.toUpperCase()),
    site: SITE,
  };
  const history = ours.slice(0, 3).map((m) => fresh(textOf(m))).reverse().join("\n---\n");
  const said = fresh(textOf(incoming));
  const d = await decide(ctx, history, said, prior, ask);
  await logEvent("reply_classified", { domain, email }, { intent: d.intent, held: d.held ?? null, said: said.slice(0, 1000) });

  if (d.intent === "unsubscribe" || d.intent === "wrong_person") {
    return stop(email, domain, d.intent === "wrong_person" ? "said wrong person" : "asked to stop");
  }
  if (domain) await setStatus(domain, d.intent === "interested" || d.intent === "question" ? "interested" : "replied");

  const html = d.intent === "other_list" ? otherListReply(ctx, d.trade ?? null, d.city ?? null) : d.reply;
  if (!html) return d.held ? logEvent("reply_held", { domain, email }, { intent: d.intent, why: d.held }) : undefined;
  const subject = incoming.subject.startsWith("Re:") ? incoming.subject : `Re: ${incoming.subject}`;
  await reply(incoming, subject, html);
  await logEvent("auto_replied", { domain, email }, { intent: d.intent, body: html.slice(0, 2000) });
}

export async function POST(req: Request) {
  if (!hookAuthorised(req)) return Response.json({ ok: false }, { status: 401 });
  let h: Hook;
  try {
    h = (await req.json()) as Hook;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const kind = String(h.event_type ?? "unknown");
  const email = String(h.lead_email ?? "").toLowerCase() || null;
  const domain = email ? domainOf(email) : null;
  // The whole payload minus anything that is a full message body: the log
  // keeps what happened, `answer` fetches the text when it needs it.
  const detail = Object.fromEntries(Object.entries(h).filter(([k]) => !/body|html/i.test(k)));
  await logEvent(kind, { domain, email }, detail);

  try {
    if (email && kind === "reply_received") await answer(email);
    else if (email && kind === "lead_unsubscribed") await stop(email, domain, "unsubscribed in Instantly");
    else if (email && kind === "email_bounced" && domain) await setStatus(domain, "bounced");
  } catch (err) {
    await logEvent("hook_failed", { domain, email }, { kind, error: String(err).slice(0, 300) });
  }
  return Response.json({ ok: true });
}
