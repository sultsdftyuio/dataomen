"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-rules";
import { updatePassword, type ResetPasswordState } from "./actions";

const INITIAL_STATE: ResetPasswordState = {};

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(updatePassword, INITIAL_STATE);
  // One field with a reveal toggle instead of asking for the password twice.
  const [isVisible, setIsVisible] = useState(false);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">New password</Label>
          <button
            type="button"
            onClick={() => setIsVisible((visible) => !visible)}
            aria-pressed={isVisible}
            aria-controls="password"
            className="rounded-sm text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {isVisible ? "Hide" : "Show"}
          </button>
        </div>
        <Input
          id="password"
          name="password"
          type={isVisible ? "text" : "password"}
          autoComplete="new-password"
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-hint password-error" : "password-hint"}
          className="h-11 text-base"
        />
        <p id="password-hint" className="text-sm text-muted-foreground">
          At least {PASSWORD_MIN_LENGTH} characters
        </p>
        {state.error && (
          <p id="password-error" role="alert" className="text-sm font-medium text-destructive">
            {state.error}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {isPending ? "Saving password" : "Save new password"}
      </Button>

      <p className="text-sm text-muted-foreground">
        Saving signs you out everywhere. You&apos;ll log in again with the new password.
      </p>
    </form>
  );
}
