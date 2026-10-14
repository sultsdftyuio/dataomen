import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Workspace couldn't load | Arcli",
  robots: { index: false, follow: false },
};

/**
 * Where server code redirects when it can't resolve the signed-in workspace
 * (redirect("/error") in the dashboard and onboarding routes). It sits outside
 * the dashboard shell because the shell itself needs the workspace to render.
 */
export default function WorkspaceErrorPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-off-white px-4 py-8 md:py-16">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/" aria-label="Arcli home" className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Logo />
        </Link>

        <section
          aria-labelledby="error-title"
          className="mt-8 rounded-lg border border-border bg-card p-5 md:p-8"
        >
          <AlertCircle className="size-6 text-danger" aria-hidden="true" />
          <h1 id="error-title" className="mt-4 text-2xl leading-8 font-semibold text-foreground md:text-[28px] md:leading-9">
            Something went wrong opening your workspace
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Arcli couldn&apos;t load your account and workspace details, so it
            stopped before showing anything incomplete. Your prospects, targeting
            brief and settings haven&apos;t changed.
          </p>
          <h2 className="mt-6 text-base font-semibold text-foreground">What to do</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base leading-7 text-muted-foreground">
            <li>Wait a minute, then go back to Prospects.</li>
            <li>If you were signed out, sign in again.</li>
            <li>
              If it keeps happening, email{" "}
              <a className="font-medium text-primary underline underline-offset-2" href="mailto:support@arcli.tech?subject=Workspace%20won%27t%20open">
                support@arcli.tech
              </a>{" "}
              with the time it happened.
            </li>
          </ul>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">Go to Prospects</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in again</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
