"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { 
  ShieldCheck, 
  HardDrive, 
  CreditCard, 
  Save,
  Server,
  Building2,
  Key,
  Lock,
  Activity,
  Zap
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/utils/supabase/client";

export default function SettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgData, setOrgData] = useState<any>(null);

  const { register, handleSubmit, setValue } = useForm({
    defaultValues: {
      byos_endpoint: "",
      byos_bucket: "",
      byos_access_key: "",
    }
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch organization and settings
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
          setValue("byos_endpoint", org.settings.byos_endpoint || "");
          setValue("byos_bucket", org.settings.byos_bucket || "");
        }
      }
      setLoading(false);
    }
    fetchSettings();
  }, [supabase, setValue]);

  const onSaveSettings = async (data: any) => {
    if (subscriptionTier !== "ENTERPRISE") return; // Security check

    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenant_settings")
        .update({
          byos_endpoint: data.byos_endpoint,
          byos_bucket: data.byos_bucket,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", orgData.id);

      if (error) throw error;
      toast.success("Enterprise infrastructure settings synchronized.");
    } catch (err: any) {
      toast.error(`Failed to update settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived Data Logic ──
  const subscriptionTier = orgData?.subscription_tier?.toUpperCase() || "FREE";
  
  let storageProvider = "Supabase S3 (Standard)";
  let storageBadgeColor = "bg-slate-100 text-slate-700 border-slate-200";
  
  if (subscriptionTier === "PRO") {
    storageProvider = "Cloudflare R2 (High Performance)";
    storageBadgeColor = "bg-blue-50 text-blue-700 border-blue-200";
  } else if (subscriptionTier === "ENTERPRISE") {
    storageProvider = "Bring Your Own Storage (BYOS)";
    storageBadgeColor = "bg-purple-50 text-purple-700 border-purple-200";
  }

  const storageUsagePercent = orgData 
    ? Math.min((orgData.current_storage_mb / orgData.max_storage_mb) * 100, 100) 
    : 0;

  const queryUsagePercent = orgData 
    ? Math.min((orgData.current_month_queries / orgData.monthly_query_limit) * 100, 100)
    : 0;

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-8 pt-10 max-w-6xl mx-auto w-full">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-3 space-y-6">
            <Skeleton className="h-[300px] w-full rounded-2xl" />
            <Skeleton className="h-[300px] w-full rounded-2xl" />
          </div>
          <div className="col-span-4 space-y-6">
            <Skeleton className="h-[400px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full container mx-auto p-6 md:p-10 max-w-7xl animate-in fade-in duration-500">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col gap-2 mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Workspace Settings</h1>
        <p className="text-muted-foreground text-base">
          Manage your organization profile, view usage guardrails, and configure infrastructure.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-7">
        
        {/* ── LEFT COLUMN: IDENTITY & USAGE ── */}
        <div className="col-span-3 space-y-8">
          
          <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/20 border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                Organization Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Workspace Name</Label>
                <Input value={orgData?.name || "My Organization"} disabled className="bg-muted/50 font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Workspace ID</Label>
                <div className="flex gap-2">
                  <Input value={orgData?.id || "org_xyz123"} disabled className="bg-muted/50 font-mono text-xs" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => toast.success("ID Copied")}>
                    <Key className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div className="pt-2">
                <Label className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 block">Current Plan</Label>
                <div className="flex items-center justify-between border border-border rounded-xl p-3 bg-background">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-bold tracking-tight">{subscriptionTier} TIER</span>
                  </div>
                  {subscriptionTier === "FREE" && (
                    <Button size="sm" variant="secondary" className="h-7 text-xs bg-primary/10 text-primary hover:bg-primary/20">Upgrade</Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/20 border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-primary" />
                Usage Guardrails
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">Storage Utilization</span>
                    <span className="text-xs text-muted-foreground">Vector embeddings & uploaded files</span>
                  </div>
                  <span className="text-sm font-mono font-medium">{orgData?.current_storage_mb?.toFixed(1) || 0} / {orgData?.max_storage_mb || 500} MB</span>
                </div>
                <Progress value={storageUsagePercent} className="h-2 bg-muted" />
              </div>
              
              <Separator className="bg-border" />
              
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">Analytical Queries</span>
                    <span className="text-xs text-muted-foreground">Monthly LLM-to-SQL executions</span>
                  </div>
                  <span className="text-sm font-mono font-medium">{orgData?.current_month_queries || 0} / {orgData?.monthly_query_limit || 1000}</span>
                </div>
                <Progress value={queryUsagePercent} className={`h-2 bg-muted ${queryUsagePercent > 80 ? '[&>div]:bg-amber-500' : ''}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT COLUMN: INFRASTRUCTURE & ADVANCED ── */}
        <div className="col-span-4 space-y-8">
          
          <Card className="rounded-2xl border-border shadow-sm overflow-hidden flex flex-col h-full">
            <CardHeader className="bg-muted/20 border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-5 w-5 text-primary" />
                Data Infrastructure
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Your compute and storage routing is automatically optimized based on your subscription tier.
              </CardDescription>
            </CardHeader>
            
            <div className="flex-1 p-6 space-y-8">
              
              {/* Dynamic Badge Display */}
              <div className="space-y-3">
                <Label className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Active Storage Backend</Label>
                <div className={`flex items-center gap-3 p-4 rounded-xl border ${storageBadgeColor} bg-opacity-50`}>
                  <HardDrive className="h-5 w-5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{storageProvider}</span>
                    <span className="text-xs opacity-80 mt-0.5">Assigned via {subscriptionTier} subscription</span>
                  </div>
                  <div className="ml-auto">
                    <Badge variant="outline" className="bg-background/50 backdrop-blur-sm">Active</Badge>
                  </div>
                </div>
              </div>

              <Separator className="bg-border" />

              {/* Conditional Enterprise BYOS Form */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Bring Your Own Storage (BYOS)</Label>
                  {subscriptionTier !== "ENTERPRISE" && (
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-widest"><Lock className="w-3 h-3 mr-1" /> Enterprise</Badge>
                  )}
                </div>

                {subscriptionTier === "ENTERPRISE" ? (
                  <form onSubmit={handleSubmit(onSaveSettings)} className="space-y-5 animate-in fade-in">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">S3 Endpoint URL</Label>
                        <Input {...register("byos_endpoint")} placeholder="https://s3.amazonaws.com/..." className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Bucket Name</Label>
                        <Input {...register("byos_bucket")} placeholder="my-analytics-data" className="bg-muted/30" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Access Key ID</Label>
                      <Input type="password" placeholder="••••••••••••••••••••••••" className="bg-muted/30 font-mono" />
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button type="submit" disabled={saving} className="rounded-full px-6">
                        {saving ? "Syncing Config..." : "Save Infrastructure Settings"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-xl bg-muted/10 text-center">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                      <Zap className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h4 className="font-semibold text-foreground text-sm">Enterprise Data Control</h4>
                    <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm">
                      Upgrade to Enterprise to route all analytical datasets to your own AWS S3 or Cloudflare R2 buckets for strict data governance.
                    </p>
                    <Button variant="outline" className="h-8 text-xs bg-background shadow-sm">Contact Sales</Button>
                  </div>
                )}
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}