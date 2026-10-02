/** Cohort yield by approved source. A candidate can appear under several sources. */
export type YieldCandidate = {
  id: string; domain: string;
  status: "unreviewed" | "researching" | "rejected" | "delivered";
};
export type YieldObservation = {
  candidate_id: string; source_key: string; source_kind: string;
};
export type YieldDelivery = { id: string; candidate_id: string };
export type YieldFeedback = {
  id: string; delivery_id: string; user_id: string; verdict: string; created_at: string;
};

export function summarizeSourceYield(
  candidates: YieldCandidate[], observations: YieldObservation[],
  deliveries: YieldDelivery[], feedback: YieldFeedback[],
) {
  const sourcesByCandidate = new Map<string, Set<string>>();
  const sourceKinds = new Map<string, string>();
  for (const observation of observations) {
    const priorKind = sourceKinds.get(observation.source_key);
    if (priorKind && priorKind !== observation.source_kind) {
      throw new Error(`Source ${observation.source_key} changed kind in this cohort.`);
    }
    sourceKinds.set(observation.source_key, observation.source_kind);
    const group = sourcesByCandidate.get(observation.candidate_id) ?? new Set<string>();
    group.add(observation.source_key);
    sourcesByCandidate.set(observation.candidate_id, group);
  }
  const latest = new Map<string, YieldFeedback>();
  const durableActions = new Map<string, Set<string>>();
  for (const event of feedback) {
    const key = `${event.delivery_id}:${event.user_id}`;
    const prior = latest.get(key);
    if (!prior || event.created_at > prior.created_at
        || (event.created_at === prior.created_at && event.id > prior.id)) {
      latest.set(key, event);
    }
    if (event.verdict === "contacted" || event.verdict === "meeting") {
      const actions = durableActions.get(event.delivery_id) ?? new Set<string>();
      actions.add(event.verdict);
      durableActions.set(event.delivery_id, actions);
    }
  }
  const positiveByDelivery = new Map<string, boolean>();
  for (const event of latest.values()) {
    if (["worth_contacting", "contacted", "meeting"].includes(event.verdict)) {
      positiveByDelivery.set(event.delivery_id, true);
    }
  }
  const deliveryByCandidate = new Map(deliveries.map((row) => [row.candidate_id, row]));
  const bySource = new Map<string, {
    sourceKey: string; sourceKind: string; candidates: number;
    exclusiveCandidates: number; unreviewed: number; researching: number;
    rejected: number; delivered: number; customerAccepted: number; contacted: number;
  }>();
  let overlapCandidates = 0;
  let unattributedCandidates = 0;
  for (const candidate of candidates) {
    const keys = sourcesByCandidate.get(candidate.id);
    if (!keys?.size) {
      unattributedCandidates += 1;
      continue;
    }
    if (keys.size > 1) overlapCandidates += 1;
    for (const key of keys) {
      let bucket = bySource.get(key);
      if (!bucket) {
        bucket = {
          sourceKey: key, sourceKind: sourceKinds.get(key) ?? "unknown", candidates: 0,
          exclusiveCandidates: 0, unreviewed: 0, researching: 0, rejected: 0,
          delivered: 0, customerAccepted: 0, contacted: 0,
        };
        bySource.set(key, bucket);
      }
      bucket.candidates += 1;
      if (keys.size === 1) bucket.exclusiveCandidates += 1;
      bucket[candidate.status] += 1;
      const delivery = deliveryByCandidate.get(candidate.id);
      if (delivery) {
        if (positiveByDelivery.get(delivery.id) || durableActions.has(delivery.id)) {
          bucket.customerAccepted += 1;
        }
        if (durableActions.has(delivery.id)) bucket.contacted += 1;
      }
    }
  }
  return {
    newCandidateDomains: new Set(candidates.map((row) => row.domain)).size,
    overlapCandidates,
    unattributedCandidates,
    attribution: "Each source with an observation receives credit; source rows overlap and must not be summed.",
    sources: [...bySource.values()].sort((a, b) =>
      b.exclusiveCandidates - a.exclusiveCandidates || a.sourceKey.localeCompare(b.sourceKey)),
  };
}
