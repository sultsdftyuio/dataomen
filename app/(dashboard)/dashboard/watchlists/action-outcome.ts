import type { ProspectActionResult } from "../prospect-types";

export type OutcomeTone = "success" | "warning" | "danger";

export type ActionOutcome = {
  tone: OutcomeTone;
  title: string;
  description?: string;
  /** Show a link to the targeting brief, the only fix for some failures. */
  needsBrief?: boolean;
};

// The server actions in ../actions.ts return free-text messages written for
// operators ("Watchlist", HTTP codes, worker exceptions). They are not ours to
// change here, so these patterns sort a result into the few outcomes people
// need to act on, and the copy below replaces the raw message entirely.
const SCAN_NOT_STARTED = /\bbut\b|scan limit|not configured|unavailable|not accepted/i;
const SCAN_LIMIT = /scan limit/i;
const NEEDS_BRIEF = /approve a website matching brief/i;
const SIGN_IN = /sign in again/i;
const NOT_ACTIVE = /not active/i;
const PRO_REQUIRED = /\bpro\b/i;

const RETRY = "Check your connection and try again.";

function accessOutcome(result: ProspectActionResult, title: string): ActionOutcome | null {
  if (SIGN_IN.test(result.message)) {
    return { tone: "danger", title, description: "Your session ended. Sign in again, then retry." };
  }
  if (NEEDS_BRIEF.test(result.message)) {
    return {
      tone: "danger",
      title,
      description: "Approve your targeting brief first. Buyer groups search with it.",
      needsBrief: true,
    };
  }
  if (PRO_REQUIRED.test(result.message)) {
    return { tone: "danger", title, description: "Buyer groups are part of the Pro plan." };
  }
  return null;
}

function scanNotStarted(message: string): string {
  return SCAN_LIMIT.test(message)
    ? "This workspace has reached its scan limit for now. Try Scan again later."
    : "The scan service didn't respond. Use Scan again in a few minutes.";
}

/** Result of creating a group, from the form, the first-group setup or a suggestion. */
export function createOutcome(result: ProspectActionResult): ActionOutcome {
  if (result.ok) {
    // The action reports ok when the group saved but the scan trigger failed.
    if (SCAN_NOT_STARTED.test(result.message)) {
      return {
        tone: "warning",
        title: "Buyer group saved, but the scan didn't start",
        description: scanNotStarted(result.message),
      };
    }
    return {
      tone: "success",
      title: "Buyer group saved and scan started",
      description: "Arcli checks saved conversations first, then the group's public sources.",
    };
  }
  return (
    accessOutcome(result, "Couldn't save the buyer group") ?? {
      tone: "danger",
      title: "Couldn't save the buyer group",
      description: RETRY,
    }
  );
}

/** Result of "Scan again" or "Start scan" on an existing group. */
export function scanOutcome(result: ProspectActionResult): ActionOutcome {
  if (result.ok) {
    return {
      tone: "success",
      title: "Scan started",
      description: "Arcli checks saved conversations first, then the group's public sources.",
    };
  }
  if (NOT_ACTIVE.test(result.message)) {
    return { tone: "danger", title: "Couldn't start the scan", description: "This buyer group is paused. Resume it, then scan." };
  }
  return (
    accessOutcome(result, "Couldn't start the scan") ?? {
      tone: "danger",
      title: "Couldn't start the scan",
      description: scanNotStarted(result.message),
    }
  );
}

/** Result of pausing or resuming a group. */
export function activeOutcome(result: ProspectActionResult, isActive: boolean): ActionOutcome {
  if (result.ok) {
    return {
      tone: "success",
      title: isActive ? "Buyer group resumed" : "Buyer group paused",
      description: isActive
        ? "Use Scan again to look for new conversations."
        : "It won't be scanned until you resume it.",
    };
  }
  const title = isActive ? "Couldn't resume the buyer group" : "Couldn't pause the buyer group";
  return accessOutcome(result, title) ?? { tone: "danger", title, description: RETRY };
}

export function thrownOutcome(title: string): ActionOutcome {
  return { tone: "danger", title, description: RETRY };
}
