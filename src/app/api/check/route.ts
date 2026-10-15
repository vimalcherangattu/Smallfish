import { CHECKABLE, runCheck, visitorOf, type Checkable } from "@/lib/sitecheck";

/** The free website checker (GTM). Open: see the limits in `sitecheck.ts`.
 *  CORS-open as well, because agencies embed it on their own sites. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { headers: cors });
}

export async function POST(req: Request) {
  let body: { url?: unknown; signal?: unknown; ref?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Expected JSON." }, { status: 400, headers: cors });
  }
  const url = String(body.url ?? "").trim().slice(0, 300);
  const signal = String(body.signal ?? "booking") as Checkable;
  if (!CHECKABLE.includes(signal)) return Response.json({ ok: false, reason: "Pick what to look for." }, { status: 400, headers: cors });
  const ref = typeof body.ref === "string" && /^[a-z0-9.-]{3,80}$/i.test(body.ref) ? body.ref.toLowerCase() : null;
  const r = await runCheck(url, signal, visitorOf(req), ref).catch(() => ({ ok: false, reason: "Something went wrong on our side." }));
  return Response.json(r, { headers: { ...cors, "cache-control": "no-store" } });
}
