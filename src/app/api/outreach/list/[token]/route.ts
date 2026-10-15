import { readFile } from "node:fs/promises";
import path from "node:path";

import { suppressedIds } from "@/lib/db";
import { buildList } from "@/lib/prospecting";
import type { Places } from "@/lib/region";
import type { Taxonomy } from "@/lib/trades";

/**
 * Build a prospect's free list on their first visit (GTM, outreach A2).
 *
 * Open, because the person clicking an email has no account, and that is the
 * point. What keeps it from being anybody's model budget:
 *
 * - the token is ten unguessable characters, and an unknown one is a 404;
 * - a list is built once and then served from the row;
 * - `DAILY_LIST_CAP` lists a day across every token, after which the page says
 *   to come back tomorrow rather than spending.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const dir = path.join(process.cwd(), "public", "data");
const json = async <T,>(name: string): Promise<T> =>
  JSON.parse(await readFile(path.join(dir, name), "utf8")) as T;

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const [taxo, places, sup] = await Promise.all([
    json<Taxonomy>("trades.json"),
    json<Places>("places-us.json"),
    suppressedIds((p) => readFile(p, "utf8"), dir),
  ]);
  const r = await buildList(token, { taxo, places, suppressed: sup.ids });
  if (!r.ok && r.reason === "unknown") return Response.json(r, { status: 404 });
  return Response.json(r, { headers: { "cache-control": "no-store" } });
}
