import { inboxes, instantlyReady } from "@/lib/instantly";
import { checkDomains, domainsOf } from "@/lib/mailauth";
import { channelOf, buildDigest, type DigestStats } from "@/lib/digest";
import { sendMail } from "@/lib/mail";
import { schedulerAuthorised } from "@/lib/outreachauth";
import { logEvent, rest } from "@/lib/prospecting";
import { blocked, dailyPerInbox, GO_LIVE, type Prospect } from "@/lib/sequence";
import { suppressedOutreach } from "@/lib/prospecting";

/**
 * The owner's morning email (GTM). pg_cron, once a day. Counts the last 24
 * hours from the tables the rest of the machine writes, and sends to the
 * first address in OPS_EMAILS through the same Resend path the product uses.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ev = { kind: string; email: string | null; domain: string | null; detail: Record<string, unknown> };

export async function GET(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
  const to = (process.env.OPS_EMAILS ?? "").split(",")[0]?.trim();
  if (!to) return Response.json({ ok: false, reason: "OPS_EMAILS is not set" });

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [events, checks, counts, total, accounts, ready] = await Promise.all([
    rest(`gtm_events?at=gte.${since}&select=kind,email,domain,detail&limit=10000`) as Promise<Ev[]>,
    rest(`gtm_checks?at=gte.${since}&select=ref&limit=5000`) as Promise<Array<{ ref: string | null }>>,
    rest(`gtm_counts?computed_at=gte.${since}&select=slug&limit=5000`) as Promise<unknown[]>,
    rest(`gtm_counts?select=slug&limit=5000`) as Promise<unknown[]>,
    rest(`accounts?created_at=gte.${since}&select=source,plan_id&limit=1000`).catch(() => []) as Promise<
      Array<{ source: string | null; plan_id: string }>
    >,
    rest(
      "gtm_prospects?status=eq.found&select=domain,name,email,niche,city,state,status,list_token,list_query,list_readable,list_listings,audience&limit=5000",
    ) as Promise<Array<Prospect & { audience: string }>>,
  ]);
  const ev = events ?? [];
  const k = (kind: string) => ev.filter((e) => e.kind === kind).length;
  const sup = await suppressedOutreach();
  const queueReady = { agency: 0, seller: 0, widget: 0 };
  for (const p of ready ?? []) {
    if (blocked(p, { suppressedDomains: sup.domains, suppressedEmails: sup.emails })) continue;
    const a = p.audience === "seller" ? "seller" : p.audience === "widget" ? "widget" : "agency";
    queueReady[a] += 1;
  }
  const signups: Record<string, number> = {};
  for (const a of accounts ?? []) signups[channelOf(a.source)] = (signups[channelOf(a.source)] ?? 0) + 1;

  let sending = false;
  const boxes = instantlyReady() ? await inboxes().catch(() => []) : [];
  if (boxes.length && dailyPerInbox(new Date().toISOString().slice(0, 10)) > 0) sending = boxes.every((b) => b.ready);
  // The sending domains' SPF and DMARC, asked of DNS every morning.
  const auth = (await checkDomains(domainsOf(boxes.map((b) => b.email))).catch(() => []))
    .flatMap((d) => d.problems.map((why) => ({ kind: "sending domain", who: d.domain, why })));

  const stats: DigestStats = {
    day: new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" }),
    found: ev.filter((e) => e.kind === "prepared").length,
    queued: k("queued"),
    sent: k("email_sent"),
    opened: k("email_opened"),
    replied: new Set(ev.filter((e) => e.kind === "reply_received").map((e) => e.email)).size,
    autoReplied: k("auto_replied"),
    unsubscribed: k("lead_unsubscribed") + k("suppressed"),
    bounced: k("email_bounced"),
    visits: new Set(ev.filter((e) => e.kind === "visited").map((e) => e.domain)).size,
    listsBuilt: k("list_built"),
    checks: (checks ?? []).length,
    embedChecks: (checks ?? []).filter((c) => c.ref && c.ref !== "mcp").length,
    mcpCalls: k("mcp_count") + (checks ?? []).filter((c) => c.ref === "mcp").length,
    pagesCounted: (counts ?? []).length,
    pagesTotal: (total ?? []).length,
    signups,
    paying: (accounts ?? []).filter((a) => a.plan_id !== "free").length,
    queueReady,
    held: ev
      .filter((e) => ["reply_held", "reply_unhandled", "hook_failed", "webhook_failed", "contacts_failed", "research_failed"].includes(e.kind))
      .map((e) => ({ kind: e.kind.replace(/_/g, " "), who: e.email ?? e.domain ?? "system", why: String(e.detail.why ?? e.detail.error ?? "").slice(0, 140) }))
      .concat(auth),
    goLive: GO_LIVE,
    sending,
  };
  const msg = buildDigest(stats);
  const r = await sendMail(to, msg);
  await logEvent("digest_sent", {}, { sent: r.sent, why: r.sent ? null : r.why, subject: msg.subject });
  return Response.json({ ok: r.sent, subject: msg.subject, why: r.sent ? null : r.why }, { headers: { "cache-control": "no-store" } });
}
