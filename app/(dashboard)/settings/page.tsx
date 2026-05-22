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

  // 2. Resolve Tenant Context
  const tenantResult = await resolveTenantContext();
  
  // 3. Define the new structured state for the Recovery Engine
  let settings = { 
    workspace: {
      companyName: "",
      replyToEmail: "",
      timezone: "UTC",
    },
    integrations: {
      stripeConnected: false,
      emailProviderStatus: false,
      apiKey: "No active key",
      keyLastUpdated: "Never"
    },
    routing: {
      notifyAnomalies: true, 
      notifyWeekly: true, 
    }
  };

  if (!("response" in tenantResult)) {
    const { supabase: tenantSupabase, tenantId } = tenantResult.context;
    
    // Fetch the updated schema fields. 
    // Note: You will need to add these columns to `tenant_settings` in Supabase.
    const { data, error } = await tenantSupabase
      .from("tenant_settings")
      .select(`
        company_name, 
        reply_to_email, 
        timezone, 
        stripe_account_id, 
        email_provider_status, 
        notify_anomalies, 
        notify_weekly, 
        api_key, 
        key_last_updated
      `)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (data && !error) {
      settings = {
        workspace: {
          companyName: data.company_name || "",
          replyToEmail: data.reply_to_email || "",
          timezone: data.timezone || "UTC",
        },
        integrations: {
          // Abstracting raw IDs into deterministic boolean statuses for the client
          stripeConnected: !!data.stripe_account_id,
          emailProviderStatus: !!data.email_provider_status,
          apiKey: data.api_key || "No active key",
          keyLastUpdated: data.key_last_updated 
            ? formatDistanceToNow(new Date(data.key_last_updated), { addSuffix: true }) 
            : "Never",
        },
        routing: {
          notifyAnomalies: data.notify_anomalies ?? true,
          notifyWeekly: data.notify_weekly ?? true,
        }
      };
    }
  }

  const isRecoveryMode = searchParams.recovery === "1";

  // 4. Pass clean, safely abstracted state to the Client
  return (
    <SettingsClient 
      user={user} 
      initialSettings={settings} 
      isRecoveryMode={isRecoveryMode} 
    />
  );
}