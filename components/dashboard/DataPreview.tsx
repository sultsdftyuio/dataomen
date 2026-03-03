"use client";

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { FileDown, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 1. Strict Type Safety: Define props to resolve the IntrinsicAttributes missing property error
export interface DataPreviewProps {
  fileId: string;
}

export function DataPreview({ fileId }: DataPreviewProps) {
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreviewData = useCallback(async () => {
    if (!fileId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Analytical Efficiency: Route to backend which interacts with DuckDB/Parquet natively
      const response = await axios.get(`/api/datasets/preview/${fileId}`);
      
      // Handle standard REST patterns gracefully
      const payload = response.data?.data || response.data || [];
      
      if (Array.isArray(payload)) {
        setData(payload);
        if (payload.length > 0) {
          setColumns(Object.keys(payload[0]));
        }
      } else {
        throw new Error("Invalid tabular data format received from backend.");
      }

    } catch (err: any) {
      console.error("Failed to fetch data preview:", err);
      setError(
        err.response?.data?.detail || 
        err.message || 
        "Unable to load data preview. Ensure the dataset is processed."
      );
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  // Refetch when the Orchestrator passes down a new fileId
  useEffect(() => {
    fetchPreviewData();
  }, [fetchPreviewData]);

  // State 1: Processing/Fetching
  if (isLoading) {
    return (
      <div className="p-6 border rounded-xl bg-card shadow-sm space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-sm">Raw Data Fragment</h3>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </div>
    );
  }

  // State 2: Error Boundary
  if (error) {
    return (
      <div className="p-6 border rounded-xl bg-card shadow-sm flex flex-col items-center justify-center space-y-3 min-h-[250px]">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground font-medium">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchPreviewData} className="mt-2">
          <RefreshCw className="w-4 h-4 mr-2" /> Retry Request
        </Button>
      </div>
    );
  }

  // State 3: Empty Data Output
  if (!data || data.length === 0) {
    return (
      <div className="p-6 border rounded-xl bg-card shadow-sm flex flex-col items-center justify-center min-h-[200px]">
        <p className="text-sm text-muted-foreground">No tabular records found in this dataset.</p>
      </div>
    );
  }

  // State 4: Data Canvas 
  return (
    <div className="p-6 border rounded-xl bg-card shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          Raw Data Fragment
          <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
            Top 100 Rows
          </span>
        </h3>
        <Button variant="ghost" size="sm" className="hidden sm:flex">
          <FileDown className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>
      
      <div className="rounded-md border overflow-x-auto max-h-[400px] relative">
        <Table>
          <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
            <TableRow className="hover:bg-transparent">
              {columns.map((col, idx) => (
                <TableHead key={idx} className="whitespace-nowrap text-xs font-medium h-9">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Limit UI rendering to 100 rows to maintain crisp DOM performance */}
            {data.slice(0, 100).map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col, colIdx) => {
                  const cellValue = row[col];
                  return (
                    <TableCell key={colIdx} className="whitespace-nowrap text-xs py-2.5">
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
      <div className="mt-4 text-xs text-muted-foreground flex justify-between items-center">
        <span>Showing a subset of records to provide semantic context for the LLM.</span>
      </div>
    </div>
  );
}