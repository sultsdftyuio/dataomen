"use client";

import React, { useMemo, useState } from "react";
import { type User } from "@supabase/supabase-js";
import { 
  Eye, 
  EyeOff, 
  RefreshCw, 
  ShieldCheck, 
  UserCircle2, 
  Lock 
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";

interface AccountTabProps {
  user: User;
  initialData: {
    fullName?: string | null;
  };
  isRecoveryMode: boolean;
}

export default function AccountTab({ user, initialData, isRecoveryMode }: AccountTabProps) {
  const supabase = createClient();

  const resolveProfileName = () => {
    const suppliedName = typeof initialData.fullName === "string" ? initialData.fullName.trim() : "";
    if (suppliedName) return suppliedName;
    const metadata = user.user_metadata || {};
    const metadataName = metadata.full_name || metadata.name || metadata.preferred_username;
    if (typeof metadataName === "string" && metadataName.trim().length > 0) return metadataName.trim();
    return user.email?.includes("@") ? user.email.split("@")[0] : "Operator";
  };

  const email = user.email || "";
  const [fullName, setFullName] = useState(() => resolveProfileName());
  const [initialFullName, setInitialFullName] = useState(() => resolveProfileName());
  const hasAccountChanges = useMemo(() => fullName !== initialFullName, [fullName, initialFullName]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const isPasswordValid = useMemo(() => newPassword.trim().length >= 8, [newPassword]);

  const handleSaveAccount = async () => {
    if (!hasAccountChanges) return;
    setIsSavingAccount(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
      if (error) throw error;
      setInitialFullName(fullName);
      toast({ title: "Identity Saved", description: "Operator profile updated." });
    } catch (error: any) {
      toast({ title: "Sync Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!isPasswordValid) {
      toast({ title: "Invalid Protocol", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (!isRecoveryMode && !currentPassword) {
      toast({ title: "Verification Required", description: "Enter current password.", variant: "destructive" });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const payload = isRecoveryMode ? { newPassword } : { currentPassword, newPassword };
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password");
      setCurrentPassword("");
      setNewPassword("");
      toast({ title: "Cryptographic Update", description: "Session credentials secured." });

      if (isRecoveryMode && typeof window !== "undefined") {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("recovery");
        window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
      }
    } catch (error: any) {
      toast({ title: "Security Update Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "OP";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      
      {/* ── Section Header ── */}
      <div className="px-8 lg:px-12 py-6 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-blue-600 font-bold text-xs tracking-widest uppercase mb-3">
          <UserCircle2 className="h-4 w-4" /> Operator Identity
        </div>
        <h2 className="text-2xl font-semibold text-[#0A192F] tracking-tight">My Account</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your operator identity and authentication logic.</p>
      </div>

      <div className="p-6 lg:px-12 flex-1 overflow-y-auto space-y-8">
        
        {/* ── Card 1: Profile Details ── */}
        <section className="p-6 border border-slate-100 rounded-xl bg-white shadow-sm max-w-2xl space-y-8">
          <h3 className="text-lg font-semibold text-[#0A192F]">
            Profile Details
          </h3>

          <div className="flex items-center gap-6 pb-8 border-b border-slate-100">
            <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-[#0A192F] to-blue-600 flex items-center justify-center text-white text-xl font-semibold shadow-md ring-4 ring-slate-50">
              {getInitials(fullName || email)}
            </div>
            <div>
              <h4 className="text-base font-semibold text-[#0A192F]">{initialFullName || "System Operator"}</h4>
              <p className="text-xs text-slate-500 font-mono mt-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100 inline-block font-medium">
                {email}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label htmlFor="fullName" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                Operator Name
              </Label>
              {hasAccountChanges && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">
                  UNSAVED EDITS
                </span>
              )}
            </div>
            <div className="flex gap-4">
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 text-base shadow-sm"
              />
              <Button
                onClick={handleSaveAccount}
                disabled={isSavingAccount || !hasAccountChanges}
                className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 h-11 px-6 shadow-sm disabled:opacity-50 font-medium"
              >
                {isSavingAccount && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                Save Identity
              </Button>
            </div>
          </div>
        </section>

        {/* ── Card 2: Authentication Security ── */}
        <section className="p-6 border border-slate-100 rounded-xl bg-white shadow-sm max-w-2xl space-y-6">
          <h3 className="text-lg font-semibold text-[#0A192F] flex items-center gap-2">
            <Lock className="h-5 w-5 text-blue-600" /> Authentication Security
          </h3>

          {isRecoveryMode && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-3 shadow-sm">
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
              <p className="leading-relaxed">
                <strong className="block mb-0.5">Recovery Session Verified.</strong>
                Please define a new cryptographic password to secure this account going forward.
              </p>
            </div>
          )}

          {!isRecoveryMode && (
            <div className="space-y-3 relative">
              <Label htmlFor="current-password" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 shadow-sm pr-10"
                />
                <button
                  type="button"
                  aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3 relative">
            <Label htmlFor="new-password" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
              New Password
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 shadow-sm pr-10"
              />
              <button
                type="button"
                aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleUpdatePassword}
              disabled={isUpdatingPassword || !isPasswordValid}
              className="bg-[#0A192F] hover:bg-slate-800 text-white shadow-sm transition-all active:scale-[0.98] h-11 px-6 disabled:opacity-50 font-medium"
            >
              {isUpdatingPassword && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {isUpdatingPassword ? "Encrypting..." : "Update Credentials"}
            </Button>
          </div>
        </section>

      </div>
    </div>
  );
}