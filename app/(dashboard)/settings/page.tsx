// app/(dashboard)/settings/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { 
  User, 
  Lock, 
  Bell, 
  Key, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  RefreshCw,
  Laptop
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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

  // Notification Preferences State
  const [notifyAnomalies, setNotifyAnomalies] = useState(true);
  const [notifyWeekly, setNotifyWeekly] = useState(true);
  
  // Developer State
  const [apiKey, setApiKey] = useState("do_live_xxxxxxxxxxxxxxxxxxxxxxxxxx");

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user) {
          setEmail(user.email || "");
          setFullName(user.user_metadata?.full_name || "");
        }
      } catch (error) {
        console.error("Failed to load user:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [supabase.auth]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });
      if (error) throw error;
      toast({ title: "Profile updated", description: "Your personal information has been saved." });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: "API key copied securely." });
  };

  const TABS = [
    { id: "profile", label: "Personal Info", icon: User },
    { id: "security", label: "Security", icon: Lock },
    { id: "notifications", label: "AI Alerts", icon: Bell },
    { id: "developer", label: "Developer", icon: Key },
  ] as const;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 h-full p-6 animate-in fade-in">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex flex-col md:flex-row gap-8">
          <Skeleton className="w-full md:w-64 h-[300px] rounded-xl" />
          <Skeleton className="flex-1 h-[500px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 h-full max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your personal preferences, security, and developer integrations.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        
        {/* Settings Navigation Sidebar */}
        <aside className="w-full md:w-64 shrink-0 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                {tab.label}
              </button>
            );
          })}
        </aside>

        {/* Settings Content Area */}
        <div className="flex-1 w-full space-y-6">
          
          {/* --- PROFILE TAB --- */}
          {activeTab === "profile" && (
            <Card className="border-border shadow-sm bg-background/50 backdrop-blur-md">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your name and email address.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input 
                    id="fullName" 
                    placeholder="John Doe" 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)} 
                    className="max-w-md bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={email} 
                    disabled 
                    className="max-w-md bg-muted/50 text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                    <ShieldCheck className="h-3 w-3" /> Email is managed by your identity provider.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/20 px-6 py-4">
                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isSaving}
                  className="shadow-sm transition-transform active:scale-95"
                >
                  {isSaving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* --- SECURITY TAB --- */}
          {activeTab === "security" && (
            <Card className="border-border shadow-sm bg-background/50 backdrop-blur-md">
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage your password and authentication settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input id="current-password" type="password" className="bg-background" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input id="new-password" type="password" className="bg-background" />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/20 px-6 py-4 flex justify-between items-center">
                <p className="text-xs text-muted-foreground">You will be logged out of other devices.</p>
                <Button variant="default">Update Password</Button>
              </CardFooter>
            </Card>
          )}

          {/* --- NOTIFICATIONS TAB --- */}
          {activeTab === "notifications" && (
            <Card className="border-border shadow-sm bg-background/50 backdrop-blur-md">
              <CardHeader>
                <CardTitle>AI Alert Preferences</CardTitle>
                <CardDescription>Control how the autonomous engine contacts you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-xl bg-background/50">
                  <div className="space-y-0.5 max-w-[70%]">
                    <Label className="text-sm font-bold flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-rose-500" />
                      Critical Anomalies
                    </Label>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                      Receive immediate emails when the AI engine detects high-impact metric drops or spikes (e.g., sudden churn).
                    </p>
                  </div>
                  <Switch 
                    checked={notifyAnomalies} 
                    onCheckedChange={setNotifyAnomalies} 
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-xl bg-background/50">
                  <div className="space-y-0.5 max-w-[70%]">
                    <Label className="text-sm font-bold flex items-center gap-2">
                      <Laptop className="h-4 w-4 text-blue-500" />
                      Weekly Executive Digest
                    </Label>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                      A summarized narrative report of your entire workspace sent every Monday morning.
                    </p>
                  </div>
                  <Switch 
                    checked={notifyWeekly} 
                    onCheckedChange={setNotifyWeekly} 
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* --- DEVELOPER TAB --- */}
          {activeTab === "developer" && (
            <div className="space-y-6">
              <Card className="border-border shadow-sm bg-background/50 backdrop-blur-md">
                <CardHeader>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Use these keys to authenticate via the external API and push datasets programmatically.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="p-4 bg-muted/30 border border-muted rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="font-bold text-sm text-foreground">Production Key</Label>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input 
                        readOnly 
                        value={apiKey} 
                        type="password"
                        className="font-mono text-xs bg-background" 
                      />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(apiKey)} className="shrink-0">
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Last used: 2 hours ago from <span className="font-mono text-foreground">192.168.1.1</span>
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="border-t bg-muted/20 px-6 py-4">
                  <Button variant="destructive" size="sm" className="bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white border-0 shadow-none">
                    Revoke & Roll Key
                  </Button>
                </CardFooter>
              </Card>

              <Card className="border-border shadow-sm bg-background/50 backdrop-blur-md border-dashed">
                <CardContent className="p-6 text-center space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-500" />
                  </div>
                  <h3 className="font-bold text-sm">Need a webhook?</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    DataOmen supports outbound webhooks for real-time alerts. Setup is available in the specific Agent configuration.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}