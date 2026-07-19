export type ServiceProfileFields = {
  target_audience: string[];
  core_problem: string;
  unique_value_prop: string;
  use_cases: string[];
  pain_points: string[];
  buying_triggers: string[];
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
  { value: "good_lead", label: "Good Lead" },
  { value: "bad_lead", label: "Bad Lead" },
  { value: "not_relevant", label: "Not Relevant" },
  { value: "wrong_audience", label: "Wrong Audience" },
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

export type QualifiedLeadView = {
  id: string;
  verifierScore: number;
  similarityScore: number | null;
  painDetected: string;
  matchReason: string;
  matchedAt: string | null;
  sourcePost: SourcePostView;
};

export type ProspectActionResult = {
  ok: boolean;
  message: string;
};
