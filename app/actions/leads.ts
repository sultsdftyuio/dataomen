"use server";

import { revalidatePath } from "next/cache";

import { deliverCrmWebhook } from "@/lib/crm-webhook-delivery";
import {
  localWebhookTestingEnabled,
  type ValidatedWebhookDestination,
  validateWebhookDestination,
} from "@/lib/crm-webhook-destination";
import { PRO_PLAN_REQUIRED_MESSAGE, requireProEntitlement } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LeadMatchForQualification = {
  id: string;
  source_post_id: string | null;
  pain_detected: string | null;
  suggested_reply: string | null;
  source_post: unknown;
  source_post_data: unknown;
  source_post_json: unknown;
};

type ExistingLeadMatch = {
  match_status: string | null;
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

function sourcePostFromStoredPayload(
  lead: LeadMatchForQualification,
): SourcePostForWebhook | null {
  // Public HN/X source rows are global (`tenant_id IS NULL`), while the lead
  // match itself is tenant-scoped. The matching worker persists a source
  // snapshot on that tenant-owned row specifically so UI/CRM paths do not
  // need to read another tenant's data or bypass source-post RLS.
  for (const value of [
    lead.source_post,
    lead.source_post_data,
    lead.source_post_json,
  ]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const record = value as Record<string, unknown>;
    const source =
      typeof record.source === "string" && record.source.trim()
        ? record.source.trim()
        : null;
    const url =
      typeof record.url === "string" && record.url.trim()
        ? record.url.trim()
        : null;
    if (source || url) return { source, url };
  }

  return null;
}

async function sendCrmWebhook(
  destination: ValidatedWebhookDestination,
  payload: CrmWebhookPayload,
  context: { tenantId: string; leadMatchId: string },
): Promise<Extract<WebhookStatus, "sent" | "failed">> {
  // The conditional qualification update is the first idempotency boundary.
  // Keeping this key stable gives a receiving CRM the same safety boundary
  // when a network failure leaves delivery uncertain.
  const delivered = await deliverCrmWebhook(
    destination,
    payload,
    `arcli-lead-${context.leadMatchId}`,
  );
  if (!delivered) {
    // Do not include the request body, endpoint, or caught network error in a
    // log: all three can contain customer-controlled sensitive data.
    console.warn("[Leads] CRM webhook delivery failed", {
      tenant_id: context.tenantId,
      lead_match_id: context.leadMatchId,
    });
  }
  return delivered ? "sent" : "failed";
}

/**
 * Marks one tenant-owned, verifier-confirmed item as qualified and optionally
 * emits a single best-effort CRM webhook. Rejected/irrelevant source posts are
 * deliberately ineligible: a human may promote only a review-ready lead.
 * Discovery candidates remain review-only evidence and must never be relabelled
 * as qualified or sent to a CRM. The conditional update is the idempotency
 * boundary.
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

  try {
    await requireProEntitlement(supabase, tenantId);
  } catch {
    return actionFailure("unauthorized", PRO_PLAN_REQUIRED_MESSAGE);
  }

  // This is deliberately one conditional statement, rather than a read then
  // write. Concurrent requests therefore cannot both claim the webhook, and
  // discovery/rejected matches can never be promoted through this endpoint.
  const { data: updatedLead, error: updateError } = await supabase
    .from("lead_matches")
    .update({
      match_status: "qualified",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", normalizedLeadMatchId)
    .in("match_status", ["ready_for_review"])
    .select(
      "id, source_post_id, pain_detected, suggested_reply, source_post, source_post_data, source_post_json",
    )
    .maybeSingle<LeadMatchForQualification>();

  if (updateError) {
    console.error("[Leads] Failed to qualify lead", {
      tenant_id: tenantId,
      lead_match_id: normalizedLeadMatchId,
      error: updateError,
    });
    return actionFailure("error", "Unable to qualify this lead. Please try again.");
  }

  // A zero-row conditional update means the item may already be qualified, be
  // missing, be rejected, or have lost a race. Inspect only the tenant-owned
  // status to preserve idempotency without calling an irrelevant item a lead.
  if (!updatedLead) {
    revalidatePath("/dashboard");
    const { data: existingLead, error: existingLeadError } = await supabase
      .from("lead_matches")
      .select("match_status")
      .eq("tenant_id", tenantId)
      .eq("id", normalizedLeadMatchId)
      .maybeSingle<ExistingLeadMatch>();

    if (!existingLeadError && existingLead?.match_status === "qualified") {
      return {
        ok: true,
        alreadyQualified: true,
        status: "already_qualified",
        message: "This lead is already qualified.",
        webhook: "skipped",
      };
    }

    return {
      ok: false,
      status: "invalid",
      message:
        "Only a verifier-confirmed, ready-to-act lead can be qualified.",
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

  const configuredWebhookUrl = settings?.crm_webhook_url?.trim();
  if (!configuredWebhookUrl) {
    return {
      ok: true,
      alreadyQualified: false,
      status: "qualified",
      message: "Lead qualified.",
      webhook: "not_configured",
    };
  }

  const webhookDestination = await validateWebhookDestination(
    configuredWebhookUrl,
    {
      production: process.env.NODE_ENV === "production",
      allowLocalhost: localWebhookTestingEnabled(),
    },
  );
  if (!webhookDestination) {
    // Avoid logging a rejected endpoint; configured webhook URLs may contain
    // customer credentials in their query string even though userinfo itself
    // is rejected by the destination policy.
    console.warn("[Leads] CRM webhook destination rejected", {
      tenant_id: tenantId,
      lead_match_id: normalizedLeadMatchId,
    });
    return {
      ok: true,
      alreadyQualified: false,
      status: "qualified",
      message: "Lead qualified. CRM export could not be delivered.",
      webhook: "failed",
    };
  }

  let sourcePost = sourcePostFromStoredPayload(updatedLead);
  // Legacy tenant-scoped records may predate the stored source snapshot. Fall
  // back only to a tenant-owned source row; global rows are already covered by
  // the snapshot above and must not weaken tenant isolation here.
  if (!sourcePost && updatedLead.source_post_id) {
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
    webhookDestination,
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
