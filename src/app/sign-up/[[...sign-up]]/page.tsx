import { SignUp } from "@clerk/nextjs";
import { CLERK_ENABLED, AFTER_AUTH_PATH } from "@/lib/clerk";
import NoAuth from "@/components/NoAuth";

export const metadata = { title: "Create an account — Small Fish" };

export default function Page() {
  if (!CLERK_ENABLED) return <NoAuth />;
  return (
    <main className="mkt flex min-h-screen items-center justify-center px-6 py-16">
      <SignUp fallbackRedirectUrl={AFTER_AUTH_PATH} signInUrl="/sign-in" />
    </main>
  );
}
