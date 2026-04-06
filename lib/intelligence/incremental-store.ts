// lib/intelligence/incremental-store.ts

import { ColumnarTable } from "./columnar";

export class IncrementalStore {
  private store = new Map<string, ColumnarTable>();

  get(key: string): ColumnarTable | undefined {
    return this.store.get(key);
  }

  set(key: string, table: ColumnarTable) {
    this.store.set(key, table);
  }

  merge(
    existing: ColumnarTable,
    incoming: ColumnarTable
  ): ColumnarTable {
    const mergedDates = [...existing.dates, ...incoming.dates];
    const uniqueDates = Array.from(new Set(mergedDates)).sort();

    const columns: Record<string, Float64Array> = {};

    for (const key of Object.keys(existing.columns)) {
      const arr = new Float64Array(uniqueDates.length);

      const mapIndex = new Map(uniqueDates.map((d, i) => [d, i]));

      // fill existing
      existing.dates.forEach((d, i) => {
        arr[mapIndex.get(d)!] = existing.columns[key][i];
      });

      // add incoming
      incoming.dates.forEach((d, i) => {
        arr[mapIndex.get(d)!] += incoming.columns[key][i];
      });

      columns[key] = arr;
    }

    return { dates: uniqueDates, columns };
  }
}