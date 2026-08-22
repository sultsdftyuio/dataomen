import type { DiscoveryQuery } from "@/lib/discovery-queries";
import type { BuyerLanguageResearchView } from "@/lib/buyer-language-research";
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

/** The tenant-wide cooldown that protects website crawl quality and capacity. */
export type WebsiteCrawlCooldownView = {
  lastRequestedAt: string | null;
  nextAvailableAt: string | null;
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
 * A server action may be passed to the client once the optional research
 * worker is deployed. It deliberately receives no tenant or profile ID: the
 * action must resolve and authorize that scope on the server.
 */
export type BuyerLanguageResearchRequestAction = () => Promise<ProspectActionResult>;

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
