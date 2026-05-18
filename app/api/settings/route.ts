import { NextResponse } from "next/server";
import { formatDistanceToNow } from "date-fns";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS = {
  notifyAnomalies: true,
  notifyWeekly: true,
  apiKey: "No active key",
  keyLastUpdated: "Never",
};

const formatKeyLastUpdated = (value: string | null | undefined) => {
  if (!value) {
    return DEFAULT_SETTINGS.keyLastUpdated;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return DEFAULT_SETTINGS.keyLastUpdated;
  }

  return formatDistanceToNow(parsed, { addSuffix: true });
};

export async function GET() {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  const { supabase, tenantId } = tenantResult.context;

  const { data, error } = await supabase
    .from("tenant_settings")
    .select("notify_anomalies, notify_weekly, api_key, key_last_updated")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(DEFAULT_SETTINGS, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(
    {
      notifyAnomalies:
        typeof data.notify_anomalies === "boolean"
          ? data.notify_anomalies
          : DEFAULT_SETTINGS.notifyAnomalies,
      notifyWeekly:
        typeof data.notify_weekly === "boolean"
          ? data.notify_weekly
          : DEFAULT_SETTINGS.notifyWeekly,
      apiKey: data.api_key || DEFAULT_SETTINGS.apiKey,
      keyLastUpdated: formatKeyLastUpdated(data.key_last_updated),
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
