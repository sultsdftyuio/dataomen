"use client";

import React, { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// The Strict Contract: Enforce tenantId injection for Security by Design
export interface DataPreviewProps {
  tenantId: string;
}

// Interface for strongly-typed analytical datasets
interface DatasetMeta {
  id: string;
  name: string;
  status: "Cleaned" | "Ingesting" | "Failed" | "Ready";
  rows: number | null;
  lastUpdated: string;
}

export function DataPreview({ tenantId }: DataPreviewProps) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // The Modular Strategy: This fetch logic can point to Supabase, an API route, 
    // or an in-memory DuckDB query. Scoped strictly by tenantId.
    const fetchTenantDatasets = async () => {
      try {
        setIsLoading(true);
        // Simulate network/analytical fetch delay
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Simulated Vectorized Metadata Payload
        setDatasets([
          { id: "1", name: "q3_financials.parquet", status: "Ready", rows: 1200500, lastUpdated: "2026-03-01T10:00:00Z" },
          { id: "2", name: "user_events_raw.csv", status: "Ingesting", rows: null, lastUpdated: "2026-03-04T08:30:00Z" },
          { id: "3", name: "anomaly_logs.parquet", status: "Cleaned", rows: 450, lastUpdated: "2026-03-03T14:15:00Z" },
        ]);
      } catch (error) {
        console.error("[DataPreview] Failed to fetch dataset metadata:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTenantDatasets();
  }, [tenantId]);

  return (
    <Card className="h-full border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl">Active Datasets</CardTitle>
        <CardDescription>Isolated data layer for Tenant: <span className="font-mono text-xs">{tenantId}</span></CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Row Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                      No datasets detected. Upload a parquet or csv file to begin.
                    </TableCell>
                  </TableRow>
                ) : (
                  datasets.map((dataset) => (
                    <TableRow key={dataset.id}>
                      <TableCell className="font-medium">{dataset.name}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={dataset.status === "Ready" || dataset.status === "Cleaned" ? "default" : "secondary"}
                        >
                          {dataset.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {dataset.rows ? dataset.rows.toLocaleString() : "--"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}