"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Database } from "lucide-react";

interface DataPreviewProps {
  datasetId: string;
  onStartAnalysis: (datasetId: string) => void;
}

interface PreviewState {
  dataset_name: string;
  columns: string[];
  rows: Record<string, any>[];
}

export function DataPreview({ datasetId, onStartAnalysis }: DataPreviewProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const res = await fetch(`/api/datasets/${datasetId}/preview`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Failed to load preview");
        
        const data = await res.json();
        setPreview(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [datasetId]);

  if (loading) {
    return (
      <Card className="w-full mt-6">
        <CardHeader>
          <Skeleton className="h-6 w-1/3 mb-2" />
          <Skeleton className="h-4 w-1/4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !preview) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-md mt-6">
        Failed to load data preview. Please try again.
      </div>
    );
  }

  return (
    <Card className="w-full mt-6 shadow-sm border-gray-200 flex flex-col">
      <CardHeader className="flex flex-row justify-between items-center pb-4 border-b border-gray-100">
        <div>
          <CardTitle className="text-xl flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            {preview.dataset_name}
          </CardTitle>
          <CardDescription>
            Successfully loaded all <strong>{preview.rows.length.toLocaleString()}</strong> rows of your dataset.
          </CardDescription>
        </div>
        <Button onClick={() => onStartAnalysis(datasetId)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
          <Sparkles className="mr-2 h-4 w-4" /> Ask Questions <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      
      {/* Scrollable Container for Infinite Data Viewing 
        We use max-h-[60vh] to take up 60% of the screen height, leaving room for headers.
      */}
      <CardContent className="p-0 overflow-hidden">
        <div className="max-h-[60vh] overflow-auto relative rounded-b-lg">
          <Table>
            {/* Sticky Header ensures column names stay visible while scrolling */}
            <TableHeader className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                {preview.columns.map((col, idx) => (
                  <TableHead key={idx} className="whitespace-nowrap font-semibold text-gray-700 bg-gray-50">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-gray-50 transition-colors">
                  {preview.columns.map((col, colIndex) => (
                    <TableCell key={colIndex} className="whitespace-nowrap py-2 text-gray-600">
                      {row[col] !== null ? String(row[col]) : <span className="text-gray-300 italic">null</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}