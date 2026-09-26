"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { deliverCrmWebhook } from "@/lib/crm-webhook-delivery";
import {
  localWebhookTestingEnabled,
  validateWebhookDestination,
} from "@/lib/crm-webhook-destination";
import { PRO_PLAN_REQUIRED_MESSAGE, requireProEntitlement } from "@/lib/entitlements";
import type { Json } from "@/types/supabase";
import { resolveTenantContext } from "@/utils/supabase/tenant";

import type { ProspectActionResult } from "@/app/(dashboard)/dashboard/prospect-types";

const OPPORTUNITY_CREATE_SCHEMA = z.object({
  assessmentId: z.string().uuid(),
  evidenceId: z.string().uuid(),
}).strict();

const OPPORTUNITY_QUALIFY_SCHEMA = z.object({
  opportunityId: z.string().uuid(),
}).strict();

type OpportunityRpcClient = {
  rpc: (
    functionName: string,
    arguments_: Record<string, Json>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

type TenantWebhookSettings = {
  tenant_id: string;
  crm_webhook_url: string | null;
};

type OpportunityQualificationRow = {
  opportunity_id: string;
  opportunity_status: string;
  already_qualified: boolean;
  evidence_source: string | null;
  evidence_source_url: string | null;
  evidence_summary: string | null;
};

type OpportunityWebhookStatus = "sent" | "not_configured" | "failed" | "skipped";

export type ProspectOpportunityQualificationResult = {
  ok: boolean;
  alreadyQualified?: boolean;
  status: "qualified" | "already_qualified" | "invalid" | "unauthorized" | "error";
  message: string;
  webhook: OpportunityWebhookStatus;
};

function actionError(message: string): ProspectActionResult {
  return { ok: false, message };
}

function actionFailure(
  status: Extract<ProspectOpportunityQualificationResult["status"], "invalid" | "unauthorized" | "error">,
  message: string,
): ProspectOpportunityQualificationResult {
  return { ok: false, status, message, webhook: "skipped" };
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * The DB function is the authoritative cross-tenant and evidence guard. The
 * action deliberately supplies only opaque IDs from the already-rendered
 * target desk; it cannot alter a target, attach a new source, or send a CRM
 * request merely by creating an opportunity.
 */
export async function createProspectOpportunity(
  assessmentId: string,
  evidenceId: string,
): Promise<ProspectActionResult> {
  const parsed = OPPORTUNITY_CREATE_SCHEMA.safeParse({ assessmentId, evidenceId });
  if (!parsed.success) {
    return actionError("Choose accepted target evidence before creating an opportunity.");
  }

  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return actionError(
      tenantResult.response.status === 401
        ? "Sign in again before creating an opportunity."
        : "Workspace access could not be verified.",
    );
  }

  const { supabase, tenantId } = tenantResult.context;
  try {
    await requireProEntitlement(supabase, tenantId);
  } catch {
    return actionError(PRO_PLAN_REQUIRED_MESSAGE);
  }

  const client = supabase as unknown as OpportunityRpcClient;
  const result = await client.rpc("create_prospect_opportunity", {
    target_assessment_id: parsed.data.assessmentId,
    target_evidence_id: parsed.data.evidenceId,
  });
  if (result.error) {
    console.warn("[ProspectOpportunity] creation rejected", {
      tenant_id: tenantId,
      error: result.error,
    });
    return actionError(
      "Could not create an opportunity. Review an accepted cited trigger, problem, or evaluation observation first.",
    );
  }

  const row = Array.isArray(result.data) ? recordValue(result.data[0]) : recordValue(result.data);
  const opportunityId = stringValue(row?.opportunity_id);
  const created = row?.created === true;
  if (!opportunityId) {
    console.warn("[ProspectOpportunity] creation returned an invalid projection", {
      tenant_id: tenantId,
    });
    return actionError("Could not confirm the opportunity. Refresh the target desk and try again.");
  }

  revalidatePath("/dashboard/targets");
  revalidatePath("/dashboard");
  return created
    ? {
        ok: true,
        message:
          "Opportunity created from accepted cited evidence. It will not send outreach or export to a CRM until you explicitly qualify it.",
      }
    : {
        ok: true,
        message: "This target already has an opportunity. No duplicate was created.",
      };
}

/**
 * Qualify a human-created opportunity through a second explicit action. The
 * database makes the ready_for_review -> qualified transition first; only the
 * request that successfully claims that transition may perform the optional,
 * SSRF-validated CRM delivery. No contact enrichment occurs, and it never
 * sends outreach.
 */
export async function qualifyProspectOpportunity(
  opportunityId: string,
): Promise<ProspectOpportunityQualificationResult> {
  const parsed = OPPORTUNITY_QUALIFY_SCHEMA.safeParse({ opportunityId });
  if (!parsed.success) {
    return actionFailure("invalid", "The opportunity identifier is invalid.");
  }

  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return actionFailure(
      "unauthorized",
      tenantResult.response.status === 401
        ? "Sign in again before qualifying an opportunity."
        : "Workspace access could not be verified.",
    );
  }

  const { supabase, tenantId } = tenantResult.context;
  try {
    await requireProEntitlement(supabase, tenantId);
  } catch {
    return actionFailure("unauthorized", PRO_PLAN_REQUIRED_MESSAGE);
  }

  const client = supabase as unknown as OpportunityRpcClient;
  const result = await client.rpc("qualify_prospect_opportunity", {
    target_opportunity_id: parsed.data.opportunityId,
  });
  if (result.error) {
    console.warn("[ProspectOpportunity] qualification rejected", {
      tenant_id: tenantId,
      opportunity_id: parsed.data.opportunityId,
      error: result.error,
    });
    return actionFailure(
      "invalid",
      "Only an active opportunity with accepted cited evidence can be qualified.",
    );
  }

  const row = Array.isArray(result.data) ? recordValue(result.data[0]) : recordValue(result.data);
  const qualifiedOpportunityId = stringValue(row?.opportunity_id);
  const alreadyQualified = row?.already_qualified === true;
  const opportunityStatus = stringValue(row?.opportunity_status);
  if (!qualifiedOpportunityId || opportunityStatus !== "qualified") {
    console.warn("[ProspectOpportunity] qualification returned an invalid projection", {
      tenant_id: tenantId,
      opportunity_id: parsed.data.opportunityId,
    });
    return actionFailure("error", "Could not confirm the opportunity qualification. Please refresh and try again.");
  }

  revalidatePath("/dashboard/targets");
  revalidatePath("/dashboard");
  if (alreadyQualified) {
    return {
      ok: true,
      alreadyQualified: true,
      status: "already_qualified",
      message: "This opportunity is already qualified. Arcli will not automatically retry CRM delivery.",
      webhook: "skipped",
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("tenant_settings")
    .select("tenant_id, crm_webhook_url")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantWebhookSettings>();
  if (settingsError) {
    console.warn("[ProspectOpportunity] CRM settings lookup failed", {
      tenant_id: tenantId,
      opportunity_id: qualifiedOpportunityId,
      error: settingsError,
    });
    return {
      ok: true,
      alreadyQualified: false,
      status: "qualified",
      message: "Opportunity qualified. CRM export could not be started.",
      webhook: "failed",
    };
  }

  const configuredWebhookUrl = settings?.crm_webhook_url?.trim();
  if (!configuredWebhookUrl) {
    return {
      ok: true,
      alreadyQualified: false,
      status: "qualified",
      message: "Opportunity qualified. No CRM webhook is configured.",
      webhook: "not_configured",
    };
  }

  const webhookDestination = await validateWebhookDestination(configuredWebhookUrl, {
    production: process.env.NODE_ENV === "production",
    allowLocalhost: localWebhookTestingEnabled(),
  });
  if (!webhookDestination) {
    // Do not log the configured destination: it can contain customer data in
    // its query string even though userinfo is rejected by the validator.
    console.warn("[ProspectOpportunity] CRM webhook destination rejected", {
      tenant_id: tenantId,
      opportunity_id: qualifiedOpportunityId,
    });
    return {
      ok: true,
      alreadyQualified: false,
      status: "qualified",
      message: "Opportunity qualified. CRM export could not be delivered.",
      webhook: "failed",
    };
  }

  // The contract returns a safe summary, source label, and cited public URL,
  // never a profile, contact, raw post body, or crawler output.
  const delivered = await deliverCrmWebhook(
    webhookDestination,
    {
      source: stringValue(row?.evidence_source),
      url: stringValue(row?.evidence_source_url),
      pain_detected: stringValue(row?.evidence_summary),
      suggested_reply: null,
    },
    `arcli-prospect-opportunity-${qualifiedOpportunityId}`,
  );
  if (!delivered) {
    console.warn("[ProspectOpportunity] CRM webhook delivery failed", {
      tenant_id: tenantId,
      opportunity_id: qualifiedOpportunityId,
    });
  }

  return {
    ok: true,
    alreadyQualified: false,
    status: "qualified",
    message: delivered
      ? "Opportunity qualified and exported to your CRM."
      : "Opportunity qualified. CRM export could not be delivered.",
    webhook: delivered ? "sent" : "failed",
  };
}
