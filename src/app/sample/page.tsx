import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import SampleForm from "@/components/SampleForm";
import WaitlistForm from "@/components/WaitlistForm";
import { doorFor, signUpHref } from "@/lib/doors";
import { candidatesFor, inferFromOffer } from "@/lib/icp";
import type { MarketIndex } from "@/lib/types";

/**
 * The free sample — the GTM plan's main lead magnet.
 *
 * ## Why this is not a form that promises a sample later
 *
 * The plan describes it as *"what you sell, city, email"*, and the obvious build
 * is a form that captures an address and mails something. That is a worse
 * product and a worse magnet: it asks a stranger to trust us before we have
 * shown them anything, and the whole argument of Small Fish is that it shows
 * you the evidence.
 *
 * So the sample **is the answer**. Type what you sell, and the page names three
 * real businesses — by name, with their number and the sentence off their own
 * site — in about two seconds. The email is asked for only where we genuinely
 * cannot answer yet, which is a queue entry rather than a lead magnet, and is
 * described as one.
 *
 * ## It is four built things pointed at a stranger
 *
 * `inferFromOffer` reads what somebody sells and proposes only criteria the
 * engine can settle; `candidatesFor` puts measured counts against them;
 * `doorFor` picks three businesses that survive four guards; `handoff` carries
 * the whole thing through sign-up so nothing is typed twice. None of it is new,
 * and none of it was reachable without an account.
 *
 * ## What it refuses to do
 *
 * Invent a criterion. `inferFromOffer` returns the unprovable signals it
 * matched, separately, and this page names them — the ICP flow's rule 1, which
 * exists because an appealing ICP the engine cannot deliver is worse than not
 * offering the flow at all.
 */

export const dynamic = "force-dynamic";
export const metadata = {
  title: "See three of your customers, free — Small Fish",
  description:
    "Tell us what you sell. We name three small businesses that need it, with " +
    "the sentence off their own website that says so. No account.",
};

async function index(): Promise<MarketIndex | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", "index.json"), "utf8"),
    ) as MarketIndex;
  } catch {
    return null;
  }
}

export default async function Sample({
  searchParams,
}: {
  searchParams: Promise<{ sells?: string; market?: string; criterion?: string }>;
}) {
  const sp = await searchParams;
  const sells = (sp.sells ?? "").trim().slice(0, 200);
  const idx = await index();

  const inference = sells ? inferFromOffer(sells) : null;
  const candidates = inference ? candidatesFor(inference, idx) : [];

  // Which one to show in full. The link carries it once somebody has chosen;
  // before that, the best-supported candidate, because a sample that makes you
  // choose before showing you anything is a form again.
  const chosen =
    candidates.find(
      (c) => c.marketId === sp.market && (!sp.criterion || c.criterionId === sp.criterion),
    ) ?? candidates[0];

  const door = chosen
    ? await doorFor({ marketId: chosen.marketId, sells, show: 3 })
    : null;

  return (
    <div className="mx-auto max-w-[820px] px-6 py-12 sm:px-10">
      <h1 className="sf-h1">See three of your customers. Free.</h1>
      <p className="sf-body mt-3 max-w-[58ch] text-[var(--ink-2)]">
        Tell us what you sell. We name three small businesses that need it —
        by name, with their number and the sentence off their own website that
        says so. No account, no card.
      </p>

      <SampleForm initial={sells} />

      {/* ------------------------------------------------- nothing to go on -- */}
      {inference && inference.nothingObservable && (
        <div className="sf-card mt-8 p-6">
          <p className="sf-h3">We could not turn that into something we can see.</p>
          <p className="sf-body mt-3 max-w-[62ch] text-[var(--ink-2)]">
            This product only claims things a website actually shows — no online
            booking, no quote form, no live chat. If what you sell is worth
            buying for a reason a page cannot reveal, we would rather say so than
            hand you a list we cannot stand behind.
          </p>
          <p className="sf-small mt-3 text-[var(--muted)]">
            Try naming the gap your customer has: &ldquo;I set up online booking
            for clinics&rdquo;, &ldquo;I build quote forms for contractors&rdquo;.
          </p>
        </div>
      )}

      {/* --------------------------------------- the ones we cannot settle -- */}
      {inference && inference.refused.length > 0 && (
        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <p className="sf-small text-[var(--muted)]">
            From what you said, {inference.refused.length}{" "}
            {inference.refused.length === 1 ? "thing" : "things"} we cannot settle
            from a website today, so we are not offering{" "}
            {inference.refused.length === 1 ? "it" : "them"}:
          </p>
          <ul className="sf-small mt-2 space-y-1 text-[var(--muted)]">
            {inference.refused.map((r) => (
              <li key={r.signal.id}>
                <strong>{r.signal.label}</strong> — would take {r.wouldTake}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --------------------------------------------------- the sample -- */}
      {door && chosen && (
        <div className="mt-10">
          <p className="sf-label">Your sample</p>
          <h2 className="sf-h2 mt-2">
            {door.fit.toLocaleString()} {door.niche} in {door.metro.split(",")[0]}{" "}
            {door.criterionPredicate}.
          </h2>
          <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
            We read {door.read.toLocaleString()} of their websites, one at a
            time. Three are below, in full.
          </p>

          <ul className="mt-6 space-y-3">
            {door.shown.map((l) => (
              <li key={l.id} className="sf-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="sf-h3">{l.name}</h3>
                  {l.phone && (
                    <a
                      href={`tel:${l.phone.replace(/[^\d+]/g, "")}`}
                      className="sf-small shrink-0 text-[var(--lure-text)] underline underline-offset-2"
                    >
                      {l.phone}
                    </a>
                  )}
                </div>
                <p className="sf-small mt-1.5 max-w-[62ch] text-[var(--ink-2)]">{l.why}</p>
                {l.message && (
                  <p className="sf-small mt-3 whitespace-pre-line rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 leading-relaxed text-[var(--ink)]">
                    {l.message}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="sf-card mt-6 p-6">
            <p className="sf-h3">
              {door.hidden.toLocaleString()} more, with names and numbers.
            </p>
            <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
              The free plan covers twenty of them. You are only ever charged for
              a business that matches — the ones that do not fit, and the ones
              whose sites we could not read well enough to say either way, cost
              nothing and are still reported.
            </p>
            <Link
              href={signUpHref(door, "sample")}
              className="sf-btn sf-btn-primary mt-4 inline-block"
            >
              Sign up and take the list
            </Link>
          </div>

          {/* Other markets the same offer fits. Not a carousel — a list of the
              searches this product can answer for them today, which is also an
              honest statement of how much of the world it has read. */}
          {candidates.length > 1 && (
            <div className="mt-8 border-t border-[var(--line)] pt-5">
              <p className="sf-label">Also ready for you</p>
              <div className="mt-3 flex flex-col gap-2">
                {candidates
                  .filter((c) => c !== chosen)
                  .slice(0, 4)
                  .map((c) => (
                    <Link
                      key={`${c.marketId}:${c.criterionId}`}
                      href={`/sample?sells=${encodeURIComponent(sells)}&market=${c.marketId}&criterion=${c.criterionId}`}
                      className="sf-small flex items-baseline justify-between gap-4 rounded-md border border-[var(--line)] px-3 py-2.5 hover:border-[var(--line-strong)]"
                    >
                      <span className="text-[var(--ink)]">
                        {c.niche} in {c.metro.split(",")[0]} that {c.criterionText}
                      </span>
                      <span className="sf-data shrink-0 text-[var(--accent)]">
                        {c.matches}
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------- understood, but nowhere we have read yet -- */}
      {inference && !inference.nothingObservable && !door && (
        <div className="sf-card mt-8 p-6">
          <p className="sf-h3">We know what to look for. We have not read your market yet.</p>
          <p className="sf-body mt-3 max-w-[62ch] text-[var(--ink-2)]">
            {inference.propose.length > 0 && (
              <>
                We would look for{" "}
                <strong>{inference.propose.map((p) => p.criterionText).join(", ")}</strong>
                . Every one of those is something a website either shows or does
                not.
              </>
            )}{" "}
            The finished markets are dental practices in Phoenix, med spas in
            Dallas and HVAC companies in Tampa — tell us yours and it goes next
            in the queue.
          </p>
          <WaitlistForm source="sample" market={sells} />
          <p className="sf-small mt-4 text-[var(--muted)]">
            Already have a list of them?{" "}
            <Link href="/app/upload" className="underline underline-offset-2">
              Upload it
            </Link>{" "}
            and we read every site on it — any city, starting now.
          </p>
        </div>
      )}
    </div>
  );
}
