"use client";

import React, { useMemo } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// 1. The Strict Contract: Stateless injection for pure Functional React execution
export interface DataPreviewProps {
  data: Record<string, any>[]; // Dynamically handles ANY analytical result set
  isLoading?: boolean;
}

export const DataPreview = ({ 
  data, 
  isLoading = false 
}: DataPreviewProps) => {
  
  // 2. Computation Layer: Extract columns purely from the first row's schema.
  // This guarantees the UI never crashes, regardless of the SQL LLM generation.
  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  // 3. Sanitization: Ensure booleans, nulls, or nested objects from DuckDB don't crash React's renderer
  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return 'Object';
      }
    }
    return String(value);
  };

  // 4. State Rendering Layers
  if (isLoading) {
    return (
      <div className="space-y-3 w-full p-4">
        <Skeleton className="h-8 w-full rounded-md bg-neutral-200 dark:bg-neutral-800" />
        <Skeleton className="h-8 w-full rounded-md bg-neutral-200 dark:bg-neutral-800" />
        <Skeleton className="h-8 w-full rounded-md bg-neutral-200 dark:bg-neutral-800" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-32 w-full items-center justify-center text-[11px] text-neutral-400 font-mono">
        &lt; No Vectorized Payload Extracted /&gt;
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full">
      {/* Horizontal scroll container for wide analytical datasets */}
      <div className="overflow-auto flex-1 w-full max-h-[300px] relative custom-scrollbar">
        <Table className="w-full text-xs text-left">
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900 sticky top-0 z-10 shadow-sm">
            <TableRow className="border-b border-neutral-200 dark:border-neutral-800 hover:bg-transparent">
              {columns.map((col) => (
                <TableHead 
                  key={col} 
                  className="px-4 py-2.5 h-auto font-semibold text-neutral-600 dark:text-neutral-300 whitespace-nowrap bg-neutral-50 dark:bg-neutral-900"
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data.slice(0, 50).map((row, rowIndex) => (
              <TableRow 
                key={`row-${rowIndex}`}
                className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors border-neutral-100 dark:border-neutral-800"
              >
                {columns.map((col) => (
                  <TableCell 
                    key={`cell-${rowIndex}-${col}`} 
                    className="px-4 py-2 whitespace-nowrap text-neutral-600 dark:text-neutral-400 font-mono text-[11px]"
                  >
                    {formatCellValue(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Vectorized Table Footer */}
      <div className="bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 px-4 py-2 text-[10px] text-neutral-500 flex justify-between items-center sticky bottom-0">
        <span>
          Showing Top <span className="font-semibold text-neutral-700 dark:text-neutral-300">{Math.min(data.length, 50)}</span> records
        </span>
        <span className="font-mono bg-white dark:bg-black px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700">
          Engine: Polars/DuckDB
        </span>
      </div>
    </div>
  );
};