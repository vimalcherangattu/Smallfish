import { SeverityNumber } from "@opentelemetry/api-logs";

import { loggerProvider } from "../../instrumentation";

const logger = loggerProvider?.getLogger("smallfish.posthog.logs");

type SellerReadLog =
  | { ok: true; durationMs: number; pagesRead: number; droppedFields: number; costUsd: number }
  | { ok: false; durationMs: number; stage: string };

/** Emits only this integration's structured, non-user-data log records. */
export function logSellerRead(result: SellerReadLog) {
  logger?.emit({
    body: "seller_read_completed",
    severityNumber: result.ok ? SeverityNumber.INFO : SeverityNumber.WARN,
    attributes: result.ok
      ? {
          event: "seller_read_completed",
          outcome: "success",
          duration_ms: result.durationMs,
          pages_read: result.pagesRead,
          dropped_fields: result.droppedFields,
          cost_usd: result.costUsd,
        }
      : {
          event: "seller_read_completed",
          outcome: "refused_or_failed",
          stage: result.stage,
          duration_ms: result.durationMs,
        },
  });
}
