"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const INITIAL_STATE: ForgotPasswordState = {};

const backToLogin = (
  <>
    Remembered it?{" "}
    <Link href="/login" className="font-semibold text-foreground underline underline-offset-2">
      Back to log in
    </Link>
  </>
);

function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, INITIAL_STATE);
  const searchParams = useSearchParams();
  const linkFailed = searchParams.get("error") === "recovery_link_invalid";

  if (state.sentTo) {
    return (
      <AuthShell title="Check your email" footer={backToLogin}>
        <div role="status" className="space-y-4 text-sm text-foreground">
          <p>
            If an Arcli account exists for{" "}
            <span className="font-semibold break-all">{state.sentTo}</span>, a link to
            choose a new password is on its way.
          </p>
          <p className="text-muted-foreground">
            Open the link in this browser. It works once, so use the newest email if
            you asked more than once. Nothing after a few minutes? Check your spam
            folder.
          </p>
          {/* A full navigation is what clears the confirmation state. */}
          <a
            href="/forgot-password"
            className="inline-block font-semibold text-primary underline underline-offset-2"
          >
            Use a different email
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      intro="Enter the email you use for Arcli and we'll send a link to choose a new password."
      footer={backToLogin}
    >
      <form action={formAction} className="space-y-5" noValidate>
        {linkFailed && !state.error && (
          <p
            role="alert"
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            That reset link can&apos;t be used. It may have expired, been used
            already, or been opened in a different browser from the one that
            requested it. Request a new link below.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            defaultValue={state.email ?? ""}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "email-error" : undefined}
            className="h-11 text-base"
          />
          {state.error && (
            <p id="email-error" role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isPending ? "Sending link" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/40" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
