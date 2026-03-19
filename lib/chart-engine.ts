/**
 * ARCLI.TECH - Chart Engine & Heuristics Layer
 * Separates data resolution, heuristics, and formatting from the React rendering layer.
 */

// -----------------------------------------------------------------------------
// Core Shared Types
// -----------------------------------------------------------------------------
export interface ChartConfig {
  type?: "bar" | "line" | "area" | "scatter" | "pie";
  xAxisKey?: string;
  yAxisKeys?: string[];
  mark?: string | { type: string };
  encoding?: {
    x?: { field: string; type?: string };
    y?: { field: string; type?: string };
    color?: { field: string };
    size?: { field: string }; 
  };
}

export interface ExecutionPayload {
  type: "chart" | "table" | "ml_result" | "error" | "text";
  data?: Record<string, any>[];
  message?: string;
  sql_used?: string;
  chart_spec?: ChartConfig; 
}

export interface AnomalyInsight {
  column: string;
  row_identifier: string;
  value: number;
  z_score: number;
  is_positive: boolean;
}

export interface ResolvedChartShape {
  type: "area" | "line" | "bar" | "pie" | "scatter";
  x: string;
  y: string[];
  forecast: string[];
  ema: string[];
  hasAnomalies: boolean;
  isTimeSeries: boolean;
  isCurrency: boolean;
  isPercent: boolean;
}

// -----------------------------------------------------------------------------
// Constants & Theme Configuration
// -----------------------------------------------------------------------------
export const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#06b6d4", 
  "#8b5cf6", "#ec4899", "#f43f5e", "#14b8a6"
];
export const ANOMALY_COLOR = "#ef4444"; 
export const EMA_COLOR = "#94a3b8"; 
export const FORECAST_COLOR = "#a855f7"; 
export const SIGMA_THRESHOLD = 2.0; 

// -----------------------------------------------------------------------------
// Formatting Utilities
// -----------------------------------------------------------------------------
export const toTitleCase = (str: string): string => {
  if (!str) return "";
  return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export const formatEngineValue = (
  v: any, 
  isCurrency: boolean = false, 
  isPercent: boolean = false
): string | number => {
  if (typeof v !== 'number') return v;
  
  const formatted = new Intl.NumberFormat('en-US', { 
    notation: "compact", 
    maximumFractionDigits: 1 
  }).format(v);

  if (isCurrency) return `$${formatted}`;
  if (isPercent) return `${v < 1 ? (v * 100).toFixed(1) : v.toFixed(1)}%`;
  return formatted;
};

// -----------------------------------------------------------------------------
// Core Engine: Data Shape Resolution
// -----------------------------------------------------------------------------
export const resolveChartDataShape = (
  data: Record<string, any>[], 
  chartSpec?: ChartConfig, 
  anomalies: AnomalyInsight[] = []
): ResolvedChartShape | null => {
  if (!data || data.length === 0) return null;

  const sample = data[0];
  const keys = Object.keys(sample);
  
  const hasLegacyAnomalies = keys.some(k => /zscore|z_score/i.test(k));
  const hasExternalAnomalies = anomalies.length > 0;
  const hasAnomalies = hasLegacyAnomalies || hasExternalAnomalies;

  // 1. Identify X-Axis (Prioritize Time-Series)
  let isTimeSeries = false;
  let x = keys.find(k => {
    if (/date|time|month|year|day|ds/i.test(k)) {
      isTimeSeries = true;
      return true;
    }
    return false;
  }) || keys.find(k => typeof sample[k] === 'string') || keys[0];
  
  if (chartSpec?.encoding?.x?.field) {
      x = chartSpec.encoding.x.field;
      if (/date|time|month|year|day|ds/i.test(x)) isTimeSeries = true;
  }

  // 2. Identify Forecasts and Trendlines (EMA)
  const forecastKeys = keys.filter(k => /forecast|predict|trend/i.test(k) && k !== x);
  const emaKeys = keys.filter(k => /_ema/i.test(k) && k !== x);
  
  // 3. Identify standard Y-Axis metrics
  const yKeys = keys.filter(k => 
      k !== x && 
      typeof sample[k] === 'number' && 
      !/zscore|variance|id/i.test(k) && 
      !forecastKeys.includes(k) && 
      !emaKeys.includes(k)
  );

  if (chartSpec?.encoding?.y?.field && !yKeys.includes(chartSpec.encoding.y.field)) {
      yKeys.push(chartSpec.encoding.y.field);
  }

  // 4. Determine Chart Type
  let detectedType: ResolvedChartShape["type"] = "bar";
  
  if (isTimeSeries) detectedType = "line";
  else if (yKeys.length === 1 && data.length <= 8 && !isTimeSeries) detectedType = "bar"; 
  
  if (chartSpec?.type) {
    detectedType = chartSpec.type;
  } else if (chartSpec?.mark) {
    const typeStr = typeof chartSpec.mark === 'string' ? chartSpec.mark : chartSpec.mark.type;
    if (["area", "line", "bar", "pie", "scatter"].includes(typeStr.toLowerCase())) {
      detectedType = typeStr.toLowerCase() as ResolvedChartShape["type"];
    }
  }

  // Auto-upgrade lines to areas if forecasting is present for better visibility
  if (forecastKeys.length > 0 && detectedType === "line") detectedType = "area";

  // 5. Semantic Type Inferencing (Currency vs Percentages)
  const isCurrency = yKeys.some(k => /price|revenue|cost|mrr|arr|spend|amount|sales|value/i.test(k));
  const isPercent = yKeys.some(k => /rate|percent|pct|margin|ratio|churn/i.test(k));

  return { 
      type: detectedType, 
      x, 
      y: yKeys, 
      forecast: forecastKeys, 
      ema: emaKeys, 
      hasAnomalies,
      isTimeSeries,
      isCurrency,
      isPercent
  };
};