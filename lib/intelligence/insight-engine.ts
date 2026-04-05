// lib/intelligence/insight-engine.ts
import { KPI } from "./kpi-engine";

/**
 * -----------------------------------------------------------------------------
 * Insight Engine (Intelligence Layer)
 * -----------------------------------------------------------------------------
 * Evaluates semantic KPIs to detect anomalies, regressions, and hidden opportunities.
 * Generates prioritized, action-oriented intelligence payloads for the UI and AI.
 */

export type InsightCategory = "revenue" | "growth" | "churn" | "ops";
export type InsightDirection = "positive" | "negative" | "neutral";
export type InsightUrgency = "low" | "medium" | "high" | "critical";

export interface Insight {
  id: string;
  title: string;
  description: string;
  
  impact_score: number; // 0-100 scale; drives UI sorting and priority
  urgency: InsightUrgency;
  category: InsightCategory;
  direction: InsightDirection;

  stats: {
    label: string;
    value: string;
  }[];

  drivers?: string[]; // E.g., ["Red T-Shirts", "US-East"]
  related_kpis?: string[]; // IDs of related metrics for contextual queries
  suggested_questions: string[]; // Prompts injected into the Omniscient Scratchpad
}

export class InsightEngine {
  /**
   * Main orchestrator for insight generation. 
   * In a production environment, this merges heuristic thresholding with LLM anomaly detection.
   */
  public static evaluate(kpis: KPI[]): Insight[] {
    const insights: Insight[] = [];

    kpis.forEach((kpi) => {
      const insight = this.analyzeMetricVolatility(kpi);
      if (insight) insights.push(insight);
    });

    // Cross-metric blended analysis could be injected here (e.g., CAC vs LTV convergence)

    // Sort deterministically by impact score (highest priority first)
    return insights.sort((a, b) => b.impact_score - a.impact_score);
  }

  /**
   * Evaluates a single KPI against volatility heuristics to generate an Insight primitive.
   */
  private static analyzeMetricVolatility(kpi: KPI): Insight | null {
    const absDelta = Math.abs(kpi.delta.percentage);
    
    // Ignore statistical noise (e.g., < 3% variance)
    if (absDelta < 3.0) return null;

    const isRevenue = kpi.id.toLowerCase().includes("revenue") || kpi.id.toLowerCase().includes("mrr");
    const isChurn = kpi.id.toLowerCase().includes("churn");

    // 1. Critical Negative Scenario (e.g., Revenue drops > 10%)
    if (kpi.status === "critical" && kpi.delta.direction === "down" && isRevenue) {
      return {
        id: `ins_${kpi.id}_drop`,
        title: `${kpi.label} Contraction Detected`,
        description: `Revenue has contracted significantly compared to the previous period. Immediate investigation into regional performance or product-line drop-off is recommended.`,
        impact_score: this.calculateImpactScore(absDelta, 1.5),
        urgency: "critical",
        category: "revenue",
        direction: "negative",
        stats: [
          { label: "Variance", value: `${kpi.delta.direction === "down" ? "-" : "+"}${kpi.delta.absolute.toLocaleString()}` },
          { label: "Relative Shift", value: `${kpi.delta.percentage}%` }
        ],
        drivers: ["Anomaly detection pending"],
        related_kpis: [kpi.id],
        suggested_questions: [
          `Why did ${kpi.label} drop by ${kpi.delta.percentage}%?`,
          `Which cohort is responsible for the recent contraction in ${kpi.label}?`
        ]
      };
    }

    // 2. Critical Negative Scenario (e.g., Churn spikes > 5%)
    if (kpi.status === "critical" && kpi.delta.direction === "up" && isChurn) {
      return {
        id: `ins_${kpi.id}_spike`,
        title: `Abnormal Churn Velocity`,
        description: `Churn rate has escalated beyond standard deviation thresholds. Suggest querying recent support ticket volume or feature engagement.`,
        impact_score: this.calculateImpactScore(absDelta, 2.0), // Churn is highly weighted
        urgency: "critical",
        category: "churn",
        direction: "negative",
        stats: [
          { label: "Variance", value: `+${kpi.delta.percentage}%` }
        ],
        related_kpis: [kpi.id],
        suggested_questions: [
          `Analyze the underlying reasons for the churn spike.`,
          `Cross-reference the recent churn cohort with support ticket density.`
        ]
      };
    }

    // 3. Positive Opportunity Scenario (e.g., Growth > 15%)
    if (kpi.status === "good" && absDelta >= 15) {
      return {
        id: `ins_${kpi.id}_opp`,
        title: `Hidden Gain: ${kpi.label} Acceleration`,
        description: `A significant positive variance has been detected. Identifying the driving factors could present an immediate scaling opportunity.`,
        impact_score: this.calculateImpactScore(absDelta, 1.2),
        urgency: "medium",
        category: isRevenue ? "revenue" : "growth",
        direction: "positive",
        stats: [
          { label: "Uplift", value: `+${kpi.delta.absolute.toLocaleString()}` },
          { label: "Momentum", value: `${kpi.delta.percentage}%` }
        ],
        related_kpis: [kpi.id],
        suggested_questions: [
          `What are the primary drivers behind the ${kpi.delta.percentage}% uplift in ${kpi.label}?`,
          `Generate a breakdown of the top 3 attributes contributing to this acceleration.`
        ]
      };
    }

    return null;
  }

  /**
   * Calculates a weighted impact score (0-100) to ensure the UI ranks critical insights accurately.
   */
  private static calculateImpactScore(percentage: number, weightMultiplier: number): number {
    const rawScore = (percentage * weightMultiplier) * 2; // Baseline calibration
    return Math.min(Math.round(rawScore), 100); // Cap at 100
  }
}