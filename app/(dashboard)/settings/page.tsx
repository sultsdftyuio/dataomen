// app/(dashboard)/settings/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import SettingsClient from "./settings-client";
import { formatDistanceToNow } from "date-fns";

export default async function SettingsPage({ 
  searchParams 
}: { 
  searchParams: { recovery?: string } 
}) {
  // 1. Deterministic Server Auth Fetch
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // 2. Fetch Tenant Settings Directly (Bypassing API route overhead)
  const tenantResult = await resolveTenantContext();
  
  let settings = { 
    notifyAnomalies: true, 
    notifyWeekly: true, 
    apiKey: "No active key", 
    keyLastUpdated: "Never" 
  };

  if (!("response" in tenantResult)) {
    const { supabase: tenantSupabase, tenantId } = tenantResult.context;
    const { data } = await tenantSupabase
      .from("tenant_settings")
      .select("notify_anomalies, notify_weekly, api_key, key_last_updated")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (data) {
      settings = {
        notifyAnomalies: data.notify_anomalies ?? true,
        notifyWeekly: data.notify_weekly ?? true,
        apiKey: data.api_key || "No active key",
        keyLastUpdated: data.key_last_updated 
          ? formatDistanceToNow(new Date(data.key_last_updated), { addSuffix: true }) 
          : "Never",
      };
    }
  }

  const isRecoveryMode = searchParams.recovery === "1";

  // 3. Pass clean, deterministic state to the Client
  return (
    <SettingsClient 
      user={user} 
      initialSettings={settings} 
      isRecoveryMode={isRecoveryMode} 
    />
  );
}