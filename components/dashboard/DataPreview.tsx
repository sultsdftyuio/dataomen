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
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// 1. The Strict Contract: Stateless injection for pure Functional React execution
export interface DataPreviewProps {
  data: Record<string, any>[]; // Dynamically handles ANY analytical result set
  isLoading?: boolean;
  tenantId?: string; // Maintained for visual Security by Design boundaries
  title?: string;
}

export function DataPreview({ 
  data, 
  isLoading = false, 
  tenantId,
  title = "Analytical Results"
}: DataPreviewProps) {
  
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
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-3 mt-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      );
    }

    if (!data || data.length === 0) {
      return (
        <div className="flex h-32 w-full items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20 mt-2">
          No analytical data to display. Execute a query to populate this table.
        </div>
      );
    }

    return (
      <div className="rounded-md border overflow-hidden mt-2 shadow-sm">
        {/* Horizontal scroll container for wide analytical datasets */}
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto relative">
          <Table className="w-full text-sm text-left">
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm backdrop-blur-md">
              <TableRow>
                {columns.map((col) => (
                  <TableHead 
                    key={col} 
                    className="px-4 py-3 font-semibold text-foreground whitespace-nowrap"
                  >
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {data.map((row, rowIndex) => (
                <TableRow 
                  key={`row-${rowIndex}`}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {columns.map((col) => (
                    <TableCell 
                      key={`cell-${rowIndex}-${col}`} 
                      className="px-4 py-2 whitespace-nowrap text-muted-foreground"
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
        <div className="bg-muted/20 border-t px-4 py-2 text-xs text-muted-foreground flex justify-between items-center">
          <span>Displaying <span className="font-medium text-foreground">{data.length}</span> records</span>
          <span className="font-mono text-[10px] bg-muted px-2 py-0.5 rounded-md border border-border">
            Engine: DuckDB
          </span>
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full border-border bg-card flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">{title}</CardTitle>
        {tenantId && (
          <CardDescription>
            Isolated data layer for Tenant: <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{tenantId}</span>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 w-full">
        {renderContent()}
      </CardContent>
    </Card>
  );
}