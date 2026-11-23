import "server-only";

import { randomUUID } from "node:crypto";

import { Anthropic } from "@posthog/ai/anthropic";
import { PostHog } from "posthog-node";

const processSessionId = `smallfish-${randomUUID()}`;
let warnedAboutConfiguration = false;

export interface AnthropicObserver {
  client: Anthropic;
  callProperties: {
    posthogTraceId: string;
    posthogProperties: { $ai_session_id: string };
  };
  flush: () => Promise<void>;
}

/**
 * Builds an AI-observability wrapper for one server-side Anthropic call.
 *
 * Route handlers are short-lived, so each observer uses immediate delivery and
 * exposes bounded, failure-safe cleanup for the caller to await after its own
 * model request completes. Missing PostHog configuration leaves Anthropic's
 * existing request path untouched.
 */
export function observeAnthropic(
  apiKey: string | undefined,
  sessionId = processSessionId,
): AnthropicObserver | null {
  if (!apiKey) return null;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token || !host) {
    if (process.env.NODE_ENV !== "production" && !warnedAboutConfiguration) {
      const missing = !token ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN" : "NEXT_PUBLIC_POSTHOG_HOST";
      console.warn(
        `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
      );
      warnedAboutConfiguration = true;
    }
    return null;
  }

  const posthog = new PostHog(token, {
    host,
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 2000,
    fetchRetryCount: 0,
    privacyMode: false,
  });

  return {
    client: new Anthropic({ apiKey, posthog }),
    callProperties: {
      posthogTraceId: randomUUID(),
      posthogProperties: { $ai_session_id: sessionId },
    },
    flush: async () => {
      await posthog.shutdown(2000).catch(() => {});
    },
  };
}
