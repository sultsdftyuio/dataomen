import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RECOVERY_GRANT_COOKIE, isRecoveryGrantValid } from "@/lib/auth/recovery-grant";
import { RECOVERY_LINK_INVALID_PATH } from "@/utils/auth-redirects";
import { createClient } from "@/utils/supabase/server";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Choose a New Password | Arcli",
  description: "Choose a new password for your Arcli account.",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Being signed in is not enough: only a verified reset link may open this page.
  if (!user || !isRecoveryGrantValid(cookieStore.get(RECOVERY_GRANT_COOKIE)?.value, user.id)) {
    redirect(RECOVERY_LINK_INVALID_PATH);
  }

  return (
    <AuthShell
      title="Choose a new password"
      intro={
        user.email ? (
          <>
            For <span className="font-semibold break-all text-foreground">{user.email}</span>
          </>
        ) : undefined
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
