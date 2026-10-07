import UploadList from "@/components/UploadList";
import { CHECK_OPTIONS } from "@/lib/csvimport";

/**
 * Check a list you already have.
 *
 * The one route into the product that needs nothing from us but reading. Every
 * other path to a new market waits on candidate extraction — Overture through
 * DuckDB, which is Python and cannot run here — and this one waits on nothing,
 * because the customer brought the businesses.
 *
 * It is also the honest answer to the most common objection a bought list
 * produces: *"half of these are dead or already have it."* That is exactly what
 * this settles, one site at a time, with the sentence off their own page.
 */

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Check a list you already have | Small Fish",
  description:
    "Upload a CSV of businesses and we read each website to find the ones that " +
    "fit, with the evidence off their own page.",
};

export default function Upload() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-10 sm:px-10">
      <h1 className="sf-h1">Check a list you already have.</h1>
      <p className="sf-body mt-3 max-w-[58ch] text-[var(--ink-2)]">
        Upload a CSV and we read every website on it, one at a time, and tell you
        which ones fit, with the sentence off their own page that says so. Any
        city, any trade, whatever you brought.
      </p>
      <p className="sf-small mt-3 max-w-[58ch] text-[var(--muted)]">
        You are charged for a business that matches and nothing else. The ones
        that do not fit, and the ones whose sites we could not read well enough
        to say either way, cost nothing and are still reported.
      </p>

      <UploadList checks={CHECK_OPTIONS} />
    </div>
  );
}
