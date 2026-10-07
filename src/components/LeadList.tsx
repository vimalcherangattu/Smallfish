"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ExportButton from "@/components/ExportButton";
import PushToDestination from "@/components/PushToDestination";
import ReadTheRest from "@/components/ReadTheRest";
import ShareList from "@/components/ShareList";
import type { Lead, LeadResult } from "@/lib/leads";
import { PLANS } from "@/lib/pricing";

/** Read from the plan rather than written here. A price in two places is a price
 *  that diverges — the same rule `VERIFICATION_PLAN` states for the $1 plan. */
const FREE_CREDITS = PLANS.find((p) => p.id === "free")?.credits ?? 0;

/**
 * The list, and nothing else.
 *
 * ## What is deliberately not here
 *
 * No verdict chips, no cost-per-read, no radius buttons, no note about Overture
 * listings or the absence-proof rule. Those are how the thing works, and the
 * person reading this screen came to find businesses to call. The machinery is
 * still reachable — every row opens to the sentence off their own site — but it
 * is one click away rather than in front of the answer.
 *
 * ## One action per row
 *
 * Copy the message. That is what somebody does with a lead. The phone number is
 * a `tel:` link and the site is a link, so the other two things they might do
 * are one tap each. Everything else was an option we wanted, not one they did.
 */

function Copy({
  text,
  label = "Copy message",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          },
          () => undefined,
        );
      }}
      className={className || "sf-btn shrink-0"}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/**
 * A match whose name has not been paid for.
 *
 * It shows everything true of the business that does not identify it: the
 * criterion it met, how many pages were read, and which of a phone, an email and
 * a drafted opener unlocking would hand over. Nothing is blurred or hidden with
 * CSS — the fields are not in the page at all, because a field that reached the
 * browser has been given away whatever it looks like. See `unlock.ts`.
 */
function LockedRow({ lead }: { lead: Lead }) {
  const gets = [
    lead.has.phone ? "phone" : null,
    lead.has.email ? "email" : null,
    lead.has.message ? "a drafted opener" : null,
  ].filter(Boolean) as string[];

  return (
    <li className="sf-card border-dashed p-5 opacity-90">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            aria-hidden
            className="h-[1.1em] w-[min(14rem,60vw)] rounded bg-[var(--line)]"
          />
          <p className="sf-small mt-2 max-w-[62ch] text-[var(--ink-2)]">{lead.why}</p>
        </div>
        <p className="sf-small shrink-0 text-[var(--muted)]">
          {gets.length ? `Name, ${gets.join(", ")}` : "Name and site"}
        </p>
      </div>
    </li>
  );
}

/**
 * A row somebody works, rather than a row somebody reads.
 *
 * Five actions, and the order is the order a person does them in: read the
 * evidence, edit the opener, send it, mark it done — and, when we got it wrong,
 * hand the credit back without asking anybody.
 *
 * ## Why "not a fit" is first among equals
 *
 * This product charges per matched business and argues that every match rests
 * on a sentence off the company's own site. A customer who finds a wrong one has
 * exactly one question at that moment: *does the evidence mean anything?* A
 * product that makes them write in for two credits has answered it. `refund_match`
 * has existed since migration `0003` and nothing called it until this row did.
 *
 * ## Editing is local, and deliberately so
 *
 * The draft is derived from evidence (`composeMessage`), and a customer's edit
 * is their sentence, not a better derivation. It is not stored: storing it would
 * make the next read of this market produce a draft that silently disagrees with
 * the one they sent. Edit, copy, send.
 */
function Row({
  lead,
  market,
  criterion,
  contacted,
  signedIn,
}: {
  lead: Lead;
  market: string;
  criterion: string;
  contacted: boolean;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lead.message ?? "");
  const [done, setDone] = useState(contacted);
  const [gone, setGone] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");

  async function post(url: string, payload: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as { ok?: boolean; note?: string; reason?: string };
  }

  // Refunded rows stay on screen, greyed, saying what happened. Removing the row
  // would leave somebody staring at a list one shorter than a moment ago with no
  // way to tell whether it worked.
  if (gone) {
    return (
      <li className="sf-card p-5 opacity-60">
        <h3 className="sf-h3 line-through">{lead.name}</h3>
        <p className="sf-small mt-1.5 text-[var(--muted)]">{note}</p>
        {!asking && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="sf-small mt-2 underline underline-offset-2 text-[var(--muted)]"
          >
            Tell us what we got wrong
          </button>
        )}
        {asking && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="They do have booking, it's under Patients"
              className="sf-input min-w-0 flex-1"
            />
            <button
              type="button"
              className="sf-btn shrink-0"
              onClick={async () => {
                await post("/api/refund", {
                  business: lead.id,
                  market,
                  criterion,
                  reason: why,
                }).catch(() => undefined);
                setAsking(false);
                setNote(`${note} Thank you, that goes straight into how we measure ourselves.`);
              }}
            >
              Send
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className={`sf-card p-5 ${done ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="sf-h3">{lead.name}</h3>
          <p className="sf-small mt-1.5 max-w-[62ch] text-[var(--ink-2)]">{lead.why}</p>
        </div>

        {/* `shrink-0` was on this block, and at 390px a long domain —
            `83rdmarketplacedentalcare.com` is 206px of it — pushed the whole
            page 10px wider than the phone. The contact block may shrink; the
            domain wraps rather than reserving a width nobody has. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="sf-btn shrink-0">
              {lead.phone}
            </a>
          )}
          {lead.site && (
            <a
              href={lead.site}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="sf-small max-w-full break-all text-[var(--muted)] underline underline-offset-2"
            >
              {lead.domain}
            </a>
          )}
        </div>
      </div>

      {lead.email && (
        <p className="sf-small mt-3">
          <a href={`mailto:${lead.email}`} className="text-[var(--lure-text)] underline underline-offset-2">
            {lead.email}
          </a>
        </p>
      )}

      {lead.message ? (
        <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(5, draft.split("\n").length + 1)}
              className="sf-input w-full resize-y leading-relaxed"
              autoFocus
            />
          ) : (
            <p className="sf-body whitespace-pre-line leading-relaxed text-[var(--ink)]">
              {draft}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Copy text={draft} />
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="sf-small text-[var(--muted)] underline underline-offset-2"
            >
              {editing ? "Done editing" : "Edit"}
            </button>
            {/* The hedge used to be the last sentence of the draft itself —
                "Happy to be wrong, if there is online booking I missed…". It is
                our uncertainty, so it sits here, where the person deciding
                whether to send it reads it, rather than travelling into a
                stranger's inbox as an apology from them. */}
            {lead.proof && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="sf-small text-[var(--muted)] underline underline-offset-2"
              >
                {open ? "Hide" : "How we know"}
              </button>
            )}
          </div>
          {open && lead.proof && (
            <p className="sf-small mt-3 border-t border-[var(--line)] pt-3 text-[var(--muted)]">
              {lead.proof}
              {lead.pagesRead > 0 && ` · read ${lead.pagesRead} pages of their site`}
            </p>
          )}
        </div>
      ) : (
        <p className="sf-small mt-4 text-[var(--muted)]">
          Not enough on their site to write an opener worth sending, so there
          isn&rsquo;t one. The number above is good.
        </p>
      )}

      {/* What you do after you have sent it. Only for somebody with an account:
          a signed-out visitor is looking at the free preview and has nothing to
          mark or refund. */}
      {signedIn && (
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--line)] pt-3">
          <label className="sf-small flex cursor-pointer items-center gap-2 text-[var(--muted)]">
            <input
              type="checkbox"
              checked={done}
              onChange={async (e) => {
                const next = e.target.checked;
                setDone(next);
                const r = await post("/api/contacted", {
                  business: lead.id,
                  contacted: next,
                  // So the Contacted screen can name it. An uploaded business
                  // exists nowhere else to look it up from.
                  name: lead.name,
                  site: lead.site,
                }).catch(() => ({ ok: false }));
                // Put it back rather than showing a state the server does not
                // hold — a tick that lies is worse than one that refuses.
                if (!r.ok) setDone(!next);
              }}
            />
            {done ? "Contacted" : "Mark as contacted"}
          </label>

          <button
            type="button"
            onClick={async () => {
              const r = await post("/api/refund", {
                business: lead.id,
                market,
                criterion,
              }).catch(() => ({
                ok: false,
                note: undefined,
                reason: "Could not reach the server. Nothing changed.",
              }));
              if (r.ok) {
                setNote(r.note ?? "Refunded.");
                setGone(true);
              } else setNote(r.reason ?? "That did not go through.");
            }}
            className="sf-small text-[var(--muted)] underline underline-offset-2"
          >
            Not a fit, refund it
          </button>

          {note && !gone && <span className="sf-small text-[var(--ink-2)]">{note}</span>}
        </div>
      )}
    </li>
  );
}

export interface Wallet {
  signedIn: boolean;
  /** Milli-credits. 1,000 is one credit — see `ledger.ts`. */
  balance: number;
  comped: boolean;
}

/**
 * The one button that turns a locked list into a worked one.
 *
 * It says the number and the price **before** it is pressed, and it is the only
 * thing in the product that spends a credit on a name. The alternative — rows
 * revealing themselves as you scroll — spends money by browsing, which is the
 * version of metered pricing nobody can predict and everybody resents.
 *
 * A signed-out visitor gets the sign-up door instead, carrying their search, so
 * the list they were looking at is the list they land on.
 */
function Unlock({ result, wallet }: { result: LeadResult; wallet: Wallet }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  const cost = result.locked * result.creditsEach;
  const afford = wallet.comped
    ? result.locked
    : Math.floor(wallet.balance / 1000 / result.creditsEach);

  if (!wallet.signedIn) {
    const q = new URLSearchParams({
      q: `${result.what} in ${result.metro.split(",")[0]} that ${result.criterionText}`,
      market: result.marketId,
      criterion: result.criterionId,
      source: "app/locked",
    });
    return (
      <div className="sf-card mt-6 p-5">
        <p className="sf-h3">{result.locked} more, with names and numbers.</p>
        <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
          The count, the evidence and the first {result.preview} are free and need
          no account. Sign up and this exact list is waiting, the free plan
          covers {Math.min(Math.floor(FREE_CREDITS / result.creditsEach), result.locked)} of
          them.
        </p>
        <Link href={`/sign-up?${q}`} className="sf-btn sf-btn-primary mt-4 inline-block">
          Sign up and take the list
        </Link>
      </div>
    );
  }

  return (
    <div className="sf-card mt-6 p-5">
      <p className="sf-h3">{result.locked} more, with names and numbers.</p>
      <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
        {wallet.comped
          ? "This workspace is comped, so they cost nothing."
          : `${result.creditsEach} credit${result.creditsEach === 1 ? "" : "s"} each, ` +
            `${cost} for all ${result.locked}. You have ${(wallet.balance / 1000).toFixed(0)}, ` +
            `which covers ${Math.min(afford, result.locked)}.`}{" "}
        Yours for twelve months once unlocked, and never charged twice.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setNote(null);
            try {
              const res = await fetch("/api/unlock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  market: result.marketId,
                  criterion: result.criterionId,
                }),
              });
              const body = (await res.json()) as {
                ok?: boolean;
                note?: string;
                reason?: string;
              };
              setNote(body.note ?? body.reason ?? "That didn't go through.");
              // The rows are drawn on the server, so the list only changes when
              // the server draws it again.
              if (body.ok) router.refresh();
            } catch {
              setNote("That didn't go through. Nothing was charged.");
            } finally {
              setBusy(false);
            }
          }}
          className="sf-btn sf-btn-primary"
        >
          {busy
            ? "Unlocking…"
            : afford >= result.locked
              ? `Unlock all ${result.locked}`
              : `Unlock ${Math.max(afford, 0)}`}
        </button>
        {afford < result.locked && !wallet.comped && (
          <Link href="/account" className="sf-small underline underline-offset-2">
            Add credits
          </Link>
        )}
      </div>
      {note && <p className="sf-small mt-3 text-[var(--ink-2)]">{note}</p>}
    </div>
  );
}

export default function LeadList({
  result,
  wallet = { signedIn: false, balance: 0, comped: false },
  contactedIds = [],
}: {
  result: LeadResult;
  wallet?: Wallet;
  /** Businesses this workspace has already reached out to. */
  contactedIds?: string[];
}) {
  const contacted = new Set(contactedIds);
  const n = result.leads.length;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="sf-h1">
            {n} {result.what || "businesses"} in {result.metro} to call.
          </h2>
          <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
            Each one has a number and a line you can open with. We read{" "}
            {result.read.toLocaleString()} {result.what || "businesses"} in{" "}
            {result.metro} to find them.
          </p>
        </div>

        {/* The same route the old screen used, kept deliberately. It is the one
            path that charges, and a download button that quietly skipped the
            ledger would be the tidy-looking version of not having a business. */}
        {/* Download, and send. The push path — destinations, signed webhooks,
            Instantly and Smartlead — has been complete since S2-02 and was
            mounted only on /app/explore, the map page the search-first rebuild
            demoted. It was unreachable from the screen where people actually
            work, which is the same as not existing. `PushToDestination` renders
            nothing when no destination is connected, so this adds no empty
            control for anyone who has not set one up. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <PushToDestination
            market={result.marketId}
            criterion={result.criterionId}
            cost={wallet.comped ? 0 : result.locked * result.creditsEach}
          />
          {/* The download unlocks what it writes, so it promises all of them and
              prices them on the button. A charge that is only explained
              afterwards is a charge somebody finds on their statement. */}
          <ExportButton
            market={result.marketId}
            criterion={result.criterionId}
            rows={n}
            withheld={result.locked}
            // No price for somebody with no balance to spend it from. A
            // signed-out visitor pressing this gets the sign-up door with the
            // free-plan number in it, which is a better sentence than a credit
            // count they cannot act on.
            cost={wallet.comped || !wallet.signedIn ? 0 : result.locked * result.creditsEach}
            variant="primary"
          />
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {result.leads.map((l) =>
          l.locked ? (
            <LockedRow key={l.id} lead={l} />
          ) : (
            <Row
              key={l.id}
              lead={l}
              market={result.marketId}
              criterion={result.criterionId}
              contacted={contacted.has(l.id)}
              signedIn={wallet.signedIn}
            />
          ),
        )}
      </ul>

      {result.locked > 0 && <Unlock result={result} wallet={wallet} />}

      {/* The coverage number, said out loud, with the offer attached. See
          `ReadTheRest` — "42 out of 200 read" and "42 out of 2,778 that have a
          website" are different claims, and only the second one describes the
          market this list is supposed to be about. */}
      <ReadTheRest
        query={`${result.what} in ${result.metro.split(",")[0]} that ${result.criterionText}`}
        unread={result.unread}
        read={result.read}
      />

      {/* Only for somebody with a workspace: a link is minted against an
          account, and a signed-out visitor is already looking at what a share
          link shows. */}
      {wallet.signedIn && (
        <ShareList
          market={result.marketId}
          criterion={result.criterionId}
          label={`${result.what} in ${result.metro.split(",")[0]}`}
        />
      )}

      {/* The honesty, kept — but as one line under the list rather than a panel
          of filters in front of it. Somebody who wants it will read it; nobody
          has to get past it to reach the thing they came for. */}
      {(result.unclear > 0 || result.didNotFit > 0) && (
        <p className="sf-small mt-6 text-[var(--muted)]">
          {result.didNotFit > 0 && (
            <>{result.didNotFit.toLocaleString()} were checked and didn&rsquo;t fit. </>
          )}
          {result.unclear > 0 && (
            <>
              {result.unclear.toLocaleString()} we couldn&rsquo;t read well enough to say
              either way, so they are left off rather than guessed at. You are
              never charged for those.
            </>
          )}
        </p>
      )}
    </div>
  );
}
