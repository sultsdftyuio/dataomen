"use client";

import React from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Type Safety: Ensure this interface exactly matches the Orchestrator's expectations
export interface AnalyticalData {
  id: string;
  metric_name: string;
  metric_value: number;
  recorded_at: string;
}

// Explicitly declare the props to satisfy TypeScript's IntrinsicAttributes check
export interface DataPreviewProps {
  data: AnalyticalData[];
}

export function DataPreview({ data }: DataPreviewProps) {
  
  // Functional Interaction: Lightweight CSV export for analytical users
  const handleExportCSV = () => {
    if (!data || data.length === 0) return;
    
    // Computation (Execution): Vectorized-style mapping to string for high-speed export
    const headers = ["ID", "Metric Name", "Metric Value", "Recorded At"];
    const csvContent = [
      headers.join(","),
      ...data.map(row => 
        `"${row.id}","${row.metric_name}",${row.metric_value},"${row.recorded_at}"`
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `telemetry_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Graceful fallback for empty datasets
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border rounded-md border-dashed border-gray-200 dark:border-gray-800">
        <p className="text-sm text-gray-500">No raw data vectors available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Interaction Layer: Action bar */}
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleExportCSV}
          className="text-xs flex items-center gap-2"
        >
          <FileDown className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Presentation Layer: Tabular Data */}
      <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-gray-900">
            <TableRow>
              <TableHead className="text-xs font-semibold">Date</TableHead>
              <TableHead className="text-xs font-semibold">Metric</TableHead>
              <TableHead className="text-xs font-semibold text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium text-xs">
                  {new Date(row.recorded_at).toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </TableCell>
                <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                  {row.metric_name}
                </TableCell>
                <TableCell className="text-xs text-right font-mono text-blue-600 dark:text-blue-400">
                  {row.metric_value.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}