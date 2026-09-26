"use client";

import { useEffect, useRef } from "react";

/**
 * Tell the server a market was opened (S2-12).
 *
 * Renders nothing. It exists because the explore screen is a client component
 * driven by state — the market can change half a dozen times without a
 * navigation — and history should follow what the person actually looked at,
 * not which URL they first landed on.
 *
 * Fire-and-forget on purpose. Recording a run is bookkeeping; the results are
 * already on screen and must not be affected by whether the write landed. A
 * failure here is silent by design, which is the right trade for a history row
 * and would be the wrong one for anything the customer is charged for.
 *
 * The ref guards against React's development double-invoke and against a
 * re-render with the same market bumping `times` twice for one visit. The
 * server upserts, so a duplicate would not create a second row — it would
 * inflate a count the user can see, which is worse than a missing row because
 * it is wrong rather than absent.
 */

export default function RecordRun({
  market,
  criterion,
  query,
  scope,
  regionLabel,
}: {
  market: string;
  criterion: string;
  query?: string | null;
  scope?: string | null;
  regionLabel?: string | null;
}) {
  const sent = useRef<string>("");

  useEffect(() => {
    if (!market || !criterion) return;
    const key = `${market}:${criterion}`;
    if (sent.current === key) return;
    sent.current = key;

    // `keepalive` so the write survives the user navigating away in the same
    // tick — which is exactly what happens when somebody clicks straight
    // through to the export.
    fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ market, criterion, query, scope, regionLabel }),
      keepalive: true,
    }).catch(() => undefined);
  }, [market, criterion, query, scope, regionLabel]);

  return null;
}
