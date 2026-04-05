// lib/intelligence/kpi-engine.ts

/**
 * -----------------------------------------------------------------------------
 * KPI Extraction Engine
 * -----------------------------------------------------------------------------
 * Transforms raw semantic view data into structured, deterministic KPI primitives.
 * This is the foundational intelligence layer that feeds the Executive UI and AI models.
 */

export interface KPI {
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
  trend: number[]; // Sparkline array (max 30 points)
  status: "good" | "warning" | "critical";
  confidence?: number;
  meta?: {
    source: string;
    lastUpdated: string;
  };
}

export interface KPIExtractionConfig {
  id: string;
  label: string;
  timeColumn: string;
  valueColumn: string;
  formatType: "currency" | "number" | "percentage";
  // Determine if an upward trend is positive (e.g., Revenue) or negative (e.g., Churn)
  polarity: "positive_up" | "positive_down"; 
  source: string;
}

export class KPIEngine {
  /**
   * Main execution pipeline for KPI extraction.
   * 1. Sorts chronologically
   * 2. Extracts trend
   * 3. Computes deltas between latest and previous periods
   * 4. Assigns status based on polarity heuristics
   */
  public static extract(data: any[], config: KPIExtractionConfig): KPI | null {
    if (!data || data.length === 0) return null;

    // 1. Identify and sort by time dimension (Ascending to build trend)
    const sortedData = [...data].sort((a, b) => {
      const dateA = new Date(a[config.timeColumn]).getTime();
      const dateB = new Date(b[config.timeColumn]).getTime();
      return dateA - dateB;
    });

    // 2. Extract trend array (last 30 points for sparkline)
    const trendData = sortedData.slice(-30);
    const trend = trendData.map(row => Number(row[config.valueColumn]) || 0);

    // Ensure we have at least one valid data point
    if (trend.length === 0) return null;

    // 3. Extract latest and previous periods
    const latestValue = trend[trend.length - 1];
    const previousValue = trend.length > 1 ? trend[trend.length - 2] : null;

    // 4. Compute Delta
    let absoluteDelta = 0;
    let percentageDelta = 0;
    let direction: "up" | "down" | "neutral" = "neutral";

    if (previousValue !== null && previousValue !== 0) {
      absoluteDelta = latestValue - previousValue;
      percentageDelta = (absoluteDelta / Math.abs(previousValue)) * 100;
      
      if (absoluteDelta > 0) direction = "up";
      else if (absoluteDelta < 0) direction = "down";
    } else if (previousValue === 0 && latestValue > 0) {
      absoluteDelta = latestValue;
      percentageDelta = 100; // Arbitrary 100% cap for 0-to-N growth
      direction = "up";
    }

    // 5. Assign Status based on polarity rules
    const status = this.calculateStatus(direction, percentageDelta, config.polarity);

    return {
      id: config.id,
      label: config.label,
      value: latestValue,
      formatted: this.formatValue(latestValue, config.formatType),
      delta: {
        absolute: absoluteDelta,
        percentage: Number(percentageDelta.toFixed(1)),
        direction,
        comparisonLabel: "vs previous period"
      },
      trend,
      status,
      confidence: 0.95, // Stub for future AI confidence scoring
      meta: {
        source: config.source,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Applies heuristic thresholds to determine the semantic health of the metric.
   */
  private static calculateStatus(
    direction: "up" | "down" | "neutral", 
    percentageDelta: number, 
    polarity: "positive_up" | "positive_down"
  ): "good" | "warning" | "critical" {
    if (direction === "neutral") return "warning";

    const isFavorable = 
      (direction === "up" && polarity === "positive_up") || 
      (direction === "down" && polarity === "positive_down");

    if (isFavorable) return "good";

    // If unfavorable, determine severity (arbitrary 10% threshold for critical)
    if (Math.abs(percentageDelta) > 10) return "critical";
    
    return "warning";
  }

  /**
   * Deterministic formatting aligned with financial terminal standards.
   */
  private static formatValue(value: number, type: "currency" | "number" | "percentage"): string {
    switch (type) {
      case "currency":
        return new Intl.NumberFormat('en-US', { 
          style: 'currency', 
          currency: 'USD',
          maximumFractionDigits: value % 1 === 0 ? 0 : 2 // Hide .00 for clean UI
        }).format(value);
      case "percentage":
        return `${Number(value.toFixed(2))}%`;
      case "number":
      default:
        return new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 1
        }).format(value);
    }
  }

  /**
   * Batch processes multiple metrics for the Executive Strip orchestration.
   */
  public static batchProcess(datasets: { data: any[], config: KPIExtractionConfig }[]): KPI[] {
    return datasets
      .map(dataset => this.extract(dataset.data, dataset.config))
      .filter((kpi): kpi is KPI => kpi !== null);
  }
}