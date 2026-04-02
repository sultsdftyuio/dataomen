// app/(dashboard)/settings/page.tsx
"use client";

import React, { useState, useEffect } from "react";
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
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);
  
  // Developer State
  const [apiKey] = useState("do_live_7x89f2a4c1b3e6d5p0m9n8q7w6e5r4t3y2u1i0o");

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user) {
          setEmail(user.email || "");
          const name = user.user_metadata?.full_name || "";
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
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[600px] max-w-5xl mx-auto w-full p-6 animate-in fade-in">
        <div className="space-y-2 mb-8">
          <Skeleton className="h-8 w-48 rounded-md bg-slate-200" />
          <Skeleton className="h-4 w-96 rounded-md bg-slate-100" />
        </div>
        <Skeleton className="flex-1 w-full rounded-xl bg-slate-50 border border-slate-100" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[650px] max-w-5xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header section */}
      <div className="mb-6 px-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">System Preferences</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage workspace configuration, access controls, and integration protocols.
        </p>
      </div>

      {/* Main Unified Interface Container - Elegant White & Navy Foundation */}
      <div className="flex flex-col md:flex-row flex-1 bg-white border border-slate-200/80 rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0 bg-[#FAFAFA] border-r border-slate-100 flex flex-col justify-between z-10">
          <div className="p-4 space-y-1">
            <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-3 px-3">
              Configuration
            </div>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                    isActive 
                      ? "bg-blue-50/60 text-blue-700 font-semibold relative after:absolute after:left-0 after:top-1/2 after:-translate-y-1/2 after:h-1/2 after:w-1 after:bg-blue-600 after:rounded-r-full shadow-sm" 
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Support Widget */}
          <div className="p-4 m-4 rounded-lg bg-slate-50 border border-slate-100 shadow-inner">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Need Assistance?</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
              Our engineering team is available for architectural support.
            </p>
            <a 
              href="mailto:support@arcli.tech" 
              className="flex items-center justify-center gap-2 w-full py-1.5 px-2 bg-white border border-slate-200 rounded text-xs font-medium text-slate-700 hover:text-blue-600 hover:border-blue-200 transition-colors shadow-sm"
            >
              <Mail className="h-3 w-3" /> support@arcli.tech
            </a>
          </div>
        </aside>

        {/* Dynamic Content Area */}
        <main className="flex-1 flex flex-col relative bg-gradient-to-b from-white to-slate-50/30 overflow-hidden">
          
          {/* --- PROFILE TAB --- */}
          {activeTab === "profile" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="px-8 py-6 border-b border-slate-100 bg-white">
                <h2 className="text-lg font-semibold text-slate-900">Identity & Profile</h2>
                <p className="text-sm text-slate-500 mt-1">Configure your personal identity within the workspace.</p>
              </div>
              
              <div className="p-8 flex-1 overflow-y-auto space-y-8">
                
                {/* Visual Avatar Identifier */}
                <div className="flex items-center gap-5">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white text-lg font-semibold shadow-md ring-4 ring-blue-50/50">
                    {getInitials(fullName || email)}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{initialFullName || "System User"}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{email}</p>
                  </div>
                </div>

                {/* Editable State */}
                <div className="max-w-md space-y-3">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="fullName" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                      Full Name
                    </Label>
                    {hasProfileChanges && <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Unsaved</span>}
                  </div>
                  <Input 
                    id="fullName" 
                    placeholder="Enter your name" 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)} 
                    className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all h-10 shadow-sm"
                  />
                </div>
                
                {/* Read-Only State */}
                <div className="max-w-md space-y-3">
                  <Label htmlFor="email" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                    Email Address
                  </Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={email} 
                    disabled 
                    className="bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed h-10 shadow-inner"
                  />
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    Managed securely via identity provider
                  </div>
                </div>
              </div>

              <div className="px-8 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] font-medium text-slate-500">
                  Changes apply immediately across the Arcli analytical engine.
                </p>
                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isSaving || !hasProfileChanges}
                  className="bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-all active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:active:scale-100"
                >
                  {isSaving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Save Identity Configuration
                </Button>
              </div>
            </div>
          )}

          {/* --- SECURITY TAB --- */}
          {activeTab === "security" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="px-8 py-6 border-b border-slate-100 bg-white">
                <h2 className="text-lg font-semibold text-slate-900">Access & Security</h2>
                <p className="text-sm text-slate-500 mt-1">Manage cryptographic keys and session parameters.</p>
              </div>
              
              <div className="p-8 flex-1 overflow-y-auto space-y-8">
                <div className="max-w-md space-y-6">
                  
                  {/* Current Password with Visibility Toggle */}
                  <div className="space-y-3 relative">
                    <Label htmlFor="current-password" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                      Current Password
                    </Label>
                    <div className="relative">
                      <Input 
                        id="current-password" 
                        type={showCurrentPassword ? "text" : "password"} 
                        className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-10 shadow-sm pr-10" 
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

                  {/* New Password with Visibility Toggle */}
                  <div className="space-y-3 relative">
                    <Label htmlFor="new-password" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                      New Password
                    </Label>
                    <div className="relative">
                      <Input 
                        id="new-password" 
                        type={showNewPassword ? "text" : "password"} 
                        className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-10 shadow-sm pr-10" 
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

              <div className="px-8 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                  Updating credentials will terminate all active sessions.
                </p>
                <Button className="bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-all active:scale-[0.98]">
                  Update Credentials
                </Button>
              </div>
            </div>
          )}

          {/* --- NOTIFICATIONS TAB --- */}
          {activeTab === "notifications" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="px-8 py-6 border-b border-slate-100 bg-white">
                <h2 className="text-lg font-semibold text-slate-900">Engine Alerts</h2>
                <p className="text-sm text-slate-500 mt-1">Define routing logic for system-generated insights.</p>
              </div>
              
              <div className="p-8 flex-1 overflow-y-auto space-y-4">
                
                {/* Setting Row 1 */}
                <div className={`flex items-start justify-between p-5 border bg-white rounded-lg transition-all duration-200 ${notifyAnomalies ? 'border-rose-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="space-y-1.5 max-w-[80%]">
                    <Label className="text-sm font-semibold text-slate-900 flex items-center gap-2 cursor-pointer" onClick={() => setNotifyAnomalies(!notifyAnomalies)}>
                      <AlertCircle className={`h-4 w-4 ${notifyAnomalies ? 'text-rose-500' : 'text-slate-400'}`} />
                      Critical Anomaly Routing
                    </Label>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Dispatch immediate email payloads when the autonomous engine detects high-variance metric shifts (e.g., sudden churn spikes).
                    </p>
                  </div>
                  <Switch checked={notifyAnomalies} onCheckedChange={setNotifyAnomalies} className="data-[state=checked]:bg-rose-500" />
                </div>

                {/* Setting Row 2 */}
                <div className={`flex items-start justify-between p-5 border bg-white rounded-lg transition-all duration-200 ${notifyWeekly ? 'border-blue-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="space-y-1.5 max-w-[80%]">
                    <Label className="text-sm font-semibold text-slate-900 flex items-center gap-2 cursor-pointer" onClick={() => setNotifyWeekly(!notifyWeekly)}>
                      <Activity className={`h-4 w-4 ${notifyWeekly ? 'text-blue-600' : 'text-slate-400'}`} />
                      Executive Digest Pipeline
                    </Label>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Compile and transmit a summarized narrative report of your entire workspace state every Monday at 08:00 UTC.
                    </p>
                  </div>
                  <Switch checked={notifyWeekly} onCheckedChange={setNotifyWeekly} className="data-[state=checked]:bg-blue-600" />
                </div>

              </div>
            </div>
          )}

          {/* --- DEVELOPER TAB --- */}
          {activeTab === "developer" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="px-8 py-6 border-b border-slate-100 bg-white flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">API & Webhooks</h2>
                  <p className="text-sm text-slate-500 mt-1">Manage programmatic access and external integrations.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200 shadow-sm">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  API Active
                </div>
              </div>
              
              <div className="p-8 flex-1 overflow-y-auto space-y-8">
                
                {/* API Key Block - Strict Monospace typography for tech data */}
                <div className="space-y-4">
                  <Label className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                    Production Token
                  </Label>
                  <div className="p-5 border border-slate-200 bg-slate-50/80 rounded-lg space-y-4 shadow-inner">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input 
                          readOnly 
                          value={apiKey} 
                          type={showApiKey ? "text" : "password"}
                          className="font-mono text-sm tracking-widest bg-white border-slate-200 text-slate-800 h-11 shadow-sm pr-12 w-full" 
                        />
                        <button 
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 rounded uppercase tracking-wider transition-colors"
                        >
                          {showApiKey ? "Hide" : "Reveal"}
                        </button>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => copyToClipboard(apiKey)} 
                        className={`h-11 px-4 border-slate-200 shadow-sm transition-all duration-300 ${hasCopiedKey ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-600 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200'}`}
                      >
                        {hasCopiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium">
                      <span className="text-slate-500">
                        Last requested: <span className="text-slate-900 font-mono">14 mins ago</span>
                      </span>
                      <span className="text-slate-500">
                        IP: <span className="text-slate-900 font-mono">192.168.1.1</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs font-semibold px-3 h-8 transition-colors">
                      Revoke & Regenerate Key
                    </Button>
                  </div>
                </div>

                {/* Webhook Notice */}
                <div className="mt-8 p-6 rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50/50 to-transparent flex items-start gap-4">
                  <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-blue-100 shadow-sm">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Webhook Architecture</h4>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
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