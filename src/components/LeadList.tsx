"use client";

import { useState } from "react";
import ExportButton from "@/components/ExportButton";
import PushToDestination from "@/components/PushToDestination";
import type { Lead, LeadResult } from "@/lib/leads";

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

function Row({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="sf-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="sf-h3">{lead.name}</h3>
          <p className="sf-small mt-1.5 max-w-[62ch] text-[var(--ink-2)]">{lead.why}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="sf-btn">
              {lead.phone}
            </a>
          )}
          {lead.site && (
            <a
              href={lead.site}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="sf-small text-[var(--muted)] underline underline-offset-2"
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
          <p className="sf-body leading-relaxed text-[var(--ink)]">{lead.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Copy text={lead.message} />
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
    </li>
  );
}

export default function LeadList({ result }: { result: LeadResult }) {
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
          <PushToDestination market={result.marketId} criterion={result.criterionId} />
          <ExportButton
            market={result.marketId}
            criterion={result.criterionId}
            rows={n}
            withheld={0}
            variant="primary"
          />
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {result.leads.map((l) => (
          <Row key={l.id} lead={l} />
        ))}
      </ul>

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
