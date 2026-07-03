import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ApiKeySummary, TenantSettingsSnapshotRow } from "@/lib/settings/types";

export const SETTINGS_SELECT =
  "tenant_id, company_name, sender_email, reply_to_email, stripe_account_id, email_provider_status, key_last_updated, updated_at";

export async function fetchTenantSettingsRow(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<{ data: TenantSettingsSnapshotRow | null; error: any }> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select(SETTINGS_SELECT) // 🚨 FIX: Removed the invalid generic from here
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    data: data as TenantSettingsSnapshotRow | null, // Cast the resolved data payload instead
    error,
  };
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