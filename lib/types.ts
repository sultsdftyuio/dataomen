// types.ts

export interface RiskUser {
  id: string;
  email: string;
  riskScore: number;
  signal: string;
  lastActive: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  type: string;
  campaign_type?: string;
  body_html?: string | null;
  body_text?: string | null;
  is_active?: boolean;
}

export interface CampaignsClientProps {
  atRiskUsers: RiskUser[];
  emailTemplates: EmailTemplate[];
  // Injected from the server page to enforce the "Proper Email Address" rule
  initialSenderEmail?: string | null;
  initialCompanyName?: string | null;
  initialFullName?: string | null;
  isProTier?: boolean;
  planTier?: string | null;
  subscriptionStatus?: string | null;
  restrictionMessage?: string | null;
}

// Strict anchored regex perfectly synchronized with backend validation
export const SENDER_EMAIL_REGEX =
  /^(?:[^<>]+<[^<>\s]+@[^<>\s]+\.[^<>\s]+>|[^<>\s]+@[^<>\s]+\.[^<>\s]+)$/;

// Pre-computed badge constants to avoid recreating objects every render
export const RISK_BADGE_HIGH = {
  variant: "destructive" as const,
  className: "bg-red-500 hover:bg-red-600 shadow-sm",
};

export const RISK_BADGE_MEDIUM = {
  variant: "secondary" as const,
  className:
    "bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200 shadow-sm",
};

export const RISK_BADGE_LOW = {
  variant: "secondary" as const,
  className:
    "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200 shadow-sm",
};

export const RISK_BADGE_DEFAULT = {
  variant: "secondary" as const,
  className: "shadow-sm",
};

export function getRiskBadgeProps(score: number) {
  if (score >= 95) return RISK_BADGE_HIGH;
  if (score >= 80) return RISK_BADGE_MEDIUM;
  if (score >= 60) return RISK_BADGE_LOW;
  return RISK_BADGE_DEFAULT;
}
