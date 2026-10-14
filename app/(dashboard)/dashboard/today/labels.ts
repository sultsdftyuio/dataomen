import { CalendarClock, MessageCircleQuestion, Target, type LucideIcon } from "lucide-react";

import type { StatusTone } from "@/components/ui/status-badge";

import type { AssistedProspect, ProspectVerdict } from "./data";

// One vocabulary for the queue, used by the filters, rows, file and empty
// states. Bucket names deliberately differ from verdict names ("Passed", not
// "Not now") so a "Wrong fit" prospect never sits under a tab named after
// another verdict.

export type StatusFilter = "to_review" | "pursuing" | "passed" | "all";
export type TierFilter = "all" | AssistedProspect["tier"];
export type Tier = AssistedProspect["tier"];

export const statusFilters: StatusFilter[] = ["to_review", "pursuing", "passed", "all"];
export const tierFilters: TierFilter[] = ["all", "direct_intent", "timely", "high_fit"];

export const statusLabels: Record<StatusFilter, string> = {
  to_review: "To review",
  pursuing: "Pursuing",
  passed: "Passed",
  all: "All",
};

export const tierLabels: Record<Tier, string> = {
  direct_intent: "Buyer intent",
  timely: "Timely",
  high_fit: "Strong fit",
};

export const tierIcons: Record<Tier, LucideIcon> = {
  direct_intent: MessageCircleQuestion,
  timely: CalendarClock,
  high_fit: Target,
};

export const tierDescriptions: Record<Tier, string> = {
  direct_intent: "Someone there asked in public for what you offer.",
  timely: "A recent event there makes your offer timely.",
  high_fit: "A strong fit on public evidence, with no buying signal yet.",
};

export const verdictLabels: Record<ProspectVerdict, string> = {
  worth_contacting: "Worth contacting",
  contacted: "Contacted",
  meeting: "Meeting booked",
  not_now: "Not now",
  wrong_fit: "Wrong fit",
  already_known: "Already known",
  no_route: "No usable route",
  bad_evidence: "Bad evidence",
};

/** Positive verdicts in the order a prospect moves through them. */
export const pursuingVerdicts: ProspectVerdict[] = ["worth_contacting", "contacted", "meeting"];
/** Reasons for passing; "Not now" first because it is the mildest. */
export const passVerdicts: ProspectVerdict[] = ["not_now", "wrong_fit", "already_known", "no_route", "bad_evidence"];

export function bucketFor(verdict: ProspectVerdict | null): Exclude<StatusFilter, "all"> {
  if (verdict === null) return "to_review";
  return pursuingVerdicts.includes(verdict) ? "pursuing" : "passed";
}

export function verdictTone(verdict: ProspectVerdict): StatusTone {
  return bucketFor(verdict) === "pursuing" ? "success" : "neutral";
}

export const entityKindLabels: Record<AssistedProspect["entity_kind"], string> = {
  account: "Company",
  builder: "Developer",
  project: "Open-source project",
};

/** Button copy for each contact route: it says what opens. */
export const routeActionLabels: Record<AssistedProspect["contact_route_type"], string> = {
  public_reply: "Open the public thread",
  business_contact: "Open the company's contact page",
  licensed_business_route: "Open licensed contact details",
};

export function nameFor(prospect: AssistedProspect): string {
  return prospect.entity_title || hostLabel(prospect.entity_url);
}

/** "reddit.com" from a full URL, without "www.". Falls back to the raw value. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
