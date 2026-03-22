"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  TrendingDown, 
  TrendingUp, 
  Zap, 
  CheckCircle2, 
  Sparkles,
  MessageSquare,
  BarChart2,
  Bell,
  RefreshCw,
  AlertCircle
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  const router = useRouter();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/insights?limit=5");
      if (response.ok) {
        const data = await response.json();
        setInsights(data);
      } else {
        // Silent fallback for demo/UX purposes if endpoint isn't ready
        setInsights([]); 
      }
    } catch (err) {
      console.error("Failed to fetch autonomous insights:", err);
      setError("Failed to sync live insights.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const markAsRead = async (id: string) => {
    // Optimistic UI update
    setInsights(prev => prev.filter(insight => insight.id !== id));
    
    // Background API call (fire and forget)
    fetch(`/api/insights/${id}/read`, { method: "PATCH" }).catch(console.error);
  };

  const handleInvestigate = (insight: Insight) => {
    // Routes to the AI chat pre-filled with the context of this specific anomaly
    const query = encodeURIComponent(`Tell me more about the recent anomaly in ${insight.metric_name}.`);
    router.push(`/chat?prompt=${query}&context_id=${insight.id}`);
  };

  // --- Loading State ---
  if (isLoading) {
    return (
      <Card className="w-full h-full min-h-[500px] border-border shadow-sm bg-background/50 backdrop-blur-md">
        <CardHeader className="pb-4 border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Zap className="h-5 w-5 text-primary animate-pulse" /> AI Business Alerts
          </CardTitle>
          <CardDescription>Scanning your data for significant changes...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-2 w-full">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <Card className="w-full h-full min-h-[500px] border-border shadow-sm bg-background/50 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <AlertCircle className="h-10 w-10 text-destructive/50 mb-4" />
        <h3 className="text-xl font-bold text-foreground mb-2">Sync Disrupted</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">{error}</p>
        <Button variant="outline" onClick={fetchInsights}><RefreshCw className="mr-2 h-4 w-4" /> Retry Connection</Button>
      </Card>
    );
  }

  // --- Empty State (Highly reassuring for non-technical users) ---
  if (insights.length === 0) {
    return (
      <Card className="w-full h-full min-h-[500px] border-border shadow-sm bg-background/50 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20 shadow-sm">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h3 className="text-xl font-bold text-foreground mb-2">Everything is on track.</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-8 leading-relaxed">
          Your AI agents are actively monitoring your metrics 24/7. We'll notify you here if any unusual trends or anomalies occur.
        </p>
        <Button variant="outline" className="gap-2 rounded-full border-primary/20 text-primary hover:bg-primary/5 font-medium">
          <BarChart2 className="w-4 h-4" /> View All Metrics
        </Button>
      </Card>
    );
  }

  // --- Populated State ---
  return (
    <Card className="w-full flex flex-col h-full max-h-[800px] border-border shadow-sm bg-background/50 backdrop-blur-md">
      <CardHeader className="pb-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground tracking-tight">
              <Bell className="h-5 w-5 text-primary fill-primary/20" /> 
              AI Business Alerts
            </CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">
              High-impact events automatically detected in your data.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchInsights} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Badge className="bg-primary/10 text-primary hover:bg-primary/20 font-bold px-3 py-1 rounded-full border-0">
              {insights.length} New
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <ScrollArea className="flex-1 px-6">
        <div className="space-y-5 pb-6 pt-5">
          {insights.map((insight) => {
            // Sentiment & Visuals Logic
            const isSpike = insight.payload.variance_pct > 0;
            const Icon = isSpike ? TrendingUp : TrendingDown;
            
            // Assume default: Spike = Positive (Emerald), Drop = Negative (Rose)
            // Can be configured further based on metric context (e.g., Cost spike is negative)
            const isPositive = isSpike; 
            
            // CSS Variable friendly colors for Light/Dark mode compatibility
            const colorClass = isPositive ? "text-emerald-500" : "text-rose-500";
            const bgClass = isPositive ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20";
            const iconBg = isPositive ? "bg-emerald-500/10" : "bg-rose-500/10";

            return (
              <div 
                key={insight.id} 
                className={`relative flex flex-col gap-4 rounded-2xl border p-5 transition-all duration-300 hover:shadow-md ${bgClass} group animate-in slide-in-from-bottom-2 fade-in`}
              >
                {/* Header: Title & Priority */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 shadow-sm ${iconBg}`}>
                      <Icon className={`h-5 w-5 ${colorClass}`} />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground leading-tight mb-1.5 text-base">
                        {insight.title}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {insight.payload.ai_analysis.narrative || insight.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Translated Impact Score */}
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <Badge variant="outline" className={`font-semibold text-[10px] tracking-wide uppercase border bg-background shadow-sm ${
                      insight.impact_score > 75 ? 'border-rose-500/30 text-rose-500' : 'border-border text-muted-foreground'
                    }`}>
                      {insight.impact_score > 75 ? '🔥 High Priority' : '👀 Notice'}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">{new Date(insight.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Plain English Drivers (The "Why") */}
                {insight.payload.top_drivers && insight.payload.top_drivers.length > 0 && (
                  <div className="ml-14 bg-background/60 rounded-xl p-4 border border-border/50 shadow-sm backdrop-blur-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary" /> Key Factors
                    </p>
                    <div className="space-y-2.5">
                      {insight.payload.top_drivers.slice(0, 2).map((driver, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="font-medium text-muted-foreground">
                            {driver.dimension}: <span className="text-foreground font-bold">{driver.category_name}</span>
                          </span>
                          <span className="text-muted-foreground text-xs font-medium bg-background px-2 py-1 rounded-md shadow-sm border border-border">
                            {driver.percentage_change > 0 ? "+" : ""}{driver.percentage_change.toFixed(1)}% change
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conversational Actions */}
                <div className="flex items-center justify-end gap-3 mt-1 ml-14">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-muted-foreground hover:text-foreground hover:bg-muted font-semibold text-xs rounded-full px-4"
                    onClick={() => markAsRead(insight.id)}
                  >
                    Dismiss
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => handleInvestigate(insight)}
                    className="gap-2 shadow-md rounded-full px-5 font-semibold text-xs transition-transform active:scale-95"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Ask AI about this
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