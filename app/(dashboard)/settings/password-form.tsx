"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { SettingsRow } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

type PasswordRowProps = {
  /** Arrived from a password reset link (?recovery=1): the session is already verified. */
  recovery: boolean;
  /** The account signs in with email and password. */
  hasPassword: boolean;
};

type FieldErrors = { current?: string; next?: string; form?: string };

const MIN_LENGTH = 8;

// The route returns operator-facing messages; each status gets written copy instead.
function failureFor(status: number): FieldErrors {
  if (status === 403) return { current: "Your current password is incorrect. Check it and try again." };
  if (status === 401) return { form: "Your session has ended. Sign in again, then change your password." };
  if (status === 400) return { next: `That password can't be used. Choose a different one with at least ${MIN_LENGTH} characters.` };
  return { form: "Couldn't change your password. Try again. If it keeps happening, email support@arcli.tech." };
}

/**
 * The Password row in Profile. A reset link lands here with ?recovery=1, so in
 * that case the form starts open and asks only for the new password.
 */
export function PasswordRow({ recovery, hasPassword }: PasswordRowProps) {
  const router = useRouter();
  const formId = useId();
  const [isOpen, setIsOpen] = useState(recovery);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  if (!recovery && !hasPassword) return null;

  const currentId = `${formId}-current`;
  const nextId = `${formId}-next`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const nextErrors: FieldErrors = {};
    if (!recovery && !currentPassword) nextErrors.current = "Enter your current password.";
    if (newPassword.length < MIN_LENGTH) nextErrors.next = `Enter a new password with at least ${MIN_LENGTH} characters.`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recovery ? { newPassword } : { currentPassword, newPassword }),
      });
      if (!response.ok) {
        setErrors(failureFor(response.status));
        return;
      }
      setIsOpen(false);
      setSaved(true);
      toast({ title: "Password changed", description: "Use your new password next time you sign in." });
      // Drop ?recovery=1 so a refresh doesn't reopen the reset form.
      if (recovery) router.replace("/settings", { scroll: false });
    } catch {
      setErrors({ form: "Couldn't reach Arcli. Check your connection and try again." });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <SettingsRow
        label="Password"
        hint="Used to sign in with your email"
        action={
          <Button type="button" size="sm" variant="outline" onClick={() => { setSaved(false); setIsOpen(true); }}>
            Change password
          </Button>
        }
      >
        {saved ? <span role="status" className="text-success">Password changed</span> : <span aria-hidden="true">••••••••</span>}
      </SettingsRow>
    );
  }

  return (
    <div className="px-4 py-4 md:px-5">
      <form onSubmit={submit} noValidate className="max-w-md space-y-4" aria-labelledby={`${formId}-title`}>
        <div>
          <h3 id={`${formId}-title`} className="text-sm leading-6 font-medium text-foreground">
            {recovery ? "Choose a new password" : "Change password"}
          </h3>
          {recovery ? (
            <p className="text-sm leading-6 text-muted-foreground">
              You opened a password reset link. Set a new password to finish.
            </p>
          ) : null}
        </div>

        {recovery ? null : (
          <PasswordField
            id={currentId}
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
            error={errors.current}
            autoFocus
          />
        )}
        <PasswordField
          id={nextId}
          name="newPassword"
          label="New password"
          hint={`At least ${MIN_LENGTH} characters.`}
          autoComplete="new-password"
          error={errors.next}
          autoFocus={recovery}
        />

        {errors.form ? (
          <p role="alert" className="text-sm leading-6 text-danger">
            {errors.form}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> Saving…
              </>
            ) : (
              "Save new password"
            )}
          </Button>
          <Button type="button" variant="ghost" disabled={isSaving} onClick={() => { setErrors({}); setIsOpen(false); }}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

type PasswordFieldProps = {
  id: string;
  name: string;
  label: string;
  hint?: string;
  autoComplete: string;
  error?: string;
  autoFocus?: boolean;
};

function PasswordField({ id, name, label, hint, autoComplete, error, autoFocus }: PasswordFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm leading-6 font-medium text-foreground">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm leading-6 font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className="h-10"
      />
    </div>
  );
}
