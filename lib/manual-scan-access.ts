import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

const OPERATOR_EMAILS_ENV = "ARCLI_MANUAL_SCAN_OPERATOR_EMAILS";

/**
 * On-demand website scans are an operator tool, not a customer feature: the
 * prospect desk deliberately sends customers to targeting instead, and every
 * scan spends the tenant's monthly discovery budget. Access is therefore an
 * explicit, server-only allowlist that is empty (off) unless configured.
 */
export function manualScanOperatorEmails(
  rawAllowlist: string | undefined = process.env[OPERATOR_EMAILS_ENV],
): Set<string> {
  return new Set(
    (rawAllowlist ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function mayRunManualScan(
  email: string | null | undefined,
  rawAllowlist: string | undefined = process.env[OPERATOR_EMAILS_ENV],
): boolean {
  const normalized = email?.trim().toLowerCase();
  return normalized ? manualScanOperatorEmails(rawAllowlist).has(normalized) : false;
}

/** Resolve the signed-in viewer's operator access from the verified session. */
export async function viewerMayRunManualScan(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  // Skip the auth round trip on every customer dashboard load when the
  // deployment has no operators configured.
  if (manualScanOperatorEmails().size === 0) return false;

  const { data, error } = await supabase.auth.getUser();
  if (error) return false;
  return mayRunManualScan(data.user?.email);
}
