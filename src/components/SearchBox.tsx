"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One box, and it accepts anything.
 *
 * The product used to open on a map with a region to draw and a market to pick
 * from a list of four. That is our data model shown to a stranger as a user
 * interface: they came to find carpenters in Austin, and the first thing the
 * screen asked them for was a bounding box.
 *
 * So: a sentence. `query.ts` splits it and `/app` answers it on the same
 * screen — there is no confirm step in between, because a page that quotes a
 * cost per website read before showing a single business is the measurement
 * engine asking permission to be a product.
 *
 * Nothing is refused for being an unfamiliar trade: the engine reads what you
 * asked for off the page, so a vertical nobody anticipated is not a special
 * case.
 */

/**
 * Three searches that return a list today.
 *
 * They used to include "carpenters in Austin that don't show pricing", which is
 * a perfectly good search and a terrible suggestion: offering somebody a button
 * whose only possible outcome is "we haven't read that yet" is a demo of the
 * thing the product cannot do. The examples are the front door; the honest
 * not-read-yet state belongs where somebody arrives at it themselves.
 */
const EXAMPLES = [
  "dental practices in Phoenix that have no online booking",
  "HVAC companies in Tampa that have no quote form",
  "med spas in Dallas that have no online booking",
];

export default function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    router.push(`/app?q=${encodeURIComponent(text)}`);
  }

  return (
    <div>
      <form onSubmit={go} className="flex flex-col gap-3 sm:flex-row">
        <input
          className="sf-input sm:h-[52px] sm:text-[17px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="med spas in Dallas that have no online booking"
          aria-label="What you are looking for"
          autoComplete="off"
        />
        <button type="submit" className="sf-btn-lure shrink-0 sm:h-[52px] sm:px-7">
          Find them
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="sf-label">Try</span>
        {EXAMPLES.slice(0, 3).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setQ(e);
              router.push(`/app?q=${encodeURIComponent(e)}`);
            }}
            className="sf-small rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[var(--ink-2)] hover:border-[var(--line-strong)]"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
