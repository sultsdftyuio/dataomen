"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/logout/actions";
import { createClient as createBrowserClient } from "@/utils/supabase/client";

type LogoutButtonProps = {
  /** Icon-only, for the sidebar footer. The label stays as the accessible name. */
  iconOnly?: boolean;
};

export default function LogoutButton({ iconOnly = false }: LogoutButtonProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      const { error } = await logoutAction();
      if (error) {
        console.error("Supabase sign out failed", error);
      }
    } finally {
      try {
        await createBrowserClient().auth.signOut({ scope: "local" });
      } catch (error) {
        console.error("Local Supabase session cleanup failed", error);
      }

      window.location.replace("/login");
    }
  };

  const label = isSigningOut ? "Signing out…" : "Sign out";
  const Icon = isSigningOut ? LoaderCircle : LogOut;

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon-sm" : "sm"}
      onClick={handleLogout}
      disabled={isSigningOut}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className="text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon className={isSigningOut ? "size-4 motion-safe:animate-spin" : "size-4"} aria-hidden="true" />
      {iconOnly ? null : label}
    </Button>
  );
}
