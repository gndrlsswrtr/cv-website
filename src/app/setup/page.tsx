import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { SetupForm } from "@/components/admin/SetupForm";
import { countUsers } from "@/lib/auth/session";

/**
 * One-time first-run page.
 *
 * It 404s permanently once an account exists, so the setup endpoint cannot be
 * used later to mint an extra admin. `instant = false` keeps the redirect and
 * the 404 as real HTTP responses instead of streamed ones.
 */
export const instant = false;

export const metadata: Metadata = {
  title: "First-run setup",
  robots: { index: false, follow: false },
};

export default async function SetupPage() {
  const users = await countUsers();
  if (users > 0) {
    // An admin already exists — the setup window is closed for good.
    const hasSession = false;
    if (hasSession) redirect("/admin");
    notFound();
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-foreground text-sm font-semibold text-background mx-auto">
            A
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Create the admin account</h1>
          <p className="mt-2 text-sm text-muted">
            This page is shown only once, on the first run. The account you create now is the only
            way to manage this site.
          </p>
        </div>

        <div className="card px-5 py-6 sm:px-6">
          <SetupForm />
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
