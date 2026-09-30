"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { NAMED_OFFERS } from "@/lib/icp";

/**
 * One question: what do you sell?
 *
 * ## Why not "what do you sell, which city, your email"
 *
 * The GTM plan describes the sample as a three-field form. Two of those fields
 * are asking a stranger to do work before we have shown them anything, and the
 * third is asking for their address before we have earned it. The city we can
 * choose for them — we have read three markets, and the sample's job is to prove
 * the product works, not to prove it works *in Toledo*. The email we ask for
 * only where we genuinely cannot answer, which is a queue entry and is labelled
 * as one.
 *
 * ## The chips are the real answer to the blank box
 *
 * `icp.ts` matches what somebody sells against the signal catalogue by regular
 * expression, so a description using words it does not know produces nothing —
 * and a blank box gives no hint which words those are. The named offers are the
 * ones the catalogue definitely recognises, so pressing one is guaranteed to
 * produce a sample. Typing still works and is still the point; the chips are
 * there so that the first thing a stranger does cannot be a dead end.
 */
export default function SampleForm({ initial = "" }: { initial?: string }) {
  const [sells, setSells] = useState(initial);
  const router = useRouter();

  const go = (value: string) => {
    const v = value.trim();
    if (v) router.push(`/sample?sells=${encodeURIComponent(v)}`);
  };

  return (
    <div className="mt-7">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(sells);
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          value={sells}
          onChange={(e) => setSells(e.target.value)}
          placeholder="I set up online booking for dental practices"
          aria-label="What do you sell?"
          className="sf-input min-w-0 flex-1"
        />
        <button type="submit" className="sf-btn-lure shrink-0" disabled={!sells.trim()}>
          Show me three
        </button>
      </form>

      <p className="sf-label mt-5">Or start from one of these</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {NAMED_OFFERS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              setSells(o.describes);
              go(o.describes);
            }}
            className="sf-small rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[var(--ink-2)] hover:border-[var(--line-strong)]"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
