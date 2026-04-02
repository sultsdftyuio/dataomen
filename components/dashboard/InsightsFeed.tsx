"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  AlertCircle,
  Activity,
  ArrowRight
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/utils/supabase/client";

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
  const supabase = useMemo(() => createClient(), []);
  
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch("/api/insights?limit=5", {
        headers: {
          'Content-Type': 'application/json',
          ...(session && { 'Authorization': `Bearer ${session.access_token}` })
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInsights(data);
      } else {
        // Silent fallback for empty states if endpoint returns 404/Empty
        setInsights([]); 
      }
    } catch (err) {
      console.error("Failed to fetch autonomous insights:", err);
      setError("Failed to synchronize with the live intelligence engine.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase.auth]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const markAsRead = async (id: string) => {
    // Optimistic UI update
    setInsights(prev => prev.filter(insight => insight.id !== id));
    
    // Background API call (fire and forget)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/insights/${id}/read`, { 
        method: "PATCH",
        headers: {
          'Content-Type': 'application/json',
          ...(session && { 'Authorization': `Bearer ${session.access_token}` })
        }
      });
    } catch (error) {
      console.error("Failed to mark insight as read:", error);
    }
  };

  const handleInvestigate = (insight: Insight) => {
    // Routes to the dedicated Phase 4 Investigation Dashboard mapped to this specific anomaly ID
    router.push(`/investigate/${insight.id}`);
  };

  // --- Loading State ---
  if (isLoading) {
    return (
      <Card className="w-full h-full min-h-[500px] border-gray-200/80 shadow-sm bg-white rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-gray-100 bg-slate-50/50">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Zap className="h-5 w-5 text-blue-500 animate-pulse" /> Scanning Telemetry...
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium">Checking connected sources for variance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col space-y-4 p-5 border border-gray-100 rounded-2xl bg-slate-50/30">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="space-y-2 w-full">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <Card className="w-full h-full min-h-[500px] border-gray-200/80 shadow-sm bg-white rounded-2xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-3xl mb-5 shadow-sm">
          <AlertCircle className="h-8 w-8 text-rose-500" />
        </div>
        <h3 className="text-xl font-extrabold text-slate-900 mb-2">Sync Disrupted</h3>
        <p className="text-sm text-slate-500 font-medium max-w-sm mb-6">{error}</p>
        <Button variant="outline" onClick={fetchInsights} className="rounded-xl font-bold bg-white shadow-sm border-gray-200 hover:text-blue-600">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry Connection
        </Button>
      </Card>
    );
  }

  // --- Empty State (Highly reassuring, engineered feel) ---
  if (insights.length === 0) {
    return (
      <Card className="w-full h-full min-h-[500px] border-gray-200/80 shadow-sm bg-white rounded-2xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="text-xl font-extrabold text-slate-900 mb-2">Everything is on track.</h3>
        <p className="text-sm text-slate-500 font-medium max-w-sm mb-8 leading-relaxed">
          Your AI agents are actively monitoring your metrics 24/7. We'll notify you here if any statistically significant variance occurs.
        </p>
        <Button variant="outline" className="gap-2 rounded-xl border-gray-200 shadow-sm font-bold text-slate-700 hover:bg-slate-50">
          <BarChart2 className="w-4 h-4 text-blue-500" /> View All Metrics
        </Button>
      </Card>
    );
  }

  // --- Populated State ---
  return (
    <Card className="w-full flex flex-col h-full max-h-[850px] border-gray-200/80 shadow-md bg-white rounded-2xl overflow-hidden">
      <CardHeader className="pb-4 pt-5 px-6 border-b border-gray-100 bg-slate-50/50 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-extrabold text-slate-900 tracking-tight">
              <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
                <Bell className="h-4 w-4 fill-blue-600/20" /> 
              </div>
              AI Business Alerts
            </CardTitle>
            <CardDescription className="mt-1 text-slate-500 font-medium">
              High-impact events automatically detected and synthesized.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={fetchInsights} className="h-9 w-9 rounded-xl border-gray-200 bg-white shadow-sm text-slate-500 hover:text-blue-600 transition-colors">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-sm shadow-blue-500/20">
              {insights.length} Pending
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <ScrollArea className="flex-1 px-6 bg-[#fafafa]">
        <div className="space-y-5 pb-6 pt-6">
          {insights.map((insight) => {
            // Sentiment & Visuals Logic
            const isSpike = (insight.payload?.variance_pct || 0) > 0;
            const Icon = isSpike ? TrendingUp : TrendingDown;
            
            // Assume default: Spike = Positive (Emerald), Drop = Negative (Rose)
            // Can be configured further based on metric context
            const isPositive = isSpike; 
            
            // Engineered Color Palette
            const colorClass = isPositive ? "text-emerald-600" : "text-rose-600";
            const borderClass = isPositive ? "border-emerald-200" : "border-rose-200";
            const bgClass = isPositive ? "bg-emerald-50" : "bg-rose-50";
            const iconBg = isPositive ? "bg-white border-emerald-100" : "bg-white border-rose-100";

            return (
              <div 
                key={insight.id} 
                className={`relative flex flex-col gap-4 rounded-2xl border ${borderClass} bg-white p-5 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 group animate-in slide-in-from-bottom-2 fade-in overflow-hidden`}
              >
                {/* Subtle Top Gradient Indicator */}
                <div className={`absolute top-0 left-0 w-full h-1 ${isPositive ? 'bg-gradient-to-r from-emerald-400 to-emerald-200' : 'bg-gradient-to-r from-rose-400 to-rose-200'}`} />

                {/* Header: Title & Priority */}
                <div className="flex items-start justify-between gap-4 mt-1">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl border shrink-0 shadow-sm ${iconBg}`}>
                      <Icon className={`h-5 w-5 ${colorClass}`} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 leading-tight mb-1.5 text-base group-hover:text-blue-600 transition-colors">
                        {insight.title}
                      </h4>
                      <p className="text-[13px] text-slate-500 font-medium leading-relaxed max-w-xl">
                        {insight.payload?.ai_analysis?.narrative || insight.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Translated Impact Score */}
                  <div className="shrink-0 flex flex-col items-end gap-2.5">
                    <Badge variant="outline" className={`font-bold text-[10px] tracking-widest uppercase shadow-sm px-2.5 py-0.5 ${
                      insight.impact_score > 75 ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-gray-200 bg-slate-50 text-slate-600'
                    }`}>
                      {insight.impact_score > 75 ? '🔥 High Priority' : '👀 Notice'}
                    </Badge>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{new Date(insight.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Plain English Drivers (The "Why") */}
                {insight.payload?.top_drivers && insight.payload.top_drivers.length > 0 && (
                  <div className="ml-14 bg-slate-50 rounded-xl p-4 border border-slate-100 shadow-inner">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                      <Activity className="h-3 w-3 text-blue-500" /> Primary Drivers
                    </p>
                    <div className="space-y-3">
                      {insight.payload.top_drivers.slice(0, 2).map((driver, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm border-b border-slate-200/50 pb-2 last:border-0 last:pb-0">
                          <span className="font-medium text-slate-500">
                            {driver.dimension}: <span className="text-slate-900 font-bold">{driver.category_name}</span>
                          </span>
                          <span className="text-slate-700 text-xs font-bold bg-white px-2.5 py-1 rounded-md shadow-sm border border-slate-200">
                            {driver.percentage_change > 0 ? "+" : ""}{driver.percentage_change.toFixed(1)}% change
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conversational Actions */}
                <div className="flex items-center justify-end gap-3 mt-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-bold text-xs rounded-xl px-4"
                    onClick={() => markAsRead(insight.id)}
                  >
                    Dismiss
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => handleInvestigate(insight)}
                    className="gap-2 shadow-md shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 font-bold text-xs transition-transform active:scale-95"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Deep Dive Analysis
                    <ArrowRight className="h-3.5 w-3.5 ml-1 opacity-70 group-hover:translate-x-1 transition-transform" />
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