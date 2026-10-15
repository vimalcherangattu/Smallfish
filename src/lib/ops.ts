import { CLERK_ENABLED } from "@/lib/clerk";

/**
 * Who may open `/ops` (GTM). The owner and anyone they list in `OPS_EMAILS`,
 * comma-separated, checked against the signed-in Clerk user's verified
 * addresses. Unset means nobody, not everybody.
 */
export async function opsViewer(): Promise<{ ok: boolean; why?: string; email?: string }> {
  const allow = (process.env.OPS_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allow.length) return { ok: false, why: "OPS_EMAILS is not set on this deployment." };
  if (!CLERK_ENABLED) return { ok: false, why: "Sign-in is not configured." };
  const { currentUser } = await import("@clerk/nextjs/server");
  const u = await currentUser().catch(() => null);
  if (!u) return { ok: false, why: "signed out" };
  const mine = u.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
  const hit = mine.find((e) => allow.includes(e));
  return hit ? { ok: true, email: hit } : { ok: false, why: "not on the list" };
}
