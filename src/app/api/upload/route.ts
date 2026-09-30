import { accountForUser, addJobSites, queueJob } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { criterionForCheck, parseUpload } from "@/lib/csvimport";
import { estimateSeconds, worthLeaving } from "@/lib/jobs";
import { NotConfigured } from "@/lib/accounts";

/**
 * A list the customer already has, queued for reading (P1).
 *
 * ## Why this route is the cheapest thing on the launch list
 *
 * Everything else that reads a new market is downstream of candidate supply,
 * which is Python and cannot run on Vercel. An upload brings its own
 * candidates, so an agency with a bought list gets the whole product — reading,
 * evidence, drafted openers — in a city nobody has extracted, today.
 *
 * ## Two things it will not do
 *
 * **Take a free-text question.** The criterion is a `signals.ts` id, and
 * `criterionForCheck` refuses anything that is not a provable signal in the
 * catalogue. That is not squeamishness about strings: the catalogue's
 * `provable: false` entries exist so this product refuses out loud instead of
 * answering questions the engine cannot settle, and a free-text box routes
 * straight around them.
 *
 * **Accept a file of any size.** The body is capped, the row count is capped,
 * and both caps are stated in the refusal. A 200,000-row paste is a job nobody
 * can afford to read and a request nobody should have to parse.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Bytes of CSV. About 20,000 rows of name/site/phone — comfortably past the
 *  row cap below, so the row cap is what a customer actually meets. */
const MAX_BYTES = 2_000_000;
/** Rows read per upload. A read of this many is ~40 minutes at measured rates. */
const MAX_ROWS = 5_000;

export async function POST(req: Request) {
  if (!CLERK_ENABLED) {
    return Response.json(
      { ok: false, reason: "Accounts are not switched on on this deployment." },
      { status: 503 },
    );
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      {
        ok: false,
        reason: "Sign up first — a read is queued against your workspace.",
        signIn: "/sign-up",
      },
      { status: 401 },
    );
  }

  let body: { csv?: unknown; check?: unknown; label?: unknown; email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    return Response.json({ ok: false, reason: "The file was empty." }, { status: 400 });
  }
  if (csv.length > MAX_BYTES) {
    return Response.json(
      {
        ok: false,
        reason:
          `That file is ${(csv.length / 1_000_000).toFixed(1)} MB and the limit is ` +
          `${MAX_BYTES / 1_000_000} MB. Split it, or send the columns you need — a ` +
          `name, a website and a phone number is all this reads.`,
      },
      { status: 413 },
    );
  }

  // The criterion, from the catalogue. A refusal here is the catalogue doing
  // its job, so it says which it was rather than "invalid input".
  const criterion = criterionForCheck(String(body.check ?? ""));
  if (!criterion) {
    return Response.json(
      {
        ok: false,
        reason:
          "That is not something we can settle from a website. Pick one of the " +
          "checks offered — each one names what it looks for on the page.",
      },
      { status: 400 },
    );
  }

  const parsed = parseUpload(csv, MAX_ROWS);
  if (!parsed.rows.length) {
    return Response.json(
      {
        ok: false,
        reason: parsed.matched.site
          ? `We found the "${parsed.matched.site}" column but no row in it held a ` +
            `website we could open.`
          : "We could not find a website column. Name one of them `website`, `url` " +
            "or `domain`, or make sure most rows carry an address like acme.com.",
        skipped: parsed.skipped.slice(0, 5),
      },
      { status: 400 },
    );
  }

  try {
    const account = await accountForUser(userId);
    if (!account) {
      return Response.json(
        {
          ok: false,
          reason:
            "You have no workspace yet. Open your account page once and it will " +
            "make one, then try again.",
        },
        { status: 409 },
      );
    }

    const label = String(body.label ?? "").trim().slice(0, 80) || "your list";
    const query = `${label} — ${criterion.text}`;
    const seconds = estimateSeconds(parsed.rows.length);

    const id = await queueJob({
      accountId: account.id,
      query,
      // No market: the sites are on the job, and `criterionForCheck` rebuilds
      // the criterion from this id when the worker picks it up.
      marketId: null,
      criterionId: criterion.id,
      regionLabel: label,
      sites: parsed.rows.length,
      estimateSeconds: seconds,
      notifyEmail:
        typeof body.email === "string" && body.email.includes("@")
          ? body.email.trim().slice(0, 200)
          : null,
    });

    await addJobSites(
      id,
      parsed.rows.map((r, i) => ({
        // Stable and ours: an uploaded row exists in no other table, and using
        // the customer's own id would let two uploads collide inside one job.
        business_id: `upload:${id}:${i + 1}`,
        name: r.name,
        site: r.site,
        phone: r.phone,
        ordinal: i + 1,
      })),
    );

    return Response.json({
      ok: true,
      id,
      sites: parsed.rows.length,
      seconds,
      worthLeaving: worthLeaving(parsed.rows.length),
      // What we did with their file, in their terms. A row that was dropped is
      // named here rather than quietly missing from the count at the end.
      matched: parsed.matched,
      skipped: parsed.skipped.length,
      skippedExamples: parsed.skipped.slice(0, 5),
      duplicates: parsed.duplicates,
      href: `/app/reads/${id}`,
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}
