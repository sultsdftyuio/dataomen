/**
 * ARCLI Intelligence System
 * Phase 5: AI Response Mapper
 * * Defines the canonical data models for AI UI triggers.
 * * Safely parses LLM outputs into deterministic, renderable components.
 */

// -----------------------------------------------------------------------------
// Canonical Data Models
// -----------------------------------------------------------------------------

export type KPI = {
  id: string;
  label: string;
  value: number;
  formatted: string;
  delta: {
    absolute: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
    comparisonLabel: string;
  };
  trend: number[]; // sparkline data
  status: "good" | "warning" | "critical";
  confidence?: number;
  meta?: {
    source: string;
    lastUpdated: string;
  };
};

export type Insight = {
  id: string;
  title: string;
  description: string;
  impact_score: number; // Drives UI priority (0-100)
  urgency: "low" | "medium" | "high" | "critical";
  category: "revenue" | "growth" | "churn" | "ops";
  direction: "positive" | "negative" | "neutral";
  stats: {
    label: string;
    value: string;
  }[];
  drivers?: string[];
  related_kpis?: string[];
  suggested_questions?: string[];
};

export type ChartConfig = {
  id: string;
  title: string;
  type: "bar" | "line" | "area" | "scatter";
  query: string; // The SQL or Semantic layer query to execute
  params?: Record<string, any>;
};

// -----------------------------------------------------------------------------
// The AI Response Union (UI Trigger System)
// -----------------------------------------------------------------------------

export type AIResponseBlock =
  | { type: "stat"; data: KPI }
  | { type: "insight"; data: Insight }
  | { type: "chart"; config: ChartConfig }
  | { type: "table"; data: any[] }
  | { type: "explanation"; text: string };

export type AIResponse = {
  blocks: AIResponseBlock[];
  suggestedFollowUps?: string[];
};

// -----------------------------------------------------------------------------
// Mapper & Parsing Engine
// -----------------------------------------------------------------------------

export class AIMapper {
  /**
   * Safely extracts and parses JSON arrays/objects from raw LLM text output.
   * Handles cases where the LLM wraps the response in markdown blocks like ```json ... ```
   */
  public static parseResponse(rawLlmOutput: string): AIResponse {
    try {
      // Clean up potential markdown formatting
      let cleaned = rawLlmOutput.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
      }

      const parsed = JSON.parse(cleaned);

      // Validate base structure to prevent runtime UI crashes
      if (!parsed || !Array.isArray(parsed.blocks)) {
        return this.fallbackExplanation("Received an invalid response format from the intelligence engine.");
      }

      return parsed as AIResponse;
    } catch (error) {
      console.error("[AIMapper] Failed to parse LLM response:", error);
      return this.fallbackExplanation(
        "I analyzed the data, but encountered an issue formatting the results for the dashboard. Please try rephrasing your request."
      );
    }
  }

  /**
   * Generates a context snapshot to inject into the LLM prompt.
   * Ensures the AI knows exactly what the user is currently looking at.
   */
  public static buildContextSnapshot(
    activeConnector: string,
    visibleKpis: Partial<KPI>[],
    activeChartIds: string[]
  ): string {
    return JSON.stringify({
      context: "OmniscientScratchpad",
      connector: activeConnector,
      timestamp: new Date().toISOString(),
      viewport: {
        visible_kpis: visibleKpis.map(k => ({ label: k.label, status: k.status, value: k.formatted })),
        active_charts: activeChartIds,
      },
      instructions: "Generate UI blocks (stat, insight, chart, table, explanation) based on this state."
    });
  }

  private static fallbackExplanation(text: string): AIResponse {
    return {
      blocks: [{ type: "explanation", text }],
      suggestedFollowUps: ["Can you show me the raw data instead?"],
    };
  }
}