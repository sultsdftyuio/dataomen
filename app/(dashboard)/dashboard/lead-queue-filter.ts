import type { QualifiedLeadView } from "./prospect-types";

/**
 * The lead inbox is intentionally narrower than the audit trail. Rejected
 * matches remain inspectable, but must never be presented as actionable
 * prospect signals by the default view.
 */
export type LeadQueueFilter = "all" | "leads" | "potential" | "screened";

export function isPotentialBuyer(lead: QualifiedLeadView): boolean {
  return lead.matchStatus === "discovery_candidate";
}

export function isScreenedMatch(lead: QualifiedLeadView): boolean {
  return lead.matchStatus === "rejected";
}

export function isVerifiedLead(lead: QualifiedLeadView): boolean {
  return lead.matchStatus === "ready_for_review" || lead.matchStatus === "qualified";
}

/**
 * "All" means every actionable inbox signal, not every persisted match.
 * The separate screened filter is the explicit audit route for rejections.
 */
export function matchesLeadQueueFilter(
  lead: QualifiedLeadView,
  filter: LeadQueueFilter,
): boolean {
  if (filter === "screened") return isScreenedMatch(lead);
  if (isScreenedMatch(lead)) return false;
  if (filter === "leads") return isVerifiedLead(lead);
  if (filter === "potential") return isPotentialBuyer(lead);
  return true;
}
