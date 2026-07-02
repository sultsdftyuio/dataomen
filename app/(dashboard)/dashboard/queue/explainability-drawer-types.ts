"use client";

import { format } from "date-fns";

// Phase 1 Schema Alignment
import type { CustomerOperation } from "./risk-queue-client";

// ─── Constants ─────────────────────────────────────────────────
export const MIN_REASON_LENGTH = 10;
export const HIGH_RISK_THRESHOLD = 70;

// ─── Deterministic Explainability Types ─────────────────────────
export type RiskFactor = {
  id: string;
  factor: string;
  weight: number;
  order_index: number;
};

export type CampaignEvent = {
  id: string;
  name: string;
  date: string;
  status: 'delivered' | 'opened' | 'bounced' | 'suppressed' | 'dead_lettered' | 'clicked' | 'replied';
};

export type ManualIntervention = {
  id: string;
  action: string;
  operator_name: string;
  date: string;
  notes?: string;
};

export type ExplainabilityData = {
  factors: RiskFactor[];
  baseline_score: number;
  campaign_history: CampaignEvent[];
  manual_interventions: ManualIntervention[];
};

export interface ExplainabilityDrawerProps {
  item: CustomerOperation | null;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helper: Campaign Status Badge ──────────────────────────────
export const getCampaignStatusColor = (status: CampaignEvent["status"]) => {
  const map: Record<CampaignEvent["status"], string> = {
    delivered: "bg-blue-100 text-blue-800 border-blue-200",
    opened: "bg-emerald-100 text-emerald-800 border-emerald-200",
    clicked: "bg-emerald-100 text-emerald-800 border-emerald-200",
    replied: "bg-purple-100 text-purple-800 border-purple-200",
    bounced: "bg-red-100 text-red-800 border-red-200",
    suppressed: "bg-slate-100 text-slate-800 border-slate-200",
    dead_lettered: "bg-orange-100 text-orange-800 border-orange-200",
  };
  return map[status];
};