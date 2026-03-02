"use client";

import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Strict Type Definition for the module
export interface DataPreviewProps {
  data: any[]; // Expects an array of objects (rows) from the backend DuckDB query
}

export const DataPreview: React.FC<DataPreviewProps> = ({ data }) => {
  // Memoize column extraction: Only re-calculate when the data array reference changes.
  // This prevents layout thrashing during unrelated React state updates.
  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    // Extract keys from the first row to act as headers
    return Object.keys(data[0]);
  }, [data]);

  // Empty state guard clause
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full p-8 text-sm text-muted-foreground bg-muted/5 rounded-xl border border-dashed border-muted">
        No raw data available to preview. Run an analytical query to view results.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-auto rounded-md border bg-card">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 shadow-sm">
          <TableRow>
            {columns.map((col, idx) => (
              <TableHead key={`head-${idx}`} className="whitespace-nowrap font-semibold text-foreground">
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIdx) => (
            <TableRow key={`row-${rowIdx}`} className="hover:bg-muted/50 transition-colors">
              {columns.map((col, colIdx) => {
                const cellValue = row[col];
                return (
                  <TableCell key={`cell-${rowIdx}-${colIdx}`} className="whitespace-nowrap text-sm">
                    {/* Gracefully format nulls/undefined to prevent React render crashes */}
                    {cellValue !== null && cellValue !== undefined ? (
                      String(cellValue)
                    ) : (
                      <span className="text-muted-foreground/50 italic">null</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};