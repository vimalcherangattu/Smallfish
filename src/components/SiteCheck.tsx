"use client";

import Link from "next/link";
import { useState } from "react";

type Result = { ok: boolean; answer?: "yes" | "no" | "unknown"; proof?: string; reason?: string; label?: string; pages?: number };

const SIGNALS = [
  { id: "booking", label: "online booking" },
  { id: "quote_form", label: "a quote form" },
  { id: "chat", label: "live chat" },
] as const;

/** The free checker's form. `agency` names the agency when it is embedded. */
export default function SiteCheck({ agency: refName = null }: { agency?: string | null }) {
  const [url, setUrl] = useState("");
  const [signal, setSignal] = useState<string>("booking");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setR(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, signal, ref: refName }),
      });
      setR((await res.json()) as Result);
    } catch {
      setR({ ok: false, reason: "Something went wrong on our side." });
    } finally {
      setBusy(false);
    }
  }

  const picked = SIGNALS.find((s) => s.id === signal)!;
  return (
    <div className="mt-10">
      <form onSubmit={go} className="flex flex-col gap-3 md:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="theirwebsite.com"
          required
          className="min-w-0 flex-1 rounded-full border border-[var(--line-strong)] bg-[var(--paper)] px-5 py-3.5 text-[16px]"
        />
        <select
          value={signal}
          onChange={(e) => setSignal(e.target.value)}
          className="rounded-full border border-[var(--line-strong)] bg-[var(--paper)] px-4 py-3.5 text-[15px]"
          aria-label="What to look for"
        >
          {SIGNALS.map((s) => (
            <option key={s.id} value={s.id}>Has {s.label}?</option>
          ))}
        </select>
        <button
          disabled={busy}
          className="rounded-full bg-[var(--ink)] px-6 py-3.5 text-[15px] font-semibold text-[var(--paper)] disabled:opacity-60"
        >
          {busy ? "Reading their site…" : "Check"}
        </button>
      </form>

      {busy && <p className="mt-4 text-[14px] text-[var(--ink-3)]">We read the pages a customer would click. About twenty seconds.</p>}

      {r && !r.ok && <p className="mt-6 text-[15px] text-[var(--ink-2)]">{r.reason}</p>}

      {r?.ok && (
        <div className="mt-8 rounded-xl border border-[var(--line)] p-7">
          <div className="text-[22px] font-semibold">
            {r.answer === "yes" && `Yes, they have ${picked.label}.`}
            {r.answer === "no" && `No ${picked.label.replace(/^a /, "")} on their site.`}
            {r.answer === "unknown" && "We couldn't tell from their site."}
          </div>
          {r.proof && <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">{r.proof}</p>}
          {r.answer === "unknown" && r.reason && <p className="mt-3 text-[14px] text-[var(--ink-3)]">{r.reason}</p>}
          <div className="mt-6 border-t border-[var(--line)] pt-5 text-[15px]">
            Want every business in a city that {r.answer === "no" ? "is missing it" : "fits"}?{" "}
            <Link href={`/sign-up?source=check${refName ? `/${refName}` : ""}`} className="font-semibold underline">
              Find them free
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
