"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/logout/actions";
import { createClient as createBrowserClient } from "@/utils/supabase/client";

export default function LogoutButton() {
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

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={isSigningOut}
      className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
    >
      <LogOut className="h-4 w-4" />
      {isSigningOut ? "Signing out..." : "Log out"}
    </Button>
  );
}
