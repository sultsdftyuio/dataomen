import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ApiKeySummary, TenantSettingsSnapshotRow } from "@/lib/settings/types";

export const SETTINGS_SELECT =
  "tenant_id, company_name, reply_to_email, timezone, stripe_account_id, email_provider_status, notify_anomalies, notify_weekly, key_last_updated, updated_at";

export function fetchTenantSettingsRow(supabase: SupabaseClient<Database>, tenantId: string) {
  return supabase
    .from("tenant_settings")
    .select<TenantSettingsSnapshotRow>(SETTINGS_SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle();
}

export async function fetchTenantApiKeySummary(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<{ data: ApiKeySummary | null; error: unknown | null }> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("key_last4, created_at")
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { data: null, error };
  }

  return {
    data: {
      keyLast4: data.key_last4 ?? null,
      keyLastUpdated: data.created_at ?? null,
    },
    error: null,
  };
}
