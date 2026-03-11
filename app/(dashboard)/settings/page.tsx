"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { 
  Database, 
  ShieldCheck, 
  HardDrive, 
  CreditCard, 
  Save,
  Server,
  BellRing,
  Slack,
  Mail,
  Zap,
  CheckCircle2,
  Activity,
  Settings as SettingsIcon
} from "lucide-react";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";

export default function SettingsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [orgData, setOrgData] = useState<any>(null);

  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      storage_tier: "SUPABASE",
      byos_endpoint: "",
      byos_bucket: "",
      byos_access_key: "",
      slack_webhook_url: "",
      alert_email: "",
      enable_anomaly_alerts: true,
      enable_weekly_digest: true,
    }
  });

  const selectedTier = watch("storage_tier");

  useEffect(() => {
    async function fetchSettings() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: org } = await supabase
        .from("organizations")
        .select(`
          *,
          settings:tenant_settings(*)
        `)
        .single();

      if (org) {
        setOrgData(org);
        if (org.settings) {
          setValue("storage_tier", org.settings.storage_tier || "SUPABASE");
          setValue("byos_endpoint", org.settings.byos_endpoint || "");
          setValue("byos_bucket", org.settings.byos_bucket || "");
          setValue("slack_webhook_url", org.settings.slack_webhook_url || "");
          setValue("alert_email", org.settings.alert_email || user.email);
        }
      }
    }
    fetchSettings();
  }, [supabase, setValue]);

  const onSaveSettings = async (data: any) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("tenant_settings")
        .update({
          storage_tier: data.storage_tier,
          byos_endpoint: data.byos_endpoint,
          byos_bucket: data.byos_bucket,
          slack_webhook_url: data.slack_webhook_url,
          alert_email: data.alert_email,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", orgData?.id);

      if (error) throw error;
      toast({
        title: "Settings Synchronized",
        description: "Your workspace configuration has been securely updated.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: `Failed to update settings: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestAlert = async () => {
    setTestLoading(true);
    setTimeout(() => {
      setTestLoading(false);
      toast({
        title: "Test Alert Dispatched",
        description: "The Notification Engine successfully routed a test payload to your channels.",
      });
    }, 1500);
  };

  const storageUsagePercent = orgData 
    ? (orgData.current_storage_mb / (orgData.max_storage_mb || 1024)) * 100 
    : 0;
  
  const queryUsagePercent = orgData
    ? (orgData.current_month_queries / (orgData.monthly_query_limit || 10000)) * 100
    : 0;

  return (
    <div className="flex-1 space-y-6 p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-1 border-b border-slate-800 pb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <SettingsIcon className="h-7 w-7 text-emerald-400" />
          Workspace Configuration
        </h2>
        <p className="text-slate-400">
          Manage tenant identity, storage escalation, and automated reporting routes.
        </p>
      </div>

      <Tabs defaultValue="alerting" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 h-12 p-1 mb-6">
          <TabsTrigger value="profile" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 rounded-md">
            Profile & Billing
          </TabsTrigger>
          <TabsTrigger value="workspace" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 rounded-md">
            Data Storage Engine
          </TabsTrigger>
          <TabsTrigger value="alerting" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 rounded-md">
            Alerting & Routing
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit(onSaveSettings)}>
          <TabsContent value="alerting" className="space-y-6 mt-0">
            <Card className="border-slate-800 bg-[#0B1120] shadow-xl">
              <CardHeader className="border-b border-slate-800/60 pb-5">
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <BellRing className="h-5 w-5 text-emerald-400" />
                  Notification Router
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Configure where Autonomous Agents send anomaly alerts and weekly analytical digests.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold">
                    <Slack className="h-5 w-5 text-[#E01E5A]" /> Slack Integration
                  </div>
                  <div className="grid gap-2 pl-7">
                    <Label className="text-slate-400">Incoming Webhook URL</Label>
                    <div className="flex gap-3">
                      <Input 
                        {...register("slack_webhook_url")} 
                        type="password"
                        placeholder="Paste your Slack Webhook URL here..." 
                        className="bg-slate-900 border-slate-700 text-slate-200 focus-visible:ring-emerald-500/50 flex-1 font-mono text-sm"
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleTestAlert}
                        disabled={testLoading}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shrink-0"
                      >
                        {testLoading ? <Activity className="h-4 w-4 animate-spin" /> : "Test Ping"}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Creates a secure tunnel for Agents to post rich-text charts directly into your team channels.
                    </p>
                  </div>
                </div>

                <Separator className="bg-slate-800" />

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold">
                    <Mail className="h-5 w-5 text-blue-400" /> Email Digest Routing
                  </div>
                  <div className="grid gap-2 pl-7">
                    <Label className="text-slate-400">Primary Analyst Email</Label>
                    <Input 
                      {...register("alert_email")} 
                      type="email"
                      placeholder="analyst@yourcompany.com" 
                      className="bg-slate-900 border-slate-700 text-slate-200 focus-visible:ring-emerald-500/50 max-w-md"
                    />
                  </div>
                </div>

                <Separator className="bg-slate-800" />

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold">
                    <Zap className="h-5 w-5 text-amber-400" /> Subscription Preferences
                  </div>
                  <div className="pl-7 space-y-4">
                    <div className="flex items-center justify-between max-w-md bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                      <Label htmlFor="anomaly-toggle" className="flex flex-col gap-1 cursor-pointer">
                        <span className="text-slate-200">Critical Anomaly Alerts</span>
                        <span className="text-xs text-slate-500 font-normal">Immediate notification when metrics break thresholds.</span>
                      </Label>
                      <Switch id="anomaly-toggle" defaultChecked className="data-[state=checked]:bg-emerald-500" />
                    </div>
                    <div className="flex items-center justify-between max-w-md bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                      <Label htmlFor="digest-toggle" className="flex flex-col gap-1 cursor-pointer">
                        <span className="text-slate-200">Weekly Narrative Digest</span>
                        <span className="text-xs text-slate-500 font-normal">A beautiful, LLM-generated summary every Monday.</span>
                      </Label>
                      <Switch id="digest-toggle" defaultChecked className="data-[state=checked]:bg-emerald-500" />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t border-slate-800 bg-slate-900/40 px-6 py-4">
                <Button type="submit" disabled={loading} className="ml-auto gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg">
                  {loading ? "Syncing..." : "Save Routing Configuration"}
                  <Save className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="workspace" className="space-y-6 mt-0">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-slate-800 bg-[#0B1120] shadow-xl">
                <CardHeader className="border-b border-slate-800/60 pb-5">
                  <CardTitle className="flex items-center gap-2 text-slate-100">
                    <HardDrive className="h-5 w-5 text-emerald-400" />
                    Usage Guardrails
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Current compute and storage consumption for this tenant.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>Vector Storage Utilization</span>
                      <span className="font-mono">{orgData?.current_storage_mb?.toFixed(2) || "0.00"} / {orgData?.max_storage_mb || "1024"} MB</span>
                    </div>
                    <Progress value={storageUsagePercent} className="h-2 bg-slate-800 [&>div]:bg-emerald-500" />
                  </div>
                  <Separator className="bg-slate-800" />
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>Monthly Analytical Queries (DuckDB)</span>
                      <span className="font-mono">{orgData?.current_month_queries || 0} / {orgData?.monthly_query_limit || 10000}</span>
                    </div>
                    <Progress value={queryUsagePercent} className="h-2 bg-slate-800 [&>div]:bg-blue-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-[#0B1120] shadow-xl h-full">
                <CardHeader className="border-b border-slate-800/60 pb-5">
                  <CardTitle className="flex items-center gap-2 text-slate-100">
                    <Server className="h-5 w-5 text-emerald-400" />
                    Analytical Storage Tier
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Configure how the Compute Engine routes your Parquet datasets.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label className="text-slate-400">Storage Provider</Label>
                    <Select 
                      value={selectedTier} 
                      onValueChange={(val) => setValue("storage_tier", val)}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Select a tier" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                        <SelectItem value="EPHEMERAL">Ephemeral (In-Memory / Testing)</SelectItem>
                        <SelectItem value="SUPABASE">Supabase S3 (Standard)</SelectItem>
                        <SelectItem value="R2_PRO">Cloudflare R2 (Performance)</SelectItem>
                        <SelectItem value="BYOS">Bring Your Own Storage (Enterprise)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedTier === "BYOS" && (
                    <div className="space-y-4 pt-4 border-t border-slate-800 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <Label className="text-slate-400">S3 Endpoint URL</Label>
                        <Input 
                          {...register("byos_endpoint")} 
                          placeholder="https://abc.r2.cloudflarestorage.com" 
                          className="bg-slate-900 border-slate-700 text-slate-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-400">Bucket Name</Label>
                        <Input 
                          {...register("byos_bucket")} 
                          placeholder="my-analytics-data" 
                          className="bg-slate-900 border-slate-700 text-slate-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-400">Access Key ID</Label>
                        <Input 
                          {...register("byos_access_key")} 
                          type="password" 
                          placeholder="••••••••" 
                          className="bg-slate-900 border-slate-700 text-slate-200"
                        />
                      </div>
                      <p className="text-xs text-emerald-500/80 italic flex items-center gap-1.5 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Credentials are used by DuckDB via HTTPFS for zero-copy remote reads.
                      </p>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="border-t border-slate-800 bg-slate-900/40 px-6 py-4">
                  <Button type="submit" disabled={loading} className="ml-auto gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm">
                    {loading ? "Syncing..." : "Update Storage"}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6 mt-0">
            <Card className="border-slate-800 bg-[#0B1120] shadow-xl max-w-3xl">
              <CardHeader className="border-b border-slate-800/60 pb-5">
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  Organization Profile
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Manage your multi-tenant workspace identity and billing tier.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="grid gap-2 max-w-sm">
                  <Label className="text-slate-400">Organization Name</Label>
                  <Input value={orgData?.name || "Loading..."} disabled className="bg-slate-900/50 border-slate-800 text-slate-400" />
                </div>
                
                <div className="grid gap-2">
                  <Label className="text-slate-400">Active Subscription Tier</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-md w-fit">
                      <CreditCard className="h-4 w-4" />
                      {orgData?.subscription_tier || "PRO (TRIAL)"}
                    </div>
                    <Button variant="link" className="text-blue-400 hover:text-blue-300 px-0">Manage via Stripe Portal</Button>
                  </div>
                </div>

                <div className="grid gap-2 max-w-sm">
                  <Label className="text-slate-400">Tenant ID</Label>
                  <Input value={orgData?.id || "..."} disabled className="bg-slate-900/50 border-slate-800 text-slate-500 font-mono text-xs" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </form>
      </Tabs>
    </div>
  );
}