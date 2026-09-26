import type { DiscoveryQuery } from "@/lib/discovery-queries";
import type { BuyerLanguageResearchView } from "@/lib/buyer-language-research";
import type { TargetType } from "@/lib/targeting-brief";
import type {
  BuyerDemandPattern,
  DiscoverySourceProgressView,
  DiscoveryRunSummaryView,
} from "@/lib/buyer-demand-report";

export type ServiceProfileFields = {
  target_audience: string[];
  core_problem: string;
  unique_value_prop: string;
  use_cases: string[];
  pain_points: string[];
  buying_triggers: string[];
  urgency_signals: string[];
  discovery_queries: DiscoveryQuery[];
  search_terms: string[];
  /** Named alternatives to monitor for complaints and switching intent. */
  competitor_terms: string[];
  negative_keywords: string[];
  excluded_audiences: string[];
};

export type ServiceProfileView = {
  id: string | null;
  hasProfile: boolean;
  status: string | null;
  extractionStatus: string | null;
  embeddingStatus: string | null;
  embeddingFailureReason: string | null;
  embeddingGeneratedAt: string | null;
  websiteUrl: string | null;
  updatedAt: string | null;
  fields: ServiceProfileFields;
  rawProfile: Record<string, unknown> | null;
};

export type CrawlJobView = {
  id: string | null;
  status: string | null;
  phase: string | null;
  failureReason: string | null;
  errorType: string | null;
  errorMessage: string | null;
  lastHeartbeatAt: string | null;
  updatedAt: string | null;
};

export const FEEDBACK_OPTIONS = [
  { value: "good_fit", label: "Good fit" },
  { value: "useful_pain_not_now", label: "Useful pain, not now" },
  { value: "wrong_buyer", label: "Wrong buyer" },
  { value: "not_relevant", label: "Not Relevant" },
  { value: "spam", label: "Spam" },
] as const;

export type LeadFeedbackValue = (typeof FEEDBACK_OPTIONS)[number]["value"];

export type SourcePostView = {
  title: string;
  text: string;
  source: string;
  author: string | null;
  community: string | null;
  url: string | null;
  publishedAt: string | null;
};

/**
 * `ready_for_review` is set after the LLM verifies a prospect. `qualified`
 * is reserved for the explicit, human-triggered CRM qualification action.
 */
export type LeadMatchStatus =
  | "ready_for_review"
  | "discovery_candidate"
  | "qualified"
  | "rejected";

export type QualifiedLeadView = {
  id: string;
  matchStatus: LeadMatchStatus;
  verifierScore: number;
  similarityScore: number | null;
  painDetected: string;
  painTheme: string | null;
  signalType: string | null;
  urgencyLevel: string | null;
  /** Present only when it is a literal normalized substring of source text. */
  urgencyReason: string | null;
  /** The raw text is retained separately in `sourcePost.text`. */
  evidenceExcerpt: string | null;
  /** A cautious conversation-stage estimate; it does not affect ranking. */
  purchaseStage: string | null;
  /** A direct product or vendor name from the source text, when present. */
  competitorMention: string | null;
  matchReason: string;
  suggestedReply: string;
  matchedAt: string | null;
  sourcePost: SourcePostView;
};

/** A customer-owned buyer group layered on the website-derived profile. */
export type WatchlistView = {
  id: string;
  name: string;
  targetBuyer: string;
  problemToSolve: string;
  includeTerms: string[];
  excludeTerms: string[];
  sourcePreferences: string[];
  suggestedPlaces: string[];
  isActive: boolean;
  embeddingStatus: string | null;
  scanStatus: string | null;
  lastScanAt: string | null;
  lastScanError: string | null;
};

export type WatchlistResultsView = {
  watchlistId: string;
  readyToAct: QualifiedLeadView[];
  discoveryCandidates: QualifiedLeadView[];
};

export type BuyerDemandReportView = {
  id: string;
  status: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  isCompleted: boolean;
  isTerminal: boolean;
  summary: DiscoveryRunSummaryView;
  sourceProgress: DiscoverySourceProgressView[];
  marketPatterns: BuyerDemandPattern[];
};

export type ProspectActionResult = {
  ok: boolean;
  message: string;
};

/**
 * Target discovery starts with an entity that may be a company, independent
 * builder, or public project. A company relationship is useful context, but
 * is never required to show a target in the desk.
 */
export type ProspectTargetEntityKind = TargetType;

/**
 * These are evidence-backed research states, not purchase-probability bands.
 * In particular, `high_fit` is useful for prioritising research but does not
 * mean that the target has expressed demand.
 */
export type TargetAssessmentState =
  | "high_fit"
  | "triggered"
  | "signal_backed"
  | "strong_buyer_signal"
  | "rejected";

export type TargetEvidenceKind =
  | "fit"
  | "trigger"
  | "problem"
  | "evaluation"
  | "relationship";

/**
 * How confidently a public observation is attributable to the target. Guesses
 * remain visible as lower-confidence context and cannot justify a strong
 * buyer-signal claim. The server maps accepted evidence quality into this
 * display-safe vocabulary.
 */
export type TargetEntityLinkConfidence = "verified" | "likely" | "unverified";

/**
 * Evidence is visible for human review before it can affect an assessment.
 * Rejected observations are intentionally omitted from the desk projection so
 * the review surface does not treat them as usable research context.
 */
export type TargetEvidenceReviewStatus = "pending" | "accepted";

export type TargetEvidenceReviewDecision = "accepted" | "rejected";

export type TargetEvidenceView = {
  id: string;
  kind: TargetEvidenceKind;
  summary: string;
  excerpt: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
  entityLinkConfidence: TargetEntityLinkConfidence;
  reviewStatus: TargetEvidenceReviewStatus;
};

/**
 * A display-safe handoff state for an entity-first opportunity. It remains
 * separate from `lead_matches`, whose lifecycle is owned by public-post
 * verification. Neither state implies that Arcli sent outreach or a CRM call.
 */
export type TargetOpportunityStatus = {
  id: string;
  status: "ready_for_review" | "qualified" | "invalidated";
  createdAt: string | null;
  qualifiedAt: string | null;
};

/**
 * A tenant-scoped, display-safe target projection. Server code owns entity
 * resolution, scoring, evidence limits, and all source access; the browser
 * receives only the assessed target and cited public observations needed for
 * human review.
 */
export type ProspectTargetView = {
  id: string;
  /** Absent only in older callers during a partial additive-contract rollout. */
  assessmentId?: string | null;
  entityKind: ProspectTargetEntityKind;
  displayName: string;
  subtitle: string | null;
  canonicalUrl: string | null;
  assessmentState: TargetAssessmentState;
  assessmentReasons: string[];
  assessedAt: string | null;
  evidence: TargetEvidenceView[];
  /** Optional retained-corpus monitor projection; no URL, query, or run ID. */
  monitoring?: TargetMonitoringStatus | null;
  /** Optional human-created opportunity projection; no reviewer or CRM data. */
  opportunity?: TargetOpportunityStatus | null;
};

/** A server-owned website hypothesis can be activated without trusting browser-supplied buyer text. */
export type BuyerGroupActivationAction = (
  suggestionId: string,
) => Promise<ProspectActionResult>;

/**
 * A server action may be passed to the client once the optional research
 * worker is deployed. It deliberately receives no tenant or profile ID: the
 * action must resolve and authorize that scope on the server.
 */
export type BuyerLanguageResearchRequestAction = () => Promise<ProspectActionResult>;

/**
 * Reviewing evidence is intentionally narrower than a lead or CRM action.
 * The server resolves tenant ownership and only permits a pending observation
 * to move to a terminal accepted or rejected state.
 */
export type TargetEvidenceReviewAction = (
  evidenceId: string,
  decision: TargetEvidenceReviewDecision,
) => Promise<ProspectActionResult>;

/**
 * Target feedback records a human workflow outcome, not an automatic CRM
 * mutation. The server derives tenant ownership from the assessment ID.
 */
export const TARGET_FEEDBACK_OPTIONS = [
  { value: "target", label: "Keep targeting" },
  { value: "not_relevant", label: "Not relevant" },
  { value: "contacted", label: "Contacted" },
  { value: "meeting", label: "Meeting" },
  { value: "won", label: "Won" },
] as const;

export type TargetFeedbackValue = (typeof TARGET_FEEDBACK_OPTIONS)[number]["value"];

export type TargetFeedbackAction = (
  assessmentId: string,
  feedback: TargetFeedbackValue,
) => Promise<ProspectActionResult>;

/** A display-safe state for a target that a workspace explicitly chose to watch. */
export type TargetMonitoringStatus = {
  status: "active" | "paused";
  nextRefreshAt: string | null;
  lastDispatchedAt: string | null;
};

/**
 * The server resolves the target from an assessment. The browser cannot
 * choose a tenant, profile, source, cadence, URL, or source locator.
 */
export type TargetMonitoringAction = (
  assessmentId: string,
  enabled: boolean,
) => Promise<ProspectActionResult>;

/**
 * These are intentionally two user decisions: creation binds accepted cited
 * evidence to an opportunity; qualification may then start one optional CRM
 * delivery. The browser cannot supply a tenant, target URL, source, contact,
 * CRM destination, or score.
 */
export type TargetOpportunityCreateAction = (
  assessmentId: string,
  evidenceId: string,
) => Promise<ProspectActionResult>;

export type TargetOpportunityQualifyAction = (
  opportunityId: string,
) => Promise<ProspectActionResult>;

/**
 * Display-only lifecycle projection for an explicit target research operation.
 * Run IDs, worker leases, errors, source records, queries, and URLs remain
 * server-owned; the desk only needs enough state to avoid promising results
 * before a bounded worker has finished.
 */
export type EntityResearchRunKind = "candidate_generation" | "evidence_collection";

export type EntityResearchRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "skipped";

export type EntityResearchRunView = {
  kind: EntityResearchRunKind;
  status: EntityResearchRunStatus;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

/**
 * These actions receive no browser-supplied scope. The server resolves the
 * current approved profile and, for evidence, a capped current target set.
 */
export type EntityResearchAction = () => Promise<ProspectActionResult>;

/** Aggregate-only view used to make calibration readiness visible. */
export type TargetFeedbackSummaryType =
  | TargetFeedbackValue
  | "promote_to_opportunity"
  | "useful_not_now"
  | "monitor"
  | "lost";

export type TargetFeedbackSummary = {
  feedbackType: TargetFeedbackSummaryType;
  feedbackCount: number;
  targetCount: number;
  latestFeedbackAt: string | null;
};

export type WatchlistCreateInput = {
  name: string;
  targetBuyer: string;
  problemToSolve: string;
  includeTerms: string[];
  excludeTerms: string[];
  sourcePreferences: string[];
  suggestedPlaces: string[];
};

export type WatchlistAction = (
  input: WatchlistCreateInput,
) => Promise<ProspectActionResult>;

export type { BuyerLanguageResearchView };
