"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Supabase sign out failed", error);
      }
    } finally {
      window.location.href = "/login";
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
