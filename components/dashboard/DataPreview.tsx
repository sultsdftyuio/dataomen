"use client";

import React, { useMemo, useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Table2, Sparkles, ChevronRight, TrendingUp } from "lucide-react";

// 1. Contract updated to accept an action callback for suggestions
export interface DataPreviewProps {
  data: Record<string, any>[]; 
  isLoading?: boolean;
  onSuggestionClick?: (prompt: string) => void; // Passed from ChatLayout to trigger a new message
}

export const DataPreview = ({ 
  data, 
  isLoading = false,
  onSuggestionClick 
}: DataPreviewProps) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'charts'>('overview');
  
  // 2. Extract columns and infer basic types for smart suggestions
  const { columns, numericCols, categoricalCols } = useMemo(() => {
    if (!data || data.length === 0) return { columns: [], numericCols: [], categoricalCols: [] };
    
    const cols = Object.keys(data[0]);
    const numCols: string[] = [];
    const catCols: string[] = [];
    
    // Sample first row to guess types
    const sample = data[0];
    cols.forEach(col => {
      if (typeof sample[col] === 'number') numCols.push(col);
      else if (typeof sample[col] === 'string' && isNaN(Number(sample[col]))) catCols.push(col);
    });

    return { columns: cols, numericCols: numCols, categoricalCols: catCols };
  }, [data]);

  // 3. Generate dynamic "Quick Plot Suggestions" based on data schema
  const suggestions = useMemo(() => {
    const prompts: string[] = [];
    if (numericCols.length > 0 && categoricalCols.length > 0) {
      prompts.push(`How does ${numericCols[0]} compare across ${categoricalCols[0]} (bar chart)?`);
      if (numericCols.length > 1) {
        prompts.push(`Show the correlation between ${numericCols[0]} and ${numericCols[1]} (scatter plot).`);
      }
    }
    if (numericCols.length > 0) {
      prompts.push(`What is the distribution of ${numericCols[0]} and where is the mean?`);
    }
    if (categoricalCols.length > 0) {
      prompts.push(`Count the total records grouped by ${categoricalCols[0]} (pie chart).`);
    }
    // Fallbacks if data is too generic
    if (prompts.length === 0) {
      prompts.push("Visualize the top 10 rows as a bar chart.", "Show me the trend of this data over time.");
    }
    return prompts.slice(0, 4); // Keep max 4 suggestions
  }, [numericCols, categoricalCols]);

  // 4. Sanitization
  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'number') {
      // Format floats to max 2 decimals, keep ints clean
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return 'Object'; }
    }
    return String(value);
  };

  // 5. Loading State
  if (isLoading) {
    return (
      <div className="space-y-3 w-full p-4 bg-card rounded-2xl border border-border">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="w-full flex flex-col mt-2 bg-background border border-border rounded-xl shadow-sm overflow-hidden">
      
      {/* ── Tabs Header (Julius Style) ── */}
      <div className="flex items-center gap-1 border-b border-border px-3 bg-muted/20">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Table2 className="w-4 h-4" /> Overview
        </button>
        <button 
          onClick={() => setActiveTab('charts')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'charts' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Charts
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="flex flex-col w-full">
          
          {/* ── Quick Plot Suggestions ── */}
          <div className="p-4 bg-muted/10 border-b border-border">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Quick Plot Suggestions ({suggestions.length} available)
            </div>
            <div className="flex flex-col gap-2">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className="flex items-center text-left text-sm text-foreground bg-background border border-border hover:border-primary/50 hover:bg-primary/5 rounded-lg px-3 py-2 transition-all group"
                >
                  <TrendingUp className="w-4 h-4 text-primary/60 mr-2 group-hover:text-primary transition-colors" />
                  <span className="flex-1">{suggestion}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>

          {/* ── Spreadsheet View ── */}
          <div className="overflow-auto flex-1 w-full max-h-[350px] relative custom-scrollbar bg-background">
            <Table className="w-full text-xs text-left border-collapse">
              <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="w-10 px-2 py-1.5 border-r border-border bg-muted/50 text-center text-muted-foreground">#</TableHead>
                  {columns.map((col) => (
                    <TableHead 
                      key={col} 
                      className="px-4 py-2.5 h-auto font-semibold text-foreground whitespace-nowrap bg-muted/50 border-r border-border/50 last:border-r-0"
                    >
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {data.slice(0, 50).map((row, rowIndex) => (
                  <TableRow 
                    key={`row-${rowIndex}`}
                    className="hover:bg-muted/30 transition-colors border-border"
                  >
                    <TableCell className="px-2 py-1.5 border-r border-border bg-muted/10 text-center text-muted-foreground font-mono text-[10px]">
                      {rowIndex + 1}
                    </TableCell>
                    {columns.map((col) => {
                      const val = formatCellValue(row[col]);
                      const isNull = val === 'NULL';
                      const isNumeric = typeof row[col] === 'number';
                      
                      return (
                        <TableCell 
                          key={`cell-${rowIndex}-${col}`} 
                          className={`px-4 py-2 whitespace-nowrap border-r border-border/50 last:border-r-0 ${
                            isNull ? 'text-muted-foreground/50 italic' : 'text-foreground'
                          } ${isNumeric ? 'font-mono text-right' : ''}`}
                        >
                          {val}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {/* ── Footer ── */}
          <div className="bg-muted/30 border-t border-border px-4 py-2 text-[10px] text-muted-foreground flex justify-between items-center sticky bottom-0">
            <span>
              Showing top <strong className="text-foreground font-medium">{Math.min(data.length, 50)}</strong> records
            </span>
            <span className="font-mono bg-background px-2 py-0.5 rounded border border-border flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              DuckDB Engine
            </span>
          </div>
        </div>
      )}

      {/* Placeholder for the Charts tab if the user clicks it without a chart payload */}
      {activeTab === 'charts' && (
        <div className="flex flex-col items-center justify-center p-10 text-muted-foreground bg-muted/10">
          <BarChart3 className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm">No chart generated yet.</p>
          <p className="text-xs mt-1">Click a suggestion from the Overview tab to plot this data.</p>
        </div>
      )}
    </div>
  );
};