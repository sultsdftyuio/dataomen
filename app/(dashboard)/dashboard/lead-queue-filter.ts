import type { QualifiedLeadView } from "./prospect-types";

/**
 * The lead inbox is intentionally narrower than the audit trail. Rejected
 * matches remain inspectable, but must never be presented as actionable
 * prospect signals by the default view.
 */
export type LeadQueueFilter = "all" | "leads" | "potential" | "screened" | "done";

export function isPotentialBuyer(lead: QualifiedLeadView): boolean {
  return lead.matchStatus === "discovery_candidate";
}

export function isScreenedMatch(lead: QualifiedLeadView): boolean {
  return lead.matchStatus === "rejected";
}

export function isVerifiedLead(lead: QualifiedLeadView): boolean {
  return lead.matchStatus === "ready_for_review" || lead.matchStatus === "qualified";
}

/** A person marked this lead handled; it leaves the inbox but stays findable. */
export function isHandledLead(lead: QualifiedLeadView): boolean {
  return Boolean(lead.handledAt);
}

/**
 * "All" means every actionable inbox signal that still needs attention, not
 * every persisted match. Screened records and handled leads each have their
 * own explicit view so the inbox can actually reach zero.
 */
export function matchesLeadQueueFilter(
  lead: QualifiedLeadView,
  filter: LeadQueueFilter,
): boolean {
  if (filter === "screened") return isScreenedMatch(lead);
  if (isScreenedMatch(lead)) return false;
  if (filter === "done") return isHandledLead(lead);
  if (isHandledLead(lead)) return false;
  if (filter === "leads") return isVerifiedLead(lead);
  if (filter === "potential") return isPotentialBuyer(lead);
  return true;
}

// The three user-facing buckets. Keep these words identical everywhere so
// people learn one vocabulary instead of decoding synonyms.
export function leadCategoryLabel(lead: QualifiedLeadView): "Lead" | "Maybe" | "Screened out" {
  if (isScreenedMatch(lead)) return "Screened out";
  return isPotentialBuyer(lead) ? "Maybe" : "Lead";
}
