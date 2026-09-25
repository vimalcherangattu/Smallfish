import { readSeller, profileToDescription } from "@/lib/seller";

/** Read a seller's own site (S1-22).
 *
 *  Rate-limited by being expensive and by the fact that it only reads a URL
 *  somebody typed. It is still a route that makes an outbound fetch on demand,
 *  so `safeUrl` refuses anything that is not a public http(s) host — a URL box
 *  that will fetch `http://169.254.169.254` is a server-side request forgery
 *  hole with a text input in front of it.
 *
 *  Refusals come back as 200 with `ok: false`. The caller is a form that has to
 *  render the reason either way, and a 4xx would make it guess at a message
 *  when the server already wrote a better one. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let url = "";
  try {
    url = String(((await request.json()) as { url?: unknown }).url ?? "");
  } catch {
    return Response.json({ ok: false, reason: "Send JSON with a `url`." }, { status: 400 });
  }

  const result = await readSeller(url);
  if (!result.ok) return Response.json(result);

  return Response.json({
    ok: true,
    profile: result.profile,
    description: profileToDescription(result.profile),
  });
}
