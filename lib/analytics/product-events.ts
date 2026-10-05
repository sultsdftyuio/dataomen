import { track } from "@vercel/analytics";

/**
 * Activation funnel for the prospect dashboard: did people open a lead, take
 * the reply, and qualify it? Event names are a fixed union so dashboards
 * don't fragment across typos.
 *
 * Properties must never include post text, authors, URLs, or anything else
 * that identifies a person; bucket and source name are enough to segment.
 */
export type ProductEvent =
  | "lead_review_opened"
  | "reply_copied"
  | "lead_qualified"
  | "lead_feedback_given"
  | "lead_marked_done"
  | "email_updates_enabled"
  | "free_scan_viewed";

export type ProductEventProps = Record<string, string | number | boolean | null>;

export function trackProductEvent(name: ProductEvent, props?: ProductEventProps) {
  try {
    track(name, props);
  } catch {
    // Analytics must never break the workflow it is measuring.
  }
}
