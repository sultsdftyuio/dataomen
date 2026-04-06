// lib/intelligence/metric-graph.ts

import { ColumnarTable } from "./columnar";
import { VectorOps } from "./vector";

type MetricNode = {
  id: string;
  deps: string[];
  compute: (table: ColumnarTable) => Float64Array;
};

export class MetricGraph {
  private nodes = new Map<string, MetricNode>();

  register(node: MetricNode) {
    this.nodes.set(node.id, node);
  }

  computeAll(baseTable: ColumnarTable): ColumnarTable {
    const columns = { ...baseTable.columns };

    for (const node of this.nodes.values()) {
      columns[node.id] = node.compute({
        dates: baseTable.dates,
        columns,
      });
    }

    return {
      dates: baseTable.dates,
      columns,
    };
  }
}