// lib/intelligence/metrics.ts

import { MetricGraph } from "./metric-graph";
import { VectorOps } from "./vector";

export const graph = new MetricGraph();

// Blended ROAS
graph.register({
  id: "blended_roas",
  deps: ["revenue", "spend"],
  compute: ({ columns }) =>
    VectorOps.divide(columns.revenue, columns.spend),
});

// Blended CAC
graph.register({
  id: "blended_cac",
  deps: ["spend", "customers"],
  compute: ({ columns }) =>
    VectorOps.safeDivide(columns.spend, columns.customers),
});