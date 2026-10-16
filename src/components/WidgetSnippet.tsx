"use client";

import { useState } from "react";

/** Builds the iframe snippet for an agency's domain. */
export default function WidgetSnippet({ initial = "" }: { initial?: string }) {
  const [domain, setDomain] = useState(initial);
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const ok = /^[a-z0-9.-]{3,80}\.[a-z]{2,}$/.test(clean);
  const code = `<iframe src="https://www.getsmallfish.com/embed/check${ok ? `?agency=${clean}` : ""}" width="100%" height="380" style="border:0;max-width:640px" title="Free website check" loading="lazy"></iframe>`;
  return (
    <div className="mt-8">
      <label className="text-[14px] text-[var(--ink-2)]" htmlFor="agency-domain">Your website</label>
      <input
        id="agency-domain"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="youragency.com"
        className="mt-2 w-full rounded-full border border-[var(--line-strong)] bg-[var(--paper)] px-5 py-3.5 text-[16px]"
      />
      <pre className="mono mt-5 overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] p-5 text-[12px] leading-relaxed">{code}</pre>
      <button
        onClick={() => navigator.clipboard?.writeText(code)}
        className="mt-4 rounded-full bg-[var(--ink)] px-6 py-3 text-[14px] font-semibold text-[var(--paper)]"
      >
        Copy the code
      </button>
    </div>
  );
}
