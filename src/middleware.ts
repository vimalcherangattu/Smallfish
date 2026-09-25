import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { CLERK_ENABLED, PROTECTED } from "@/lib/clerk";

/** Route protection (S1-08).
 *
 *  Two shapes, chosen at build time. With no Clerk key the middleware is a
 *  passthrough, so the site — which is live and mostly public — keeps serving
 *  rather than 500ing on a missing credential. With a key it is Clerk's own
 *  middleware, protecting the short list in `lib/clerk.ts`.
 *
 *  `/app` is not protected. The free match count is anonymous on purpose. */

const needsAccount = createRouteMatcher(PROTECTED.map((p) => [`${p}`, `${p}/(.*)`]).flat());

const withClerk = clerkMiddleware(async (auth, request) => {
  if (needsAccount(request)) await auth.protect();
});

export default function middleware(request: NextRequest, event: never) {
  if (!CLERK_ENABLED) return NextResponse.next();
  return (withClerk as unknown as (r: NextRequest, e: never) => Response)(request, event);
}

export const config = {
  matcher: [
    // Everything except Next's internals and static files, plus API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
