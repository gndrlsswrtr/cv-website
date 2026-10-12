import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/LoginForm";
import { countUsers } from "@/lib/auth/session";

/**
 * Blocking (not streamed) so the "no account yet" redirect is a real HTTP
 * response rather than a streamed one.
 */
export const instant = false;

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  // First run: send the owner to the one-time setup page.
  if ((await countUsers()) === 0) redirect("/setup");

  const sp = await searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/admin";

  // No "already signed in?" check here on purpose. The proxy bounces a valid
  // session away from /login before this page ever renders; a stale cookie is
  // caught by `requireUser()` instead, which lands on /login?expired=1 and is
  // deliberately not bounced (see src/proxy.ts). Redirecting from here would
  // make Next resolve the destination route while prerendering.

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-foreground text-sm font-semibold text-background mx-auto">
              A
            </span>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-muted">
            Restricted area — content management for this site.
          </p>
        </div>

        <div className="card px-5 py-6 sm:px-6">
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/" className="hover:text-foreground">
            ← Back to the public site
          </Link>
        </p>
      </div>
    </main>
  );
}
