// lib/intelligence/insight-engine.ts
import { KPI } from "@/lib/intelligence/kpi-engine";

/**
 * -----------------------------------------------------------------------------
 * Insight Engine (Action & Intelligence Layer)
 * -----------------------------------------------------------------------------
 * Deterministic rules-engine that evaluates semantic KPIs to extract high-leverage 
 * anomalies, regressions, and hidden opportunities. It outputs prioritized payloads 
 * designed to feed directly into the Executive Insights Feed and Omniscient Scratchpad.
 */

export type InsightCategory = "revenue" | "growth" | "churn" | "ops";
export type InsightDirection = "positive" | "negative" | "neutral";
export type InsightUrgency = "low" | "medium" | "high" | "critical";

export interface Insight {
  id: string;
  title: string;
  description: string;
  
  impact_score: number; // 0-100 scale; dictates analytical grid sorting
  urgency: InsightUrgency;
  category: InsightCategory;
  direction: InsightDirection;

  stats: {
    label: string;
    value: string;
  }[];

  drivers?: string[]; 
  related_kpis?: string[]; 
  suggested_questions?: string[]; 
}

export class InsightEngine {
  /**
   * Main orchestrator for insight generation. 
   * Maps over canonical KPIs, applies deterministic heuristic thresholding, 
   * and ranks the intelligence strictly by impact score.
   */
  public static evaluate(kpis: KPI[]): Insight[] {
    if (!kpis || kpis.length === 0) return [];

    const insights = kpis
      .map(kpi => this.analyzeMetricVolatility(kpi))
      .filter((insight): insight is Insight => insight !== null);

    // Cross-metric heuristic blending (e.g., Revenue drops while Spend goes up)
    // Future Phase: this.injectBlendedInsights(insights, kpis);

    // Deterministic sort: Highest impact score first, prioritizing critical warnings
    return insights.sort((a, b) => b.impact_score - a.impact_score);
  }

  /**
   * Evaluates a single KPI against volatility heuristics to generate an Insight primitive.
   */
  private static analyzeMetricVolatility(kpi: KPI): Insight | null {
    const absDelta = Math.abs(kpi.delta.percentage);
    
    // Ignore statistical noise (e.g., < 3% variance)
    if (absDelta < 3.0) return null;

    const category = this.determineCategory(kpi.id);
    const isFavorable = kpi.status === "good";
    const isUnfavorable = kpi.status === "critical" || kpi.status === "warning";

    // -------------------------------------------------------------------------
    // 1. Critical Contractions (Negative Impact)
    // -------------------------------------------------------------------------
    if (isUnfavorable && kpi.delta.direction === "down") {
      return {
        id: `ins_${kpi.id}_contraction`,
        title: `${kpi.label} Contraction Detected`,
        description: `This metric has contracted by ${kpi.delta.percentage}% compared to the previous period. Immediate investigation into underlying drivers is recommended.`,
        impact_score: this.calculateImpactScore(absDelta, 1.5),
        urgency: absDelta > 15 ? "critical" : "high",
        category,
        direction: "negative",
        stats: [
          { label: "Variance", value: `${kpi.delta.absolute > 0 ? "+" : ""}${kpi.delta.absolute.toLocaleString()}` },
          { label: "Relative Shift", value: `${kpi.delta.percentage}%` }
        ],
        drivers: ["Awaiting LLM anomaly detection"],
        related_kpis: [kpi.id],
        suggested_questions: [
          `Why did ${kpi.label} drop by ${kpi.delta.percentage}%?`,
          `Which cohort is responsible for the recent contraction in ${kpi.label}?`
        ]
      };
    }

    // -------------------------------------------------------------------------
    // 2. Critical Escalations (E.g., Churn / Ops Costs Spiking)
    // -------------------------------------------------------------------------
    if (isUnfavorable && kpi.delta.direction === "up") {
      return {
        id: `ins_${kpi.id}_spike`,
        title: `Abnormal ${kpi.label} Velocity`,
        description: `This metric is escalating beyond standard deviation thresholds. Suggest querying related operational metrics to identify the root cause.`,
        impact_score: this.calculateImpactScore(absDelta, 1.8), // Spikes in negative metrics are weighted heavily
        urgency: "critical",
        category,
        direction: "negative",
        stats: [
          { label: "Variance", value: `+${kpi.delta.percentage}%` }
        ],
        related_kpis: [kpi.id],
        suggested_questions: [
          `Analyze the underlying reasons for the ${kpi.label} spike.`,
          `Cross-reference the recent cohort with support ticket density.`
        ]
      };
    }

    // -------------------------------------------------------------------------
    // 3. Positive Opportunities / Accelerations
    // -------------------------------------------------------------------------
    if (isFavorable && absDelta >= 10) {
      return {
        id: `ins_${kpi.id}_opp`,
        title: `Hidden Gain: ${kpi.label} Acceleration`,
        description: `A significant positive variance has been detected. Identifying the driving factors could present an immediate scaling opportunity.`,
        impact_score: this.calculateImpactScore(absDelta, 1.2),
        urgency: "medium",
        category,
        direction: "positive",
        stats: [
          { label: "Uplift", value: `${kpi.delta.absolute > 0 ? "+" : ""}${kpi.delta.absolute.toLocaleString()}` },
          { label: "Momentum", value: `${kpi.delta.direction === "up" ? "+" : "-"}${absDelta}%` }
        ],
        related_kpis: [kpi.id],
        suggested_questions: [
          `What are the primary drivers behind the ${absDelta}% improvement in ${kpi.label}?`,
          `Generate a breakdown of the top attributes contributing to this acceleration.`
        ]
      };
    }

    return null;
  }

  /**
   * Deterministic categorization based on canonical semantic naming conventions.
   */
  private static determineCategory(metricId: string): InsightCategory {
    const id = metricId.toLowerCase();
    if (id.includes("revenue") || id.includes("mrr") || id.includes("arr") || id.includes("sales")) return "revenue";
    if (id.includes("churn") || id.includes("attrition") || id.includes("cancellation")) return "churn";
    if (id.includes("ticket") || id.includes("latency") || id.includes("cost") || id.includes("spend")) return "ops";
    return "growth"; // Default to growth for active users, signups, etc.
  }

  /**
   * Calculates a weighted impact score (0-100) using a logarithmic scale 
   * to prevent rapid plateauing at 100 for moderate variances.
   */
  private static calculateImpactScore(percentage: number, weightMultiplier: number): number {
    // Base score uses log2 to smooth the curve. e.g., 10% delta -> log2(11) * 15 ≈ 51. 
    const rawScore = Math.log2(percentage + 1) * 15 * weightMultiplier;
    return Math.min(Math.round(rawScore), 100);
  }
}