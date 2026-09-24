import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchSuppressed, staticList, type SuppressionList } from "@/lib/db";

/** The suppression list, from the database if there is one (S1-09).
 *
 *  The app used to fetch `/data/suppressed.json` directly, which meant a
 *  business that asked to be removed stayed visible until someone committed a
 *  file and redeployed. The opt-out page promises removal within seven days;
 *  that promise was being kept by a person remembering to do something.
 *
 *  This route changes where the list comes from, not what the app does with it.
 *  With no database configured it serves the same file as before and says so,
 *  so nothing regresses before the project exists — and the moment it does, a
 *  removal takes effect on the next request with no deploy.
 *
 *  **A read failure serves the file rather than an empty list.** An error here
 *  would otherwise unsuppress everyone at once, which is the worst possible
 *  failure mode for this particular endpoint: it is silent, it looks like
 *  normal operation, and it breaks the one promise made to people who are not
 *  customers and never agreed to be in the product at all. */

export const dynamic = "force-dynamic";

async function fromFile(): Promise<string[]> {
  try {
    const file = path.join(process.cwd(), "public", "data", "suppressed.json");
    const json = JSON.parse(await readFile(file, "utf8")) as { businessIds?: string[] };
    return json.businessIds ?? [];
  } catch {
    return [];
  }
}

export async function GET() {
  const file = await fromFile();
  let list: SuppressionList;
  let degraded: string | null = null;

  try {
    list = (await fetchSuppressed()) ?? staticList(file);
  } catch (err) {
    list = staticList(file);
    degraded =
      "The database could not be read, so this is the committed file. " +
      "Businesses suppressed since the last deploy are missing from it. " +
      String(err instanceof Error ? err.message : err);
  }

  // The union, always. If the database is reachable, the committed file is
  // still the historical record, and a business in one but not the other should
  // be suppressed rather than argued about.
  const ids = [...new Set([...list.businessIds, ...file])];

  return Response.json(
    { businessIds: ids, source: list.source, note: list.note, degraded },
    {
      // 200 even when degraded, deliberately. The body is still the list the
      // caller should apply — it is the same file the app served before any
      // database existed. A 5xx would tell a client to discard a payload it
      // ought to use, and the failure mode of discarding this one is showing
      // every business that asked to be left out.
      status: 200,
      // Never cached: a removal that takes effect on the next request is the
      // whole point, and a CDN holding this for an hour would undo it.
      headers: { "cache-control": "no-store" },
    },
  );
}
