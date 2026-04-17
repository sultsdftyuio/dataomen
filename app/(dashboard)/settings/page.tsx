// app/(dashboard)/settings/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { 
  User, 
  Lock, 
  Terminal, 
  ShieldCheck, 
  AlertCircle,
  Copy,
  RefreshCw,
  Activity,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  Check,
  Mail
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

type SettingsTab = "profile" | "security" | "notifications" | "developer";

export default function SettingsPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // User State
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [initialFullName, setInitialFullName] = useState(""); // For change detection

  // Notification Preferences State
  const [notifyAnomalies, setNotifyAnomalies] = useState(true);
  const [notifyWeekly, setNotifyWeekly] = useState(true);
  
  // Security & Developer UI State
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);

  const isRecoveryMode = searchParams.get("recovery") === "1";

  const resolveProfileName = (user: {
    email?: string | null;
    user_metadata?: Record<string, any> | null;
  }) => {
    const metadata = user.user_metadata || {};
    const metadataName = metadata.full_name || metadata.name || metadata.preferred_username;

    if (typeof metadataName === "string" && metadataName.trim().length > 0) {
      return metadataName.trim();
    }

    const resolvedEmail = user.email || "";
    return resolvedEmail.includes("@") ? resolvedEmail.split("@")[0] : "User";
  };
  
  // Developer State
  const [apiKey] = useState("do_live_7x89f2a4c1b3e6d5p0m9n8q7w6e5r4t3y2u1i0o");

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;

        if (user) {
          const resolvedEmail = user.email || "";
          const name = resolveProfileName(user);

          setEmail(resolvedEmail);
          setFullName(name);
          setInitialFullName(name);
        }
      } catch (error) {
        console.error("Failed to load user:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [supabase.auth]);

  const hasProfileChanges = fullName !== initialFullName;

  const handleSaveProfile = async () => {
    if (!hasProfileChanges) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });
      if (error) throw error;
      setInitialFullName(fullName);
      toast({ 
        title: "Configuration Saved", 
        description: "Your system profile has been updated successfully.",
      });
    } catch (error: any) {
      toast({ 
        title: "Sync Error", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCredentials = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast({
        title: "Invalid Password",
        description: "Your new password must contain at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    if (!isRecoveryMode && !currentPassword) {
      toast({
        title: "Current Password Required",
        description: "Enter your current password to authorize this security update.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.email) {
        throw new Error("Unable to verify your active session.");
      }

      if (!isRecoveryMode) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

        if (verifyError) {
          toast({
            title: "Current Password Incorrect",
            description: "The current password you entered could not be verified.",
            variant: "destructive",
          });
          return;
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setCurrentPassword("");
      setNewPassword("");
      toast({
        title: "Credentials Updated",
        description: "Your password has been updated successfully.",
      });

      if (isRecoveryMode && typeof window !== "undefined") {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("recovery");
        window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
      }
    } catch (error: any) {
      toast({
        title: "Security Update Failed",
        description: error?.message || "Unable to update your credentials right now.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopiedKey(true);
    toast({ 
      title: "Key Copied", 
      description: "API token securely copied to clipboard.",
    });
    setTimeout(() => setHasCopiedKey(false), 2000);
  };

  // Helper to get initials for the avatar
  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const TABS = [
    { id: "profile", label: "Identity & Profile", icon: User },
    { id: "security", label: "Access & Security", icon: Lock },
    { id: "notifications", label: "Engine Alerts", icon: Activity },
    { id: "developer", label: "API & Webhooks", icon: Terminal },
  ] as const;

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 h-full w-full p-6 animate-in fade-in">
        <div className="space-y-2 mb-8">
          <Skeleton className="h-8 w-48 rounded-md bg-slate-200" />
          <Skeleton className="h-4 w-96 rounded-md bg-slate-100" />
        </div>
        <Skeleton className="flex-1 w-full rounded-xl bg-slate-50 border border-slate-100" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full min-h-[calc(100vh-4rem)] w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header section - Full width alignment */}
      <div className="mb-6 px-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0A192F]">System Preferences</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage workspace configuration, access controls, and integration protocols.
        </p>
      </div>

      {/* Main Unified Interface Container - Expands to fill available space */}
      <div className="flex flex-col md:flex-row flex-1 w-full bg-white border border-slate-200/80 rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        
        {/* Sidebar Navigation - Fixed width, deep integration */}
        <aside className="w-full md:w-72 shrink-0 bg-slate-50/50 border-r border-slate-100 flex flex-col justify-between z-10">
          <div className="p-4 space-y-1">
            <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-3 px-3">
              Configuration Map
            </div>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-all duration-200 ${
                    isActive 
                      ? "bg-[#0A192F] text-white font-semibold shadow-sm" 
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Support Widget */}
          <div className="p-4 m-4 rounded-lg bg-white border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="h-4 w-4 text-[#0A192F]" />
              <span className="text-xs font-bold text-[#0A192F]">Need Assistance?</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
              Our engineering team is available for architectural support and custom integrations.
            </p>
            <a 
              href="mailto:support@arcli.tech" 
              className="flex items-center justify-center gap-2 w-full py-2 px-2 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-700 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors"
            >
              <Mail className="h-3 w-3" /> support@arcli.tech
            </a>
          </div>
        </aside>

        {/* Dynamic Content Area - Fills remaining width and height */}
        <main className="flex-1 flex flex-col relative bg-gradient-to-br from-white to-slate-50/30 overflow-hidden w-full">
          
          {/* --- PROFILE TAB --- */}
          {activeTab === "profile" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="px-8 lg:px-12 py-8 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-[#0A192F]">Identity & Profile</h2>
                <p className="text-sm text-slate-500 mt-1">Configure your personal identity within the analytical engine.</p>
              </div>
              
              <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-10">
                
                {/* Visual Avatar Identifier */}
                <div className="flex items-center gap-6 p-6 border border-slate-100 rounded-xl bg-white shadow-sm max-w-2xl">
                  <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-[#0A192F] to-blue-600 flex items-center justify-center text-white text-2xl font-semibold shadow-md ring-4 ring-blue-50">
                    {getInitials(fullName || email)}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[#0A192F]">{initialFullName || "System User"}</h3>
                    <p className="text-sm text-slate-500 font-mono mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">{email}</p>
                  </div>
                </div>

                {/* Editable State */}
                <div className="max-w-2xl space-y-4">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="fullName" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                      Full Name
                    </Label>
                    {hasProfileChanges && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">Unsaved Changes</span>}
                  </div>
                  <Input 
                    id="fullName" 
                    placeholder="Enter your name" 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)} 
                    className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all h-11 text-base shadow-sm"
                  />
                </div>
                
                {/* Read-Only State */}
                <div className="max-w-2xl space-y-4">
                  <Label htmlFor="email" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                    Email Address
                  </Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={email} 
                    disabled 
                    className="bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed h-11 text-base shadow-inner"
                  />
                  <div className="flex items-center gap-2 mt-2 text-xs font-medium text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    Managed securely via identity provider
                  </div>
                </div>
              </div>

              <div className="px-8 lg:px-12 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between mt-auto">
                <p className="text-xs font-medium text-slate-500">
                  Changes apply immediately across the DataOmen architecture.
                </p>
                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isSaving || !hasProfileChanges}
                  className="bg-[#0A192F] hover:bg-blue-900 text-white shadow-md transition-all active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:active:scale-100 px-6 h-10"
                >
                  {isSaving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Save Configuration
                </Button>
              </div>
            </div>
          )}

          {/* --- SECURITY TAB --- */}
          {activeTab === "security" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="px-8 lg:px-12 py-8 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-[#0A192F]">Access & Security</h2>
                <p className="text-sm text-slate-500 mt-1">Manage cryptographic keys and session parameters.</p>
              </div>
              
              <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-8">
                <div className="max-w-2xl space-y-6">

                  {isRecoveryMode && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                      Recovery session verified. Set a new password to secure your account.
                    </div>
                  )}
                  
                  {/* Current Password with Visibility Toggle */}
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
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 shadow-sm pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* New Password with Visibility Toggle */}
                  <div className="space-y-3 relative">
                    <Label htmlFor="new-password" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                      New Password
                    </Label>
                    <div className="relative">
                      <Input 
                        id="new-password" 
                        type={showNewPassword ? "text" : "password"} 
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 shadow-sm pr-10" 
                      />
                      <button 
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              <div className="px-8 lg:px-12 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between mt-auto">
                <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-slate-400" />
                  Updating credentials will terminate all active sessions.
                </p>
                <Button
                  onClick={handleUpdateCredentials}
                  disabled={isUpdatingPassword}
                  className="bg-[#0A192F] hover:bg-blue-900 text-white shadow-md transition-all active:scale-[0.98] px-6 h-10 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:active:scale-100"
                >
                  {isUpdatingPassword && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  {isUpdatingPassword ? "Updating..." : "Update Credentials"}
                </Button>
              </div>
            </div>
          )}

          {/* --- NOTIFICATIONS TAB --- */}
          {activeTab === "notifications" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="px-8 lg:px-12 py-8 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-[#0A192F]">Engine Alerts</h2>
                <p className="text-sm text-slate-500 mt-1">Define routing logic for system-generated insights.</p>
              </div>
              
              <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-4 max-w-4xl">
                
                {/* Setting Row 1 */}
                <div className={`flex items-start justify-between p-6 border bg-white rounded-xl transition-all duration-200 ${notifyAnomalies ? 'border-rose-200 shadow-sm ring-1 ring-rose-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="space-y-2 max-w-[80%]">
                    <Label className="text-base font-semibold text-[#0A192F] flex items-center gap-2 cursor-pointer" onClick={() => setNotifyAnomalies(!notifyAnomalies)}>
                      <AlertCircle className={`h-5 w-5 ${notifyAnomalies ? 'text-rose-500' : 'text-slate-400'}`} />
                      Critical Anomaly Routing
                    </Label>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Dispatch immediate email payloads when the autonomous engine detects high-variance metric shifts (e.g., sudden churn spikes).
                    </p>
                  </div>
                  <Switch checked={notifyAnomalies} onCheckedChange={setNotifyAnomalies} className="data-[state=checked]:bg-rose-500 mt-1" />
                </div>

                {/* Setting Row 2 */}
                <div className={`flex items-start justify-between p-6 border bg-white rounded-xl transition-all duration-200 ${notifyWeekly ? 'border-blue-200 shadow-sm ring-1 ring-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="space-y-2 max-w-[80%]">
                    <Label className="text-base font-semibold text-[#0A192F] flex items-center gap-2 cursor-pointer" onClick={() => setNotifyWeekly(!notifyWeekly)}>
                      <Activity className={`h-5 w-5 ${notifyWeekly ? 'text-blue-600' : 'text-slate-400'}`} />
                      Executive Digest Pipeline
                    </Label>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Compile and transmit a summarized narrative report of your entire workspace state every Monday at 08:00 UTC.
                    </p>
                  </div>
                  <Switch checked={notifyWeekly} onCheckedChange={setNotifyWeekly} className="data-[state=checked]:bg-blue-600 mt-1" />
                </div>

              </div>
            </div>
          )}

          {/* --- DEVELOPER TAB --- */}
          {activeTab === "developer" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="px-8 lg:px-12 py-8 border-b border-slate-100 bg-white/80 backdrop-blur-sm flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-[#0A192F]">API & Webhooks</h2>
                  <p className="text-sm text-slate-500 mt-1">Manage programmatic access and external integrations.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold tracking-wide uppercase rounded-full border border-emerald-200 shadow-sm">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  API Active
                </div>
              </div>
              
              <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-10">
                
                {/* API Key Block - Strict Monospace typography for tech data */}
                <div className="space-y-4 max-w-3xl">
                  <Label className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                    Production Token
                  </Label>
                  <div className="p-6 border border-slate-200 bg-slate-50/80 rounded-xl space-y-5 shadow-inner">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Input 
                          readOnly 
                          value={apiKey} 
                          type={showApiKey ? "text" : "password"}
                          className="font-mono text-sm tracking-widest bg-white border-slate-200 text-[#0A192F] h-12 shadow-sm pr-16 w-full" 
                        />
                        <button 
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 rounded uppercase tracking-wider transition-colors"
                        >
                          {showApiKey ? "Hide" : "Reveal"}
                        </button>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => copyToClipboard(apiKey)} 
                        className={`h-12 px-5 border-slate-200 shadow-sm transition-all duration-300 ${hasCopiedKey ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-600 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200'}`}
                      >
                        {hasCopiedKey ? <Check className="h-5 w-5 mr-2" /> : <Copy className="h-5 w-5 mr-2" />}
                        {hasCopiedKey ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium border-t border-slate-200 pt-4">
                      <span className="text-slate-500 flex items-center gap-2">
                        Last requested: <span className="text-[#0A192F] font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded">14 mins ago</span>
                      </span>
                      <span className="text-slate-500 flex items-center gap-2">
                        IP Binding: <span className="text-[#0A192F] font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded">192.168.1.1</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-start pt-2">
                    <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-sm font-semibold px-4 h-10 transition-colors">
                      Revoke & Regenerate Key
                    </Button>
                  </div>
                </div>

                {/* Webhook Notice */}
                <div className="max-w-3xl p-6 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/50 to-white flex items-start gap-4 shadow-sm">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200">
                    <CheckCircle2 className="h-5 w-5 text-blue-700" />
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-[#0A192F]">Webhook Architecture</h4>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                      DataOmen relies on modular webhook pipelines defined at the agent level rather than global settings. To configure an outbound webhook, navigate to the specific Agent's configuration panel in the deployment interface.
                    </p>
                  </div>
                </div>

              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}