import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

type AuthShellProps = {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** Page frame shared by the password-recovery screens. */
export function AuthShell({ title, intro, children, footer }: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="dot-grid absolute inset-0 opacity-60" aria-hidden="true" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="mb-6 rounded-md" aria-label="Arcli home">
            <Logo className="h-10 w-auto" />
          </Link>
          <h1 className="pfd text-3xl font-bold text-foreground">{title}</h1>
          {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </div>

        {footer && (
          <p className="mt-8 text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </main>
  );
}
