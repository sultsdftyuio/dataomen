"use client";

import React, { useState, useEffect } from "react";
import { 
  TrendingDown, 
  TrendingUp, 
  Activity, 
  Zap, 
  CheckCircle2, 
  ArrowRight,
  AlertTriangle
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

// --- Strict TypeScript Interfaces matching our Python Models ---
interface VarianceDriver {
  dimension: string;
  category_name: string;
  percentage_change: number;
  contribution_to_variance_pct: number;
}

interface InsightPayload {
  actual_value: number;
  expected_value: number;
  variance_pct: number;
  z_score: number;
  date: string;
  top_drivers: VarianceDriver[];
  ai_analysis: {
    narrative: string;
  };
}

interface Insight {
  id: string;
  type: "ANOMALY" | "TREND" | "CORRELATION";
  title: string;
  description: string;
  metric_name: string;
  impact_score: number;
  payload: InsightPayload;
  is_read: boolean;
  created_at: string;
}

export function InsightsFeed() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch insights from our new backend route
    const fetchInsights = async () => {
      try {
        const response = await fetch("/api/insights?limit=5");
        if (response.ok) {
          const data = await response.json();
          setInsights(data);
        }
      } catch (error) {
        console.error("Failed to fetch autonomous insights:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInsights();
  }, []);

  const markAsRead = async (id: string) => {
    // Optimistic UI update
    setInsights(prev => prev.filter(insight => insight.id !== id));
    
    // Background API call
    await fetch(`/api/insights/${id}/read`, { method: "PATCH" });
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-yellow-500" /> Today's Insights
          </CardTitle>
          <CardDescription>AI is analyzing your datasets...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col space-y-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-16 w-full mt-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card className="w-full border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-4 opacity-80" />
          <h3 className="text-lg font-semibold">Everything looks normal</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-2">
            The Autonomous Engine is monitoring your metrics. No significant anomalies or trends detected today.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full flex flex-col h-full max-h-[800px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Zap className="h-5 w-5 text-amber-500 fill-amber-500" /> 
              Autonomous Insights
            </CardTitle>
            <CardDescription className="mt-1">
              High-impact findings automatically surfaced from your data
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-mono">
            {insights.length} NEW
          </Badge>
        </div>
      </CardHeader>
      
      <ScrollArea className="flex-1 px-6">
        <div className="space-y-6 pb-6 pt-2">
          {insights.map((insight) => {
            const isSpike = insight.payload.variance_pct > 0;
            const Icon = isSpike ? TrendingUp : TrendingDown;
            const colorClass = isSpike ? "text-emerald-500" : "text-rose-500";
            const bgClass = isSpike ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-rose-50 dark:bg-rose-500/10";

            return (
              <div 
                key={insight.id} 
                className="relative flex flex-col gap-3 rounded-lg border p-4 shadow-sm transition-all hover:shadow-md bg-card"
              >
                {/* Header: Title & Impact Score */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-md mt-0.5 ${bgClass}`}>
                      <Icon className={`h-5 w-5 ${colorClass}`} />
                    </div>
                    <div>
                      <h4 className="font-semibold leading-none mb-1.5">{insight.title}</h4>
                      <p className="text-sm text-muted-foreground leading-snug">
                        {insight.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={insight.impact_score > 75 ? "destructive" : "secondary"}>
                      Impact: {insight.impact_score}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                      {new Date(insight.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Mathematical Drivers (The "Why") */}
                {insight.payload.top_drivers && insight.payload.top_drivers.length > 0 && (
                  <div className="mt-2 bg-muted/50 rounded-md p-3 border border-border/50">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" /> Root Cause Drivers
                    </p>
                    <div className="space-y-2">
                      {insight.payload.top_drivers.slice(0, 2).map((driver, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {driver.dimension}: <span className="text-muted-foreground font-normal">{driver.category_name}</span>
                          </span>
                          <span className="font-mono text-xs">
                            {driver.percentage_change > 0 ? "+" : ""}{driver.percentage_change}%
                            <span className="text-muted-foreground ml-1">
                              ({Math.round(driver.contribution_to_variance_pct)}% impact)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 mt-2">
                  <Button variant="ghost" size="sm" onClick={() => markAsRead(insight.id)}>
                    Dismiss
                  </Button>
                  <Button variant="default" size="sm" className="gap-1.5">
                    Investigate <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}