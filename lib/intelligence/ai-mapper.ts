// lib/intelligence/ai-mapper.ts

import { KPI } from "@/lib/intelligence/kpi-engine";
import { Insight } from "@/lib/intelligence/insight-engine";

/**
 * -----------------------------------------------------------------------------
 * ARCLI Intelligence System
 * Phase 5: AI Response Mapper & UI Orchestrator
 * -----------------------------------------------------------------------------
 * Translates non-deterministic LLM text outputs into strict, canonical UI blocks.
 * Acts as a firewall between the LLM and the React rendering layer to prevent crashes.
 */

// -----------------------------------------------------------------------------
// Canonical UI Action Models
// -----------------------------------------------------------------------------

export interface ChartConfig {
  id: string;
  title: string;
  type: "bar" | "line" | "area" | "scatter" | "donut";
  query: string; // The DuckDB SQL or Semantic layer query to execute
  params?: Record<string, any>;
  dimensions: {
    xAxis: string;
    yAxis: string;
    groupBy?: string;
  };
}

// -----------------------------------------------------------------------------
// The AI Response Union (Dynamic UI Triggers)
// -----------------------------------------------------------------------------

export type AIResponseBlock =
  | { type: "stat"; data: KPI }
  | { type: "insight"; data: Insight }
  | { type: "chart"; config: ChartConfig }
  | { type: "table"; data: any[] }
  | { type: "explanation"; text: string };

export interface AIResponse {
  blocks: AIResponseBlock[];
  suggestedFollowUps?: string[];
  sql_used?: string; // Appears in the DuckDB SQL Trace UI
}

// -----------------------------------------------------------------------------
// Mapper & Parsing Engine
// -----------------------------------------------------------------------------

export class AIMapper {
  /**
   * Safely extracts, parses, and sanitizes JSON from raw LLM text output.
   * Tolerates markdown wrapping and conversational filler (e.g., "Here is your data: {...}").
   */
  public static parseResponse(rawLlmOutput: string): AIResponse {
    if (!rawLlmOutput || rawLlmOutput.trim() === "") {
      return this.fallbackExplanation("The analytical engine returned an empty response.");
    }

    try {
      // 1. Extract JSON Payload via Regex (Handles conversational filler)
      const jsonMatch = rawLlmOutput.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        // If the LLM just returned pure text instead of JSON, wrap it in an explanation block
        return {
          blocks: [{ type: "explanation", text: rawLlmOutput.trim() }],
        };
      }

      // 2. Parse the extracted JSON
      const parsed = JSON.parse(jsonMatch[0]);

      // 3. Structural Validation (Firewalling React)
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Parsed output is not a valid JSON object.");
      }

      // 4. Sanitize and construct the canonical response
      const response: AIResponse = {
        blocks: Array.isArray(parsed.blocks) 
          ? this.sanitizeBlocks(parsed.blocks) 
          : [{ type: "explanation", text: parsed.reply || parsed.content || "Analysis complete." }],
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps) 
          ? parsed.suggestedFollowUps.slice(0, 3) // Cap at 3 for UI cleanliness
          : undefined,
        sql_used: parsed.sql_used || parsed.query || undefined,
      };

      // Fallback if sanitization stripped everything
      if (response.blocks.length === 0) {
        return this.fallbackExplanation("The generated UI blocks were structurally invalid and blocked by the UI firewall.");
      }

      return response;

    } catch (error) {
      console.error("[AIMapper] Failed to parse LLM response:", error);
      return this.fallbackExplanation(
        "I analyzed the data, but encountered an issue formatting the structural results for the dashboard. Please try rephrasing your analytical parameters."
      );
    }
  }

  /**
   * Generates a deterministic context snapshot to inject into the LLM system prompt.
   * Ensures the AI knows exactly what the user is currently looking at (Phase 7 Principle).
   */
  public static buildContextSnapshot(
    activeConnector: string,
    visibleKpis: Partial<KPI>[],
    activeChartIds: string[]
  ): string {
    return JSON.stringify({
      system_state: {
        active_connector: activeConnector,
        timestamp: new Date().toISOString(),
      },
      viewport: {
        visible_kpis: visibleKpis.map(k => ({ 
          id: k.id, 
          label: k.label, 
          status: k.status, 
          value: k.formatted 
        })),
        active_charts: activeChartIds,
      },
      output_schema: "You must return a JSON object with a 'blocks' array. Valid block types: 'stat', 'insight', 'chart', 'table', 'explanation'.",
    });
  }

  /**
   * Internal Type Guard & Sanitizer. 
   * Strips out hallucinated UI blocks or blocks missing critical rendering data.
   */
  private static sanitizeBlocks(blocks: any[]): AIResponseBlock[] {
    return blocks.filter((block): block is AIResponseBlock => {
      if (!block || !block.type) return false;

      switch (block.type) {
        case "stat":
          return !!(block.data && block.data.id && block.data.value !== undefined);
        case "insight":
          return !!(block.data && block.data.title && block.data.urgency);
        case "chart":
          return !!(block.config && block.config.query && block.config.dimensions);
        case "table":
          return !!(block.data && Array.isArray(block.data));
        case "explanation":
          return !!(block.text && typeof block.text === "string");
        default:
          return false; // Drop hallucinated block types
      }
    });
  }

  /**
   * Graceful fallback generator for fatal parsing errors.
   */
  private static fallbackExplanation(text: string): AIResponse {
    return {
      blocks: [{ type: "explanation", text }],
      suggestedFollowUps: [
        "Can you show me the raw data instead?",
        "Summarize the recent anomalies."
      ],
    };
  }
}