"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { 
  Database, 
  ShieldCheck, 
  HardDrive, 
  CreditCard, 
  Save,
  Server
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
import { createClient } from "@/utils/supabase/client";

export default function SettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [orgData, setOrgData] = useState<any>(null);

  // Initialize form with multi-tenant storage tier options from models.py
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      storage_tier: "SUPABASE",
      byos_endpoint: "",
      byos_bucket: "",
      byos_access_key: "",
    }
  });

  const selectedTier = watch("storage_tier");

  useEffect(() => {
    async function fetchSettings() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch organization and settings (TenantAwareMixin implementation)
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
          setValue("storage_tier", org.settings.storage_tier);
          setValue("byos_endpoint", org.settings.byos_endpoint || "");
          setValue("byos_bucket", org.settings.byos_bucket || "");
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
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", orgData.id);

      if (error) throw error;
      toast.success("Settings synchronized successfully.");
    } catch (err: any) {
      toast.error(`Failed to update settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const storageUsagePercent = orgData 
    ? (orgData.current_storage_mb / orgData.max_storage_mb) * 100 
    : 0;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Workspace Settings</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* --- Section 1: Organization & Usage --- */}
        <div className="col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Organization Profile
              </CardTitle>
              <CardDescription>
                Manage your multi-tenant workspace identity and billing tier.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input value={orgData?.name || ""} disabled />
              </div>
              <div className="space-y-2">
                <Label>Subscription Tier</Label>
                <div className="flex items-center gap-2 font-semibold text-primary">
                  <CreditCard className="h-4 w-4" />
                  {orgData?.subscription_tier || "FREE"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-primary" />
                Usage Guardrails
              </CardTitle>
              <CardDescription>
                Current compute and storage consumption for this tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Storage Utilization</span>
                  <span>{orgData?.current_storage_mb.toFixed(2)} / {orgData?.max_storage_mb} MB</span>
                </div>
                <Progress value={storageUsagePercent} className="h-2" />
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Monthly Analytical Queries</span>
                  <span>{orgData?.current_month_queries} / {orgData?.monthly_query_limit}</span>
                </div>
                <Progress 
                  value={(orgData?.current_month_queries / orgData?.monthly_query_limit) * 100} 
                  className="h-2" 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* --- Section 2: Storage Escalation (Phase 4 Logic) --- */}
        <div className="col-span-4">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Analytical Storage Tier
              </CardTitle>
              <CardDescription>
                Configure how the Compute Engine routes your Parquet datasets.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSaveSettings)}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Storage Provider</Label>
                  <Select 
                    value={selectedTier} 
                    onValueChange={(val) => setValue("storage_tier", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EPHEMERAL">Ephemeral (In-Memory / Testing)</SelectItem>
                      <SelectItem value="SUPABASE">Supabase S3 (Standard)</SelectItem>
                      <SelectItem value="R2_PRO">Cloudflare R2 (Performance)</SelectItem>
                      <SelectItem value="BYOS">Bring Your Own Storage (Enterprise)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedTier === "BYOS" && (
                  <div className="space-y-4 pt-4 border-t animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-2">
                      <Label>S3 Endpoint URL</Label>
                      <Input 
                        {...register("byos_endpoint")} 
                        placeholder="https://abc.r2.cloudflarestorage.com" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bucket Name</Label>
                      <Input 
                        {...register("byos_bucket")} 
                        placeholder="my-analytics-data" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Access Key ID</Label>
                        <Input 
                          {...register("byos_access_key")} 
                          type="password" 
                          placeholder="••••••••" 
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Note: Credentials are used by DuckDB via HTTPFS for zero-copy reads.
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t bg-muted/50 px-6 py-4">
                <Button type="submit" disabled={loading} className="ml-auto gap-2">
                  {loading ? "Syncing..." : "Save Configuration"}
                  <Save className="h-4 w-4" />
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}