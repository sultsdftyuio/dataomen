// lib/intelligence/columnar.ts

export type Column = Float64Array;

export interface ColumnarTable {
  dates: string[]; // shared index
  columns: Record<string, Column>;
}

export class ColumnarBuilder {
  static fromTimeSeries(
    datasets: Record<string, { created_at: string; value: number }[]>
  ): ColumnarTable {
    const dateSet = new Set<string>();

    // Collect all dates
    for (const dataset of Object.values(datasets)) {
      for (const row of dataset) {
        const d = this.formatDate(row.created_at);
        dateSet.add(d);
      }
    }

    const dates = Array.from(dateSet).sort();
    const indexMap = new Map(dates.map((d, i) => [d, i]));

    const columns: Record<string, Float64Array> = {};

    for (const [key, dataset] of Object.entries(datasets)) {
      const arr = new Float64Array(dates.length);

      for (const row of dataset) {
        const d = this.formatDate(row.created_at);
        const idx = indexMap.get(d)!;
        arr[idx] += row.value || 0;
      }

      columns[key] = arr;
    }

    return { dates, columns };
  }

  private static formatDate(date: string): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}