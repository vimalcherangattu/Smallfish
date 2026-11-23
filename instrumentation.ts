import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function logsEndpoint(): string | null {
  if (!host) return null;
  try {
    return new URL("/i/v1/logs", host).toString();
  } catch {
    return null;
  }
}

const endpoint = logsEndpoint();
const missingConfiguration = !token
  ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
  : !endpoint
    ? "NEXT_PUBLIC_POSTHOG_HOST"
    : null;

if (missingConfiguration && process.env.NODE_ENV !== "production") {
  console.warn(
    `${missingConfiguration} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingConfiguration} is configured`,
  );
}

/**
 * This provider intentionally stays separate from the global OTel provider so
 * only purpose-built PostHog logs from this integration are exported.
 */
export const loggerProvider =
  token && endpoint
    ? new LoggerProvider({
        resource: resourceFromAttributes({
          "service.name": "smallfish-nextjs",
          "deployment.environment": process.env.NODE_ENV ?? "development",
        }),
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: endpoint,
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }),
          }),
        ],
      })
    : null;

export function register() {
  // Direct logger access from loggerProvider works without replacing any
  // application-wide OTel configuration.
}
