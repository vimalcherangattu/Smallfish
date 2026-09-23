import Link from "next/link";
import { REMOVAL_DAYS } from "@/lib/suppression";

/** The public opt-out page (S1-09).
 *
 *  Written for a business owner who has just found their practice in someone
 *  else's spreadsheet and is annoyed. So it answers the three things they
 *  actually want to know — what we hold, how to get out, and what we cannot
 *  undo — before asking them for anything.
 *
 *  The awkward answer is the one that has to be here in plain words: rows
 *  already exported are in a customer's files and cannot be recalled. Saying
 *  "you have been removed" when we mean "you will not appear in future" would
 *  be the same overclaim this product refuses everywhere else. */
export const metadata = {
  title: "Small Fish — remove my business",
  description: "How to have your business removed from Small Fish.",
};

export default function OptOut() {
  return (
    <main className="home">
      <div className="mx-auto max-w-[760px] px-6 py-16">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>

        <h1 className="dsp mt-10 text-[clamp(34px,5.5vw,60px)]">
          Remove my business.
        </h1>

        <section className="mt-12">
          <h2 className="text-[15px] font-semibold">What we hold about you</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
            Your name, address, phone and website as they appear in Overture
            Maps, an open dataset. Plus facts we extracted from your own public
            website — whether it offers online booking, for instance — and the
            page each fact came from. We do not keep copies of your pages, and
            nothing here came from anywhere but your public site and open data.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-[15px] font-semibold">How to be removed</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
            Email <span className="mono">opt-out@smallfish.example</span> from an
            address at your own domain, or from the phone number on your
            listing, with the name of your business. We verify it that way
            because an opt-out anyone could file for anyone else would be a tool
            for erasing a competitor.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
            You will be gone from every future search and export within{" "}
            <strong>{REMOVAL_DAYS} days</strong>.
          </p>
        </section>

        <section className="mt-10 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-6">
          <h2 className="text-[15px] font-semibold">
            What we cannot undo, and will not pretend otherwise
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
            If a customer has already exported a row about your business, it is
            in their spreadsheet or their CRM and we cannot reach it. Removing
            you stops any future export; it cannot recall one that has happened.
            We can tell you the date each export occurred if that helps you
            follow it up, and we will.
          </p>
        </section>

        <p className="mono mt-12 text-[12px] leading-relaxed text-[var(--ink-3)]">
          We crawl politely: robots.txt is honoured, one request at a time per
          domain, and our user agent identifies us rather than pretending to be
          a browser.
        </p>
      </div>
    </main>
  );
}
