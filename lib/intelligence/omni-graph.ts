// lib/intelligence/omni-graph-v3.ts

import { ColumnarBuilder } from "./columnar";
import { graph } from "./metrics";
import { KPIEngine } from "@/lib/intelligence/kpi-engine";

export class OmniGraphEngineV3 {
  static compute(datasets: Record<string, any[]>) {
    // 1. Columnar transformation
    const table = ColumnarBuilder.fromTimeSeries(datasets);

    // 2. Compute all dependent metrics
    const computed = graph.computeAll(table);

    // 3. Convert back to KPI format
    return Object.entries(computed.columns).map(([key, column]) => {
      const series = computed.dates.map((date, i) => ({
        created_at: date,
        value: column[i],
      }));

      return KPIEngine.extract(series, {
        id: key,
        label: key,
        timeColumn: "created_at",
        valueColumn: "value",
        formatType: "number",
        polarity: "positive_up",
        source: "OmniGraphEngine v3",
      });
    });
  }
}