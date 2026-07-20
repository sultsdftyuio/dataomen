"use server";

import { revalidatePath } from "next/cache";

import { resolveTenantContext } from "@/utils/supabase/tenant";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEBHOOK_TIMEOUT_MS = 5_000;

type LeadMatchForQualification = {
  id: string;
  source_post_id: string | null;
  pain_detected: string | null;
  suggested_reply: string | null;
};

type SourcePostForWebhook = {
  source: string | null;
  url: string | null;
};

type TenantWebhookSettings = {
  tenant_id: string;
  crm_webhook_url: string | null;
};

type CrmWebhookPayload = {
  source: string | null;
  url: string | null;
  pain_detected: string | null;
  suggested_reply: string | null;
};

type WebhookStatus = "sent" | "not_configured" | "failed" | "skipped";

export type LeadQualificationResult = {
  ok: boolean;
  alreadyQualified?: boolean;
  status: "qualified" | "already_qualified" | "invalid" | "unauthorized" | "error";
  message: string;
  webhook: WebhookStatus;
};

function actionFailure(
  status: Extract<LeadQualificationResult["status"], "invalid" | "unauthorized" | "error">,
  message: string,
): LeadQualificationResult {
  return {
    ok: false,
    status,
    message,
    webhook: "skipped",
  };
}

function normalizeWebhookUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function sendCrmWebhook(
  webhookUrl: string,
  payload: CrmWebhookPayload,
  context: { tenantId: string; leadMatchId: string },
): Promise<Extract<WebhookStatus, "sent" | "failed">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn("[Leads] CRM webhook rejected qualified lead", {
        tenant_id: context.tenantId,
        lead_match_id: context.leadMatchId,
        status: response.status,
      });
      return "failed";
    }

    return "sent";
  } catch (error) {
    // Webhook delivery is intentionally best-effort. Qualification is already
    // committed before this request begins and must never be rolled back here.
    console.warn("[Leads] CRM webhook delivery failed", {
      tenant_id: context.tenantId,
      lead_match_id: context.leadMatchId,
      error,
    });
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Marks one tenant-owned lead as qualified and optionally emits a single
 * best-effort CRM webhook. The conditional update is the idempotency boundary:
 * only the request that changes a non-qualified record can dispatch a webhook.
 */
export async function markLeadAsQualified(
  leadMatchId: string,
): Promise<LeadQualificationResult> {
  const normalizedLeadMatchId =
    typeof leadMatchId === "string" ? leadMatchId.trim() : "";
  if (!UUID_PATTERN.test(normalizedLeadMatchId)) {
    return actionFailure("invalid", "The lead identifier is invalid.");
  }

  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return actionFailure(
      "unauthorized",
      tenantResult.response.status === 401
        ? "Sign in again before qualifying a lead."
        : "Workspace access could not be verified.",
    );
  }

  const { supabase, tenantId } = tenantResult.context;

  // This is deliberately one conditional statement, rather than a read then
  // write. Concurrent requests therefore cannot both claim the webhook.
  const { data: updatedLead, error: updateError } = await supabase
    .from("lead_matches")
    .update({
      match_status: "qualified",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", normalizedLeadMatchId)
    .neq("match_status", "qualified")
    .select("id, source_post_id, pain_detected, suggested_reply")
    .maybeSingle<LeadMatchForQualification>();

  if (updateError) {
    console.error("[Leads] Failed to qualify lead", {
      tenant_id: tenantId,
      lead_match_id: normalizedLeadMatchId,
      error: updateError,
    });
    return actionFailure("error", "Unable to qualify this lead. Please try again.");
  }

  // A zero-row conditional update means the record was already qualified,
  // missing, or another concurrent request won the update. In all cases, do
  // not emit a second webhook.
  if (!updatedLead) {
    revalidatePath("/dashboard");
    return {
      ok: true,
      alreadyQualified: true,
      status: "already_qualified",
      message: "This lead is already qualified.",
      webhook: "skipped",
    };
  }

  revalidatePath("/dashboard");

  const { data: settings, error: settingsError } = await supabase
    .from("tenant_settings")
    .select("tenant_id, crm_webhook_url")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantWebhookSettings>();

  if (settingsError) {
    console.warn("[Leads] CRM webhook settings lookup failed", {
      tenant_id: tenantId,
      lead_match_id: normalizedLeadMatchId,
      error: settingsError,
    });
    return {
      ok: true,
      alreadyQualified: false,
      status: "qualified",
      message: "Lead qualified. CRM export could not be started.",
      webhook: "failed",
    };
  }

  const webhookUrl = normalizeWebhookUrl(settings?.crm_webhook_url);
  if (!webhookUrl) {
    return {
      ok: true,
      alreadyQualified: false,
      status: "qualified",
      message: "Lead qualified.",
      webhook: "not_configured",
    };
  }

  let sourcePost: SourcePostForWebhook | null = null;
  if (updatedLead.source_post_id) {
    const { data, error } = await supabase
      .from("source_posts")
      .select("source, url")
      .eq("tenant_id", tenantId)
      .eq("id", updatedLead.source_post_id)
      .maybeSingle<SourcePostForWebhook>();

    if (error) {
      // Keep the webhook best-effort even if an old/deleted source post can no
      // longer be loaded. The payload still has the required, nullable keys.
      console.warn("[Leads] Source post lookup failed for CRM webhook", {
        tenant_id: tenantId,
        lead_match_id: normalizedLeadMatchId,
        source_post_id: updatedLead.source_post_id,
        error,
      });
    } else {
      sourcePost = data;
    }
  }

  const webhook = await sendCrmWebhook(
    webhookUrl,
    {
      source: sourcePost?.source ?? null,
      url: sourcePost?.url ?? null,
      pain_detected: updatedLead.pain_detected,
      suggested_reply: updatedLead.suggested_reply,
    },
    { tenantId, leadMatchId: normalizedLeadMatchId },
  );

  return {
    ok: true,
    alreadyQualified: false,
    status: "qualified",
    message:
      webhook === "sent"
        ? "Lead qualified and exported to your CRM."
        : "Lead qualified. CRM export could not be delivered.",
    webhook,
  };
}
