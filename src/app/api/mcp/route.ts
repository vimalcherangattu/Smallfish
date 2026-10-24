import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { takeScan } from "@/lib/countcache";
import { findCandidates, Rationed } from "@/lib/providers";
import { logEvent } from "@/lib/prospecting";
import { resolveRegion, type Places } from "@/lib/region";
import { CHECKABLE, runCheck, type Checkable } from "@/lib/sitecheck";
import { matchTrade, type Taxonomy } from "@/lib/trades";

/**
 * Small Fish as an MCP server (GTM, 2026-10-16).
 *
 * People increasingly ask an assistant ("how many dentists are in Phoenix?",
 * "does this salon take bookings online?") instead of a search box. This puts
 * two of our free answers where those questions are asked, each ending with a
 * link to the full search, so an assistant that uses us also sends people to
 * us. Listed in the MCP directories; no account, no key.
 *
 * Streamable HTTP, stateless, JSON responses: `initialize`, `tools/list`,
 * `tools/call`, `ping`. Written by hand rather than with the SDK, because four
 * methods do not justify a dependency in a file both streams share.
 *
 * The tools are the free surfaces we already run, with their limits:
 *   count_businesses   the pool count (open data, no model call)
 *   check_website      the website checker (5 a day per caller, 300 overall)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://www.getsmallfish.com";
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const dir = path.join(process.cwd(), "public", "data");
const json = async <T,>(n: string) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as T;

const TOOLS = [
  {
    name: "count_businesses",
    title: "Count local businesses",
    description:
      "How many businesses of a kind exist in a US city or state, and how many have a website. " +
      "Use for questions like 'how many dentists are in Dallas, TX'. Free, from open listings data.",
    inputSchema: {
      type: "object",
      properties: {
        business_type: { type: "string", description: "A kind of business in plain words, e.g. 'dentists', 'HVAC', 'hair salons'." },
        area: { type: "string", description: "A US city with state ('Phoenix, AZ') or a state ('Texas')." },
      },
      required: ["business_type", "area"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "check_website",
    title: "Check a business website",
    description:
      "Read a local business's website and say whether it has online booking, a way to request a quote, " +
      "or live chat, with the reason. Free, a few checks per day.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The business's website, e.g. 'luckyshears.com'." },
        look_for: { type: "string", enum: [...CHECKABLE], description: "booking, quote_form or chat." },
      },
      required: ["url", "look_for"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], isError });

const findLink = (source: string) => `${SITE}/app/find?source=${encodeURIComponent(source)}`;

async function countBusinesses(args: Record<string, unknown>, req: Request) {
  const what = String(args.business_type ?? "").trim().slice(0, 80);
  const where = String(args.area ?? "").trim().slice(0, 80);
  if (!what || !where) return text("Give a business type and a US city or state.", true);
  const [taxo, places] = await Promise.all([json<Taxonomy>("trades.json"), json<Places>("places-us.json")]);
  const trade = matchTrade(taxo, what).best;
  if (!trade) return text(`"${what}" is not a kind of business in the listings. Try the trade on its own: dentists, plumbers, salons.`, true);
  const region = resolveRegion(places, where);
  if (!region) return text(`"${where}" is not a US city or state we can place. Try "City, ST".`, true);
  // Cached for a week, and a fresh scan rationed per caller address, like the
  // page: an agent in a loop is the cheapest way to spend the CPU budget.
  let s;
  try {
    s = await findCandidates(
      { categories: trade.categories, trade: what, region, rows: false },
      undefined,
      { allowScan: () => takeScan(req) },
    );
  } catch (err) {
    if (err instanceof Rationed) {
      return text("Too many fresh counts from this address today. Counts already asked for still answer; try a new one within the hour.", true);
    }
    throw err;
  }
  await logEvent("mcp_count", {}, { what: trade.typed, where: region.label, listings: s.listings });
  return text(
    `${s.listings.toLocaleString("en-US")} ${trade.typed} in ${region.label}, ` +
      `${s.withSite.toLocaleString("en-US")} of them with a website.\n\n` +
      `Small Fish can narrow these to the ones that fit what you sell (for example "no online booking"), ` +
      `with a phone, an email and a one-line reason to reach out. The first ones are free: ${findLink("mcp")}`,
  );
}

async function checkWebsite(args: Record<string, unknown>, req: Request) {
  const url = String(args.url ?? "").trim().slice(0, 300);
  const signal = String(args.look_for ?? "") as Checkable;
  if (!CHECKABLE.includes(signal)) return text("look_for must be booking, quote_form or chat.", true);
  // The MCP client's address stands in for the visitor, so the daily limit
  // holds per caller the way it does on the page.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const visitor = createHash("sha256").update(`${new Date().toISOString().slice(0, 10)}:${ip}:mcp`).digest("hex").slice(0, 24);
  const r = await runCheck(url, signal, visitor, "mcp");
  if (!r.ok) return text(r.reason ?? "Could not check that site.", true);
  const what = r.label?.replace(/^(a|an) /, "") ?? signal;
  const line =
    r.answer === "yes" ? `Yes, the site has ${r.label}.` : r.answer === "no" ? `No ${what} on the site.` : "Couldn't tell from the site.";
  return text(`${line}${r.proof ? ` ${r.proof}` : ""}\n\nTo find every business in a city that is missing it: ${findLink("mcp")}`);
}

async function handle(m: Rpc, req: Request) {
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "small-fish", title: "Small Fish", version: "1.0.0" },
        instructions:
          "Small Fish finds local US businesses that fit a description. Use count_businesses for how many of a kind " +
          "exist in an area, and check_website to see whether a business's site has online booking, a quote form or live chat.",
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        if (name === "count_businesses") return ok(m.id, await countBusinesses(args, req));
        if (name === "check_website") return ok(m.id, await checkWebsite(args, req));
        return fail(m.id, -32602, `Unknown tool: ${name}`);
      } catch {
        return ok(m.id, text("Something went wrong on our side. Try again in a minute.", true));
      }
    }
    default:
      return m.id === undefined ? null : fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(req: Request) {
  let body: Rpc | Rpc[];
  try {
    body = (await req.json()) as Rpc | Rpc[];
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  const batch = Array.isArray(body) ? body : [body];
  const out = (await Promise.all(batch.map((m) => handle(m, req)))).filter(Boolean);
  // Notifications alone get 202 and no body, as the transport requires.
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? out : out[0], { headers: { "cache-control": "no-store" } });
}

/** No server-initiated stream: this server only answers. */
export function GET() {
  return new Response("Small Fish MCP server. POST JSON-RPC here.", { status: 405, headers: { allow: "POST" } });
}
