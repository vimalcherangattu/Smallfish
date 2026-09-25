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
 * So: a sentence. `query.ts` splits it, the next screen shows the split back in
 * editable fields, and nothing is refused for being an unfamiliar trade — the
 * engine reads a criterion off the page, so a vertical nobody anticipated is
 * not a special case.
 */

const EXAMPLES = [
  "med spas in Dallas that have no online booking",
  "carpenters in Austin that don't show pricing",
  "HVAC companies in Tampa with no quote form",
  "dental practices in Phoenix that don't take bookings online",
];

export default function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    router.push(`/app/search?q=${encodeURIComponent(text)}`);
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
          See how many
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
              router.push(`/app/search?q=${encodeURIComponent(e)}`);
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
