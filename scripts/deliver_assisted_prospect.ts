/**
 * Staff-only assisted pilot intake. Dry run by default; --commit writes one
 * reviewed card. Never run this with an end-user Supabase key.
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { publicUrl, safeText, sourceDate } from "./assisted_pilot_validation";
import { ensureAssistedAccountEntity, normalizeAssistedAccount } from "./assisted_account_identity";
import { assertActivePilotBrief } from "./assisted_pilot_access";
import { candidateSourceDeadline } from "./assisted_candidate_source";

export const assistedDeliveryInputSchema = z.object({
  tenantId: z.string().min(1),
  targetingProfileId: z.string().uuid(),
  targetingProfileVersion: z.number().int().positive(),
  candidateId: z.string().uuid().nullable(),
  entityKind: z.enum(["account", "builder", "project"]),
  entityUrl: publicUrl,
  entityTitle: safeText.refine((value) => value.length <= 240).nullable(),
  tier: z.enum(["direct_intent", "timely", "high_fit"]),
  fitSummary: safeText,
  fitSourceUrl: publicUrl,
  buyerRole: safeText.refine((value) => value.length <= 120, "Keep the buyer role under 120 characters."),
  angle: safeText,
  uncertaintySummary: safeText,
  signalSummary: safeText.nullable(),
  signalSourceUrl: publicUrl.nullable(),
  signalSourceChannel: z.enum(["official_site", "licensed_provider", "customer_owned"]).nullable(),
  signalDate: sourceDate.nullable(),
  contactRouteType: z.enum(["public_reply", "business_contact", "licensed_business_route"]),
  contactRouteUrl: publicUrl,
  sourceCheckedAt: z.string().datetime(),
  routeCheckedAt: z.string().datetime(),
  sourceChannel: z.enum(["official_site", "licensed_provider", "customer_owned"]),
  rightsBasis: safeText,
  researchMinutes: z.number().int().nonnegative(),
  reviewMinutes: z.number().int().positive(),
  sourceCostUsd: z.number().nonnegative(),
  aiCostUsd: z.number().nonnegative(),
  reviewedBy: z.string().trim().min(1).max(120),
  checks: z.object({
    sourceRightsConfirmed: z.literal(true),
    fitAndExclusionsChecked: z.literal(true),
    identityAndDedupeChecked: z.literal(true),
    buyerRoleChecked: z.literal(true),
    contactRouteOpened: z.literal(true),
    reviewerApproved: z.literal(true),
  }).strict(),
}).strict().superRefine((value, context) => {
  if ((value.entityKind === "account" && value.candidateId === null)
      || (value.entityKind !== "account" && value.candidateId !== null)) {
    context.addIssue({ code: "custom", path: ["candidateId"],
      message: "Account deliveries require an imported candidate ID." });
  }
  if (value.entityKind === "builder" && value.entityTitle !== null) {
    context.addIssue({ code: "custom", path: ["entityTitle"], message: "Builder names are not retained." });
  }
  const hasSignal = Boolean(value.signalSummary && value.signalSourceUrl
    && value.signalSourceChannel && value.signalDate);
  const hasPartialSignal = Boolean(value.signalSummary || value.signalSourceUrl
    || value.signalSourceChannel || value.signalDate);
  if ((value.tier !== "high_fit" && !hasSignal) || (hasPartialSignal && !hasSignal)) {
    context.addIssue({ code: "custom", path: ["signalSummary"], message: "Dated signal, URL and summary must all be present for direct or timely tiers." });
  }
  for (const [field, checkedAt] of [["sourceCheckedAt", value.sourceCheckedAt], ["routeCheckedAt", value.routeCheckedAt]] as const) {
    if (Date.parse(checkedAt) > Date.now()) {
      context.addIssue({ code: "custom", path: [field], message: "Check time cannot be in the future." });
    }
  }
});

export type AssistedDeliveryInput = z.infer<typeof assistedDeliveryInputSchema>;

function canonicalUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.search = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString();
}

export async function deliverAssistedProspect(input: AssistedDeliveryInput): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Service-role Supabase configuration is required.");
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await assertActivePilotBrief(
    db, input.tenantId, input.targetingProfileId,
    input.targetingProfileVersion, input.entityKind,
  );

  let entityId: string;
  let sourceDeadline: Date | null = null;
  if (input.entityKind === "account") {
    if (!input.candidateId) throw new Error("Account delivery requires a candidate ID.");
    const identity = normalizeAssistedAccount(input.entityUrl);
    entityId = await ensureAssistedAccountEntity(db, input.tenantId, identity, input.entityTitle);
    const { data: candidate, error: candidateError } = await db.from("assisted_prospect_candidates")
      .select("id,status").eq("id", input.candidateId)
      .eq("tenant_id", input.tenantId)
      .eq("targeting_profile_id", input.targetingProfileId)
      .eq("targeting_profile_version", input.targetingProfileVersion)
      .eq("prospect_entity_id", entityId).maybeSingle();
    if (candidateError || !candidate || !["unreviewed", "researching"].includes(candidate.status)) {
      throw new Error("Account is not an active candidate for this targeting brief.");
    }
    sourceDeadline = await candidateSourceDeadline(db, input.tenantId, input.candidateId);
  } else {
    const url = canonicalUrl(input.entityUrl);
    const { data: entity, error: entityError } = await db.from("prospect_entities")
      .upsert({
        tenant_id: input.tenantId,
        entity_kind: input.entityKind,
        entity_provider: "operator_review",
        entity_external_id: url,
        canonical_url: url,
        title: input.entityTitle,
        origin_kind: "manual",
      }, { onConflict: "tenant_id,entity_kind,entity_provider,entity_external_id" })
      .select("id").single();
    if (entityError || !entity) {
      throw new Error(`Could not save prospect entity: ${entityError?.code ?? "unknown"}`);
    }
    entityId = entity.id;
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: previous, error: previousError } = await db.from("assisted_prospect_deliveries")
    .select("id").eq("tenant_id", input.tenantId).eq("prospect_entity_id", entityId)
    .gte("delivered_at", ninetyDaysAgo).limit(1);
  if (previousError) throw new Error(`Could not check prior deliveries: ${previousError.code}`);
  if (previous?.length) throw new Error("This entity was already delivered in the last 90 days.");

  const reviewedAt = new Date();
  // Leave one day of headroom for database timezone/DST interval semantics.
  const displayDays = input.signalSourceUrl ? 29 : 89;
  const displayExpiresAt = new Date(Math.min(
    reviewedAt.getTime() + displayDays * 24 * 60 * 60 * 1000,
    sourceDeadline ? sourceDeadline.getTime() - 60 * 60 * 1000 : Number.POSITIVE_INFINITY,
  ));
  if (displayExpiresAt <= reviewedAt) {
    throw new Error("Candidate source approval ends too soon to publish this card.");
  }
  const { data: delivered, error: deliveryError } = await db.from("assisted_prospect_deliveries")
    .insert({
      tenant_id: input.tenantId,
      targeting_profile_id: input.targetingProfileId,
      targeting_profile_version: input.targetingProfileVersion,
      prospect_entity_id: entityId,
      ...(input.candidateId ? { candidate_id: input.candidateId } : {}),
      tier: input.tier,
      fit_summary: input.fitSummary,
      fit_source_url: input.fitSourceUrl,
      buyer_role: input.buyerRole,
      angle: input.angle,
      uncertainty_summary: input.uncertaintySummary,
      signal_summary: input.signalSummary,
      signal_source_url: input.signalSourceUrl,
      signal_source_channel: input.signalSourceChannel,
      signal_date: input.signalDate,
      contact_route_type: input.contactRouteType,
      contact_route_url: input.contactRouteUrl,
      source_checked_at: input.sourceCheckedAt,
      route_checked_at: input.routeCheckedAt,
      source_channel: input.sourceChannel,
      rights_basis: input.rightsBasis,
      research_minutes: input.researchMinutes,
      review_minutes: input.reviewMinutes,
      source_cost_usd: input.sourceCostUsd,
      ai_cost_usd: input.aiCostUsd,
      reviewed_by: input.reviewedBy,
      reviewed_at: reviewedAt.toISOString(),
      display_expires_at: displayExpiresAt.toISOString(),
    }).select("id").single();
  if (deliveryError || !delivered) throw new Error(`Could not deliver prospect: ${deliveryError?.code ?? "unknown"}`);
  return delivered.id;
}

async function main() {
  const [path, mode] = process.argv.slice(2);
  if (!path || (mode && mode !== "--commit")) {
    throw new Error("Usage: pnpm exec tsx scripts/deliver_assisted_prospect.ts card.json [--commit]");
  }
  const parsed = assistedDeliveryInputSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (mode !== "--commit") {
    process.stdout.write("Card validates locally. Add --commit to publish it after reviewer approval.\n");
    return;
  }
  const id = await deliverAssistedProspect(parsed);
  process.stdout.write(`Delivered prospect ${id}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/deliver_assisted_prospect.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Delivery failed"}\n`);
    process.exitCode = 1;
  });
}
