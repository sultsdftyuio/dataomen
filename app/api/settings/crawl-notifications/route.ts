import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveTenantContext } from "@/utils/supabase/tenant";
import {
  RESULT_EMAIL_NOTICE_VERSION,
  resultEmailsEnabled,
} from "@/lib/result-email-preference";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  enabled: z.boolean(),
});

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET() {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) return tenantResult.response;

  const { supabase, tenantId, userId } = tenantResult.context;
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError || !membership) {
    return noStore({ error: "Your workspace membership could not be verified." }, { status: 403 });
  }
  const eligible = ["owner", "admin"].includes(membership.role?.toLowerCase() ?? "");
  const {
    data: { user },
    error: accountError,
  } = await supabase.auth.getUser();
  if (accountError || user?.id !== userId || !user.email) {
    return noStore({ error: "Could not verify account email." }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("crawl_notification_preferences")
    .select("enabled,opted_in_at,opted_in_email,notice_version")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[CRAWL_NOTIFICATION_SETTINGS_FETCH_ERROR]", {
      event: "crawl_notification_settings_fetch_failed",
      tenant_id: tenantId,
      error,
    });
    return noStore({ error: "Failed to load refresh email settings." }, { status: 500 });
  }

  return noStore({
    enabled: eligible && resultEmailsEnabled(data, user.email),
    eligible,
  });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return noStore({ error: "enabled must be a boolean." }, { status: 400 });
  }

  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) return tenantResult.response;

  const { supabase, tenantId, userId } = tenantResult.context;
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || membership?.user_id !== userId) {
    console.warn("[CRAWL_NOTIFICATION_SETTINGS_DENIED]", {
      event: "crawl_notification_settings_denied",
      tenant_id: tenantId,
      user_id: userId,
      membership_error: membershipError?.code,
    });
    return noStore(
      { error: "Your workspace membership could not be verified." },
      { status: 403 },
    );
  }

  if (parsed.data.enabled && !["owner", "admin"].includes(membership.role?.toLowerCase() ?? "")) {
    return noStore(
      { error: "Only workspace owners and admins can enable result emails." },
      { status: 403 },
    );
  }

  let optedInEmail: string | null = null;
  if (parsed.data.enabled) {
    const {
      data: { user },
      error: accountError,
    } = await supabase.auth.getUser();
    if (accountError || user?.id !== userId || !user.email) {
      return noStore({ error: "Could not verify account email." }, { status: 503 });
    }
    optedInEmail = user.email.trim().toLowerCase();
  }

  const updatedAt = new Date().toISOString();
  const preferenceTable = supabase.from("crawl_notification_preferences");
  // An opt-out updates only the switch, preserving the last opt-in evidence.
  const { data, error } = parsed.data.enabled
    ? await preferenceTable
        .upsert(
          {
            tenant_id: tenantId,
            user_id: userId,
            enabled: true,
            updated_at: updatedAt,
            opted_in_at: updatedAt,
            opted_in_email: optedInEmail,
            notice_version: RESULT_EMAIL_NOTICE_VERSION,
          },
          { onConflict: "tenant_id,user_id" },
        )
        .select("enabled")
        .single()
    : await preferenceTable
        .update({ enabled: false, updated_at: updatedAt })
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .select("enabled")
        .maybeSingle();

  if (error) {
    console.error("[CRAWL_NOTIFICATION_SETTINGS_UPDATE_ERROR]", {
      event: "crawl_notification_settings_update_failed",
      tenant_id: tenantId,
      user_id: userId,
      error,
    });
    return noStore({ error: "Could not update refresh email settings." }, { status: 500 });
  }

  console.info("[CRAWL_NOTIFICATION_SETTINGS_UPDATED]", {
    event: "crawl_notification_settings_updated",
    tenant_id: tenantId,
    user_id: userId,
    enabled: data?.enabled ?? false,
  });
  return noStore({ enabled: data?.enabled ?? false });
}
