import type { SupabaseClient } from "@supabase/supabase-js";

type SourceObservation = {
  source_key: string;
  source_kind: string;
  rights_approval_ref: string;
  retention_expires_at: string;
};
type SourceApproval = {
  source_key: string;
  source_kind: string;
  approval_ref: string;
  approval_status: string;
  valid_until: string;
};

export function latestApprovedSourceDeadline(
  observations: SourceObservation[], approvals: SourceApproval[], now: number,
): Date | null {
  const byKey = new Map(approvals.map((approval) => [approval.source_key, approval]));
  const deadlines = observations.flatMap((observation) => {
    const approval = byKey.get(observation.source_key);
    if (!approval || approval.approval_status !== "active"
        || approval.source_kind !== observation.source_kind
        || approval.approval_ref !== observation.rights_approval_ref) return [];
    const deadline = Math.min(
      Date.parse(observation.retention_expires_at), Date.parse(approval.valid_until),
    );
    return deadline > now ? [deadline] : [];
  });
  return deadlines.length ? new Date(Math.max(...deadlines)) : null;
}

/** Latest display deadline supported by a currently approved candidate source. */
export async function candidateSourceDeadline(
  db: SupabaseClient<any, any, any>, tenantId: string, candidateId: string,
): Promise<Date> {
  const { data: observations, error } = await db.from("assisted_candidate_observations")
    .select("source_key,source_kind,rights_approval_ref,retention_expires_at")
    .eq("tenant_id", tenantId).eq("candidate_id", candidateId)
    .gt("retention_expires_at", new Date().toISOString()).limit(501);
  if (error || !observations || observations.length === 501) {
    throw new Error("Candidate source observations could not be loaded safely.");
  }
  const keys = [...new Set(observations.map((row) => row.source_key))];
  const approvals: SourceApproval[] = [];
  for (let offset = 0; offset < keys.length; offset += 50) {
    const { data, error: approvalError } = await db.from("assisted_source_approvals")
      .select("source_key,source_kind,approval_ref,approval_status,valid_until")
      .eq("tenant_id", tenantId).in("source_key", keys.slice(offset, offset + 50));
    if (approvalError) throw new Error(`Candidate source approval lookup failed: ${approvalError.code}`);
    approvals.push(...(data ?? []));
  }
  const deadline = latestApprovedSourceDeadline(observations, approvals, Date.now());
  if (!deadline) throw new Error("Candidate has no current approved source observation.");
  return deadline;
}
