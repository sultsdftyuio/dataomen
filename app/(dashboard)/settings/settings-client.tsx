// app/(dashboard)/settings/settings-client.tsx
"use client";

import React, { useState } from "react";
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
  Mail,
  ShieldAlert
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";

type SettingsTab = "profile" | "security" | "notifications" | "developer";

interface SettingsClientProps {
  user: any;
  initialSettings: {
    notifyAnomalies: boolean;
    notifyWeekly: boolean;
    apiKey: string;
    keyLastUpdated: string;
  };
  isRecoveryMode: boolean;
}

export default function SettingsClient({ user, initialSettings, isRecoveryMode }: SettingsClientProps) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  
  // Action States
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);

  const resolveProfileName = () => {
    const metadata = user.user_metadata || {};
    const metadataName = metadata.full_name || metadata.name || metadata.preferred_username;
    if (typeof metadataName === "string" && metadataName.trim().length > 0) return metadataName.trim();
    return user.email?.includes("@") ? user.email.split("@")[0] : "User";
  };

  // Profile State initialized deterministically from Server Props
  const [email] = useState(user.email || "");
  const [fullName, setFullName] = useState(resolveProfileName());
  const [initialFullName, setInitialFullName] = useState(resolveProfileName());

  // Settings State initialized deterministically from Server Props
  const [notifyAnomalies, setNotifyAnomalies] = useState(initialSettings.notifyAnomalies);
  const [notifyWeekly, setNotifyWeekly] = useState(initialSettings.notifyWeekly);
  const [initialNotifyAnomalies, setInitialNotifyAnomalies] = useState(initialSettings.notifyAnomalies);
  const [initialNotifyWeekly, setInitialNotifyWeekly] = useState(initialSettings.notifyWeekly);
  const [apiKey, setApiKey] = useState(initialSettings.apiKey);
  const [keyLastUpdated, setKeyLastUpdated] = useState<string | null>(initialSettings.keyLastUpdated);
  
  // Security UI State
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);

  const hasProfileChanges = fullName !== initialFullName;
  const hasNotificationChanges = notifyAnomalies !== initialNotifyAnomalies || notifyWeekly !== initialNotifyWeekly;

  const handleSaveProfile = async () => {
    if (!hasProfileChanges) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
      if (error) throw error;
      setInitialFullName(fullName);
      toast({ title: "Profile Saved", description: "Your identity has been updated." });
    } catch (error: any) {
      toast({ title: "Sync Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!hasNotificationChanges) return;
    setIsSavingNotifications(true);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyAnomalies, notifyWeekly })
      });
      
      if (!res.ok) throw new Error("Failed to save routing preferences");
      
      setInitialNotifyAnomalies(notifyAnomalies);
      setInitialNotifyWeekly(notifyWeekly);
      toast({ title: "Routing Updated", description: "Recovery notification rules applied." });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleRegenerateApiKey = async () => {
    if (!window.confirm("WARNING: Regenerating this key will instantly break any existing API integrations using the old key. Proceed?")) return;
    
    setIsRegeneratingKey(true);
    try {
      const res = await fetch('/api/settings/developer/regenerate', { method: 'POST' });
      if (!res.ok) throw new Error("Failed to regenerate key");
      
      const data = await res.json();
      setApiKey(data.apiKey);
      setKeyLastUpdated("Just now");
      setShowApiKey(true);
      toast({ title: "Key Regenerated", description: "Your new API token is ready to use." });
    } catch (error: any) {
      toast({ title: "Security Action Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const handleUpdateCredentials = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast({ title: "Invalid Password", description: "At least 8 characters required.", variant: "destructive" });
      return;
    }
    if (!isRecoveryMode && !currentPassword) {
      toast({ title: "Verification Required", description: "Enter current password.", variant: "destructive" });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      if (!isRecoveryMode) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
        if (verifyError) throw new Error("Current password incorrect.");
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword("");
      setNewPassword("");
      toast({ title: "Credentials Updated", description: "Password secured." });

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

  const copyToClipboard = (text: string) => {
    if (!text || text === "No active key") return;
    navigator.clipboard.writeText(text);
    setHasCopiedKey(true);
    toast({ title: "Token Copied", description: "Securely copied to clipboard." });
    setTimeout(() => setHasCopiedKey(false), 2000);
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const TABS = [
    { id: "profile", label: "Identity & Profile", icon: User },
    { id: "security", label: "Access & Security", icon: Lock },
    { id: "notifications", label: "Recovery Routing", icon: Activity },
    { id: "developer", label: "API & Webhooks", icon: Terminal },
  ] as const;

  return (
    // Removed margins, padding, border radius, and headers. Forced edge-to-edge full height.
    <div className="flex flex-col md:flex-row flex-1 w-full h-full bg-white overflow-hidden animate-in fade-in duration-300">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-72 shrink-0 bg-slate-50/50 border-r border-slate-100 flex flex-col justify-between z-10 overflow-y-auto">
        <div className="p-4 space-y-1">
          <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-3 px-3 mt-2">Configuration Map</div>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-all duration-200 ${
                  isActive ? "bg-[#0A192F] text-white font-semibold shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 m-4 rounded-lg bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="h-4 w-4 text-[#0A192F]" />
            <span className="text-xs font-bold text-[#0A192F]">Need Assistance?</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed mb-3">Our engineering team is available for architectural support and custom integrations.</p>
          <a href="mailto:support@arcli.tech" className="flex items-center justify-center gap-2 w-full py-2 px-2 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-700 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors">
            <Mail className="h-3 w-3" /> support@arcli.tech
          </a>
        </div>
      </aside>

      {/* Dynamic Content Area */}
      <main className="flex-1 flex flex-col relative bg-gradient-to-br from-white to-slate-50/30 overflow-hidden w-full h-full">
        
        {/* --- PROFILE TAB --- */}
        {activeTab === "profile" && (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            <div className="px-8 lg:px-12 py-8 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
              <h2 className="text-xl font-semibold text-[#0A192F]">Identity & Profile</h2>
              <p className="text-sm text-slate-500 mt-1">Configure your personal identity within the recovery engine.</p>
            </div>
            
            <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-10">
              <div className="flex items-center gap-6 p-6 border border-slate-100 rounded-xl bg-white shadow-sm max-w-2xl">
                <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-[#0A192F] to-blue-600 flex items-center justify-center text-white text-2xl font-semibold shadow-md ring-4 ring-blue-50">
                  {getInitials(fullName || email)}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#0A192F]">{initialFullName || "System User"}</h3>
                  <p className="text-sm text-slate-500 font-mono mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">{email}</p>
                </div>
              </div>

              <div className="max-w-2xl space-y-4">
                <div className="flex justify-between items-center">
                  <Label htmlFor="fullName" className="text-xs font-bold tracking-wide text-slate-500 uppercase">Full Name</Label>
                  {hasProfileChanges && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">Unsaved Changes</span>}
                </div>
                <Input 
                  id="fullName" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                  className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 text-base shadow-sm"
                />
              </div>
              
              <div className="max-w-2xl space-y-4">
                <Label htmlFor="email" className="text-xs font-bold tracking-wide text-slate-500 uppercase">Email Address</Label>
                <Input id="email" type="email" value={email} disabled className="bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed h-11 text-base shadow-inner" />
                <div className="flex items-center gap-2 mt-2 text-xs font-medium text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" /> Managed securely via identity provider
                </div>
              </div>
            </div>

            <div className="px-8 lg:px-12 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between mt-auto">
              <p className="text-xs font-medium text-slate-500">Changes apply immediately across the architecture.</p>
              <Button 
                onClick={handleSaveProfile} 
                disabled={isSavingProfile || !hasProfileChanges}
                className="bg-[#0A192F] hover:bg-blue-900 text-white shadow-md transition-all active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none px-6 h-10"
              >
                {isSavingProfile && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
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
                
                {!isRecoveryMode && (
                  <div className="space-y-3 relative">
                    <Label htmlFor="current-password" className="text-xs font-bold tracking-wide text-slate-500 uppercase">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="current-password"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 shadow-sm pr-10"
                      />
                      <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3 relative">
                  <Label htmlFor="new-password" className="text-xs font-bold tracking-wide text-slate-500 uppercase">New Password</Label>
                  <div className="relative">
                    <Input 
                      id="new-password" 
                      type={showNewPassword ? "text" : "password"} 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 shadow-sm pr-10" 
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 lg:px-12 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between mt-auto">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" /> Updating credentials terminates active sessions.
              </p>
              <Button
                onClick={handleUpdateCredentials}
                disabled={isUpdatingPassword}
                className="bg-[#0A192F] hover:bg-blue-900 text-white shadow-md transition-all active:scale-[0.98] px-6 h-10 disabled:bg-slate-100 disabled:text-slate-400"
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
              <h2 className="text-xl font-semibold text-[#0A192F]">Recovery Routing</h2>
              <p className="text-sm text-slate-500 mt-1">Define routing logic for deterministic churn signals.</p>
            </div>
            
            <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-4 max-w-4xl">
              <div className={`flex items-start justify-between p-6 border bg-white rounded-xl transition-all duration-200 ${notifyAnomalies ? 'border-rose-200 shadow-sm ring-1 ring-rose-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-2 max-w-[80%]">
                  <Label className="text-base font-semibold text-[#0A192F] flex items-center gap-2 cursor-pointer" onClick={() => setNotifyAnomalies(!notifyAnomalies)}>
                    <AlertCircle className={`h-5 w-5 ${notifyAnomalies ? 'text-rose-500' : 'text-slate-400'}`} />
                    Critical Risk Routing
                  </Label>
                  <p className="text-sm text-slate-500 leading-relaxed">Dispatch immediate email payloads when the engine flags high-MRR accounts for severe churn risk.</p>
                </div>
                <Switch checked={notifyAnomalies} onCheckedChange={setNotifyAnomalies} className="data-[state=checked]:bg-rose-500 mt-1" />
              </div>

              <div className={`flex items-start justify-between p-6 border bg-white rounded-xl transition-all duration-200 ${notifyWeekly ? 'border-blue-200 shadow-sm ring-1 ring-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-2 max-w-[80%]">
                  <Label className="text-base font-semibold text-[#0A192F] flex items-center gap-2 cursor-pointer" onClick={() => setNotifyWeekly(!notifyWeekly)}>
                    <Activity className={`h-5 w-5 ${notifyWeekly ? 'text-blue-600' : 'text-slate-400'}`} />
                    Weekly Recovery Digest
                  </Label>
                  <p className="text-sm text-slate-500 leading-relaxed">Compile and transmit a summarized report of your recovered MRR and queue every Monday.</p>
                </div>
                <Switch checked={notifyWeekly} onCheckedChange={setNotifyWeekly} className="data-[state=checked]:bg-blue-600 mt-1" />
              </div>
            </div>

            <div className="px-8 lg:px-12 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between mt-auto">
              <div className="flex items-center gap-2">
                {hasNotificationChanges ? (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">Unsaved Rules</span>
                ) : (
                  <p className="text-xs font-medium text-slate-500">Routing active and enforced.</p>
                )}
              </div>
              <Button 
                onClick={handleSaveNotifications} 
                disabled={isSavingNotifications || !hasNotificationChanges}
                className="bg-[#0A192F] hover:bg-blue-900 text-white shadow-md transition-all active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 px-6 h-10"
              >
                {isSavingNotifications && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                Save Preferences
              </Button>
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
              <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase rounded-full border shadow-sm ${apiKey === "No active key" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                <div className={`h-2 w-2 rounded-full ${apiKey === "No active key" ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
                {apiKey === "No active key" ? "API Disabled" : "API Active"}
              </div>
            </div>
            
            <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-10">
              <div className="space-y-4 max-w-3xl">
                <Label className="text-xs font-bold tracking-wide text-slate-500 uppercase">Production Token</Label>
                <div className="p-6 border border-slate-200 bg-slate-50/80 rounded-xl space-y-5 shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Input 
                        readOnly 
                        value={apiKey} 
                        type={showApiKey ? "text" : "password"}
                        className="font-mono text-sm tracking-widest bg-white border-slate-200 text-[#0A192F] h-12 shadow-sm pr-16 w-full" 
                      />
                      <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 rounded uppercase tracking-wider transition-colors">
                        {showApiKey ? "Hide" : "Reveal"}
                      </button>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => copyToClipboard(apiKey)}
                      disabled={apiKey === "No active key"} 
                      className={`h-12 px-5 border-slate-200 shadow-sm transition-all duration-300 ${hasCopiedKey ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-600 hover:text-blue-700 hover:bg-blue-50'}`}
                    >
                      {hasCopiedKey ? <Check className="h-5 w-5 mr-2" /> : <Copy className="h-5 w-5 mr-2" />}
                      {hasCopiedKey ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs font-medium border-t border-slate-200 pt-4">
                    <span className="text-slate-500 flex items-center gap-2">
                      Last Generated: <span className="text-[#0A192F] font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded">{keyLastUpdated}</span>
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-start pt-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRegenerateApiKey}
                    disabled={isRegeneratingKey}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-sm font-semibold px-4 h-10 transition-colors"
                  >
                    {isRegeneratingKey ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                    Revoke & Regenerate Key
                  </Button>
                </div>
              </div>

              <div className="max-w-3xl p-6 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/50 to-white flex items-start gap-4 shadow-sm">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200">
                  <CheckCircle2 className="h-5 w-5 text-blue-700" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-[#0A192F]">Webhook Architecture</h4>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                    Arcli relies on modular webhook pipelines defined at the campaign level. To configure outbound logic, visit specific Campaign routing settings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}