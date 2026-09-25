import Link from "next/link";
import { PLANS } from "@/lib/pricing";
import { UNLOCK_MONTHS, ROLLOVER_MONTHS } from "@/lib/ledger";

/** The terms (S1-08, and required to publish the Google OAuth consent screen).
 *
 *  Short on purpose. Every clause here corresponds to something the code
 *  actually enforces, and nothing is included because a template had it —
 *  a term nobody will honour is worse than no term, because it teaches a
 *  customer that the rest of the page is decoration too.
 *
 *  The numbers are read from `pricing.ts` and `ledger.ts` rather than typed,
 *  so a pricing change cannot leave the terms describing the old deal. */

export const metadata = {
  title: "Terms — Small Fish",
  description:
    "What Small Fish promises, what it charges for, what it refuses, and how to stop.",
};

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
        {children}
      </div>
    </section>
  );
}

export default function Terms() {
  const paid = PLANS.filter((p) => p.priceUsd > 0);

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[720px] px-6 py-16">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>

        <h1 className="dsp mt-10 text-[clamp(32px,5vw,54px)]">Terms.</h1>
        <p className="mono mt-6 text-[12px] text-[var(--ink-3)]">
          last updated 2026-09-25
        </p>

        <p className="mt-8 text-[16px] leading-relaxed text-[var(--ink-2)]">
          Short, because every clause here is something the software actually
          does. A term nobody enforces is worse than no term — it teaches you
          that the rest of the page is decoration.
        </p>

        <S title="What the service is">
          <p>
            Small Fish finds local businesses whose own public websites show
            what you asked for, and shows you the page and the sentence that
            prove it. It is a research tool. It does not send email, does not
            contact businesses on your behalf, and does not tell you what to do
            with what it finds.
          </p>
        </S>

        <S title="What you pay for, and what is free">
          <p>
            <strong className="text-[var(--ink)]">
              Only a proven match costs a credit.
            </strong>{" "}
            A business that did not match, a site we could not read, and a site
            that blocks automated reading are all free and always will be — they
            are the cases where we have not delivered anything, and charging for
            them would make &ldquo;couldn&rsquo;t tell&rdquo; profitable, which
            is exactly the incentive this product exists to avoid.
          </p>
          <p>
            A business you have already unlocked stays free to your workspace for{" "}
            <strong>{UNLOCK_MONTHS} months</strong>. Unused credits carry for{" "}
            <strong>
              {ROLLOVER_MONTHS} month{ROLLOVER_MONTHS === 1 ? "" : "s"}
            </strong>{" "}
            and are capped at one period&rsquo;s allowance.
          </p>
          <p>
            Paid plans are {paid.map((p) => `${p.name} at $${p.priceUsd}`).join(", ")}{" "}
            a month, billed by Stripe, cancellable at any time and effective at
            the end of the period you have paid for. Prices can change; we will
            tell you before they do and you can cancel.
          </p>
        </S>

        <S title="If a match is wrong, it costs nothing">
          <p>
            Tell us and it is refunded at exactly what it cost, read back from
            the line that charged it rather than recalculated. That is a promise
            about the software, not a goodwill gesture — the refund path is in
            the database and is the same one every time.
          </p>
        </S>

        <S title="What we do not promise">
          <p>
            We do not promise to have read every business in an area, or that
            every match is right. We measure both and publish the numbers on{" "}
            <Link href="/benchmark" className="underline underline-offset-4">
              the benchmark page
            </Link>
            , including the ones that undercut us. Read it before deciding what
            this is worth to you — that is what it is for.
          </p>
          <p>
            We also do not promise the data is current. A website can change the
            day after we read it. Every count in the product carries the date it
            was measured for that reason.
          </p>
        </S>

        <S title="What you agree not to do">
          <p>
            Do not use Small Fish to contact anybody unlawfully — where you are,
            that probably includes rules about unsolicited email and calls, and
            they are your responsibility, not ours. Do not resell the raw
            exports as a list. Do not try to get at another workspace&rsquo;s
            data. Do not use the service to build a competing database of the
            same businesses.
          </p>
          <p>
            If a business asks us to remove it, it is removed from your future
            searches and exports too. Rows you already exported are in your
            files; we ask that you honour a removal you are told about.
          </p>
        </S>

        <S title="Stopping">
          <p>
            Cancel whenever you like. You keep what you have exported. We keep
            your billing ledger, because it cannot be deleted by anybody —
            including us — and because it is the record of what you were
            charged.
          </p>
        </S>

        <S title="The boring part">
          <p>
            The service is provided as it is, without warranties beyond those
            the law does not let us exclude. We are not liable for indirect or
            consequential losses, and our total liability is limited to what you
            paid us in the twelve months before the claim. Nothing here limits
            liability for fraud, or for anything else the law says cannot be
            limited.
          </p>
          <p>
            If a part of these terms turns out to be unenforceable, the rest
            still stands. We may update these terms; material changes are told
            to customers by email and the date at the top changes.
          </p>
        </S>

        <p className="mono mt-16 border-t border-[var(--line)] pt-8 text-[12px] leading-relaxed text-[var(--ink-3)]">
          Small Fish · getsmallfish@gmail.com · Every clause above describes
          something the software does. It has not been reviewed by a lawyer, and
          it is not legal advice — have one read it before you take money from
          anybody outside a hand-picked group.
        </p>
      </div>
    </main>
  );
}
