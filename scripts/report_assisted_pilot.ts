/** Staff-only weekly pilot report. Pass UTC instants for the workspace's local week. */
import { createClient } from "@supabase/supabase-js";

type DeliveryRow = {
  id: string;
  prospect_entity_id: string;
  tier: "direct_intent" | "timely" | "high_fit";
  source_channel: "official_site" | "public_discussion" | "licensed_provider" | "customer_owned";
  withdrawn_at: string | null;
  research_minutes: number;
  review_minutes: number;
  source_cost_usd: number;
  ai_cost_usd: number;
};
type FeedbackRow = {
  delivery_id: string;
  user_id: string;
  verdict: string;
  created_at: string;
  id: string;
};
type RejectionRow = {
  reason_code: string;
  source_channel: string;
  research_minutes: number;
  review_minutes: number;
  source_cost_usd: number;
  ai_cost_usd: number;
};
type CandidateRow = { domain: string; status: string };
type ObservationRow = { source_kind: string };

export function summarizeAssistedPilot(
  deliveries: DeliveryRow[],
  feedback: FeedbackRow[],
  reviewerHourlyUsd: number,
  rejections: RejectionRow[] = [],
  candidates: CandidateRow[] = [],
  observations: ObservationRow[] = [],
) {
  const latest = new Map<string, FeedbackRow>();
  for (const event of feedback) {
    const key = `${event.delivery_id}:${event.user_id}`;
    const prior = latest.get(key);
    if (!prior || event.created_at > prior.created_at
        || (event.created_at === prior.created_at && event.id > prior.id)) {
      latest.set(key, event);
    }
  }
  const verdictsByDelivery = new Map<string, Set<string>>();
  const actionsByDelivery = new Map<string, Set<string>>();
  for (const event of feedback) {
    if (event.verdict !== "contacted" && event.verdict !== "meeting") continue;
    const actions = actionsByDelivery.get(event.delivery_id) ?? new Set<string>();
    actions.add(event.verdict);
    actionsByDelivery.set(event.delivery_id, actions);
  }
  for (const event of latest.values()) {
    const verdicts = verdictsByDelivery.get(event.delivery_id) ?? new Set<string>();
    verdicts.add(event.verdict);
    verdictsByDelivery.set(event.delivery_id, verdicts);
  }
  const visible = deliveries.filter((row) => !row.withdrawn_at);
  const tiers = { direct_intent: 0, timely: 0, high_fit: 0 };
  const sourceChannels = { official_site: 0, public_discussion: 0, licensed_provider: 0, customer_owned: 0 };
  const rejected = { wrong_fit: 0, already_known: 0, no_route: 0, bad_evidence: 0, not_now: 0 };
  let accepted = 0;
  let contacted = 0;
  let meetings = 0;
  let rated = 0;
  let conflictingVerdicts = 0;
  for (const row of visible) {
    tiers[row.tier] += 1;
    sourceChannels[row.source_channel] += 1;
    const verdicts = verdictsByDelivery.get(row.id);
    const actions = actionsByDelivery.get(row.id);
    if (!verdicts?.size) continue;
    rated += 1;
    if (verdicts.size > 1) conflictingVerdicts += 1;
    if (["worth_contacting", "contacted", "meeting"].some((value) => verdicts.has(value))
        || Boolean(actions?.size)) accepted += 1;
    if (actions?.size) contacted += 1;
    if (actions?.has("meeting")) meetings += 1;
    for (const verdict of Object.keys(rejected) as (keyof typeof rejected)[]) {
      if (verdicts.has(verdict)) rejected[verdict] += 1;
    }
  }
  const allReviewed = [...deliveries, ...rejections];
  const researchMinutes = allReviewed.reduce((sum, row) => sum + row.research_minutes, 0);
  const reviewMinutes = allReviewed.reduce((sum, row) => sum + row.review_minutes, 0);
  const sourceCostUsd = allReviewed.reduce((sum, row) => sum + Number(row.source_cost_usd), 0);
  const aiCostUsd = allReviewed.reduce((sum, row) => sum + Number(row.ai_cost_usd), 0);
  const estimatedTotalCostUsd = sourceCostUsd + aiCostUsd
    + (researchMinutes + reviewMinutes) * reviewerHourlyUsd / 60;
  const rejectionReasons: Record<string, number> = {};
  const rejectedSourceChannels: Record<string, number> = {};
  for (const row of rejections) {
    rejectionReasons[row.reason_code] = (rejectionReasons[row.reason_code] ?? 0) + 1;
    rejectedSourceChannels[row.source_channel] = (rejectedSourceChannels[row.source_channel] ?? 0) + 1;
  }
  const candidateStatuses: Record<string, number> = {};
  for (const row of candidates) {
    candidateStatuses[row.status] = (candidateStatuses[row.status] ?? 0) + 1;
  }
  const intakeSources: Record<string, number> = {};
  for (const row of observations) {
    intakeSources[row.source_kind] = (intakeSources[row.source_kind] ?? 0) + 1;
  }
  return {
    newCandidateRows: candidates.length,
    newCandidateDomains: new Set(candidates.map((row) => row.domain)).size,
    candidateCurrentStatuses: candidateStatuses,
    sourceObservationsImported: observations.length,
    intakeSources,
    reviewedCandidates: allReviewed.length,
    delivered: visible.length,
    distinctEntities: new Set(visible.map((row) => row.prospect_entity_id)).size,
    withdrawn: deliveries.length - visible.length,
    rejectedBeforeDelivery: rejections.length,
    rejectionReasons,
    rejectedSourceChannels,
    tiers,
    sourceChannels,
    rejected,
    rated,
    unrated: visible.length - rated,
    accepted,
    contacted,
    meetings,
    conflictingVerdicts,
    researchMinutes,
    reviewMinutes,
    sourceCostUsd,
    aiCostUsd,
    reviewerHourlyUsd,
    estimatedTotalCostUsd: Number(estimatedTotalCostUsd.toFixed(2)),
    estimatedCostPerAcceptedUsd: accepted
      ? Number((estimatedTotalCostUsd / accepted).toFixed(2)) : null,
  };
}

async function main() {
  const [tenantId, from, to, hourly] = process.argv.slice(2);
  const reviewerHourlyUsd = Number(hourly);
  const start = Date.parse(from ?? "");
  const end = Date.parse(to ?? "");
  if (!tenantId || !Number.isFinite(start) || !Number.isFinite(end)
      || end <= start || end - start > 8 * 24 * 60 * 60 * 1000
      || !Number.isFinite(reviewerHourlyUsd) || reviewerHourlyUsd < 0) {
    throw new Error("Usage: pnpm exec tsx scripts/report_assisted_pilot.ts TENANT_ID FROM_UTC TO_UTC REVIEWER_HOURLY_USD");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service-role Supabase configuration is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: deliveries, error } = await db.from("assisted_prospect_deliveries")
    .select("id,prospect_entity_id,tier,source_channel,withdrawn_at,research_minutes,review_minutes,source_cost_usd,ai_cost_usd")
    .eq("tenant_id", tenantId).gte("delivered_at", new Date(start).toISOString())
    .lt("delivered_at", new Date(end).toISOString()).limit(1000);
  if (error) throw new Error(`Could not load deliveries: ${error.code}`);
  if (!deliveries || deliveries.length === 1000) throw new Error("Delivery window exceeds safe report limit.");
  const ids = deliveries.map((row) => row.id);
  let feedback: FeedbackRow[] = [];
  if (ids.length) {
    const { data, error: feedbackError } = await db.from("assisted_prospect_feedback")
      .select("id,delivery_id,user_id,verdict,created_at")
      .eq("tenant_id", tenantId).in("delivery_id", ids).limit(1000);
    if (feedbackError) throw new Error(`Could not load feedback: ${feedbackError.code}`);
    if (!data || data.length === 1000) throw new Error("Feedback window exceeds safe report limit.");
    feedback = data as FeedbackRow[];
  }
  const { data: rejections, error: rejectionError } = await db.from("assisted_prospect_rejections")
    .select("reason_code,source_channel,research_minutes,review_minutes,source_cost_usd,ai_cost_usd")
    .eq("tenant_id", tenantId).gte("reviewed_at", new Date(start).toISOString())
    .lt("reviewed_at", new Date(end).toISOString()).limit(1000);
  if (rejectionError) throw new Error(`Could not load rejections: ${rejectionError.code}`);
  if (!rejections || rejections.length === 1000) throw new Error("Rejection window exceeds safe report limit.");
  const [candidateResult, observationResult] = await Promise.all([
    db.from("assisted_prospect_candidates").select("domain,status")
      .eq("tenant_id", tenantId).gte("first_seen_at", new Date(start).toISOString())
      .lt("first_seen_at", new Date(end).toISOString()).limit(1000),
    db.from("assisted_candidate_observations").select("source_kind")
      .eq("tenant_id", tenantId).gte("imported_at", new Date(start).toISOString())
      .lt("imported_at", new Date(end).toISOString()).limit(1000),
  ]);
  if (candidateResult.error || observationResult.error
      || !candidateResult.data || !observationResult.data) {
    throw new Error("Candidate intake report could not be loaded.");
  }
  if (candidateResult.data.length === 1000 || observationResult.data.length === 1000) {
    throw new Error("Candidate intake window exceeds safe report limit.");
  }
  const report = summarizeAssistedPilot(
    deliveries as DeliveryRow[], feedback, reviewerHourlyUsd, rejections as RejectionRow[],
    candidateResult.data as CandidateRow[], observationResult.data as ObservationRow[],
  );
  process.stdout.write(`${JSON.stringify({ tenantId, from: new Date(start).toISOString(), to: new Date(end).toISOString(), ...report }, null, 2)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/report_assisted_pilot.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Report failed"}\n`);
    process.exitCode = 1;
  });
}
