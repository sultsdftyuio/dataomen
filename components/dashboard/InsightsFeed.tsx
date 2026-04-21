// components/dashboard/InsightsFeed.tsx
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
  ArrowRight,
  Minus
} from "lucide-react";

import { createClient } from "@/utils/supabase/client";

// -----------------------------------------------------------------------------
// Type Definitions (Aligned with Insight Engine Output)
// -----------------------------------------------------------------------------
export type InsightUrgency = "low" | "medium" | "high" | "critical";
export type InsightDirection = "positive" | "negative" | "neutral";
export type InsightCategory = "revenue" | "growth" | "churn" | "ops";

interface Insight {
  id: string;
  title: string;
  description: string;
  impact_score: number;
  urgency: InsightUrgency;
  category: InsightCategory;
  direction: InsightDirection;
  stats: { label: string; value: string }[];
  drivers?: string[];
  suggested_questions: string[];
  created_at: string;
}

// -----------------------------------------------------------------------------
// Main Component: Priority Intelligence Feed
// -----------------------------------------------------------------------------
export function InsightsFeed() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch autonomous intelligence payload
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
        const insightList: Insight[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.insights)
          ? data.insights
          : [];
        // Ensure deterministic sorting: Highest impact score first
        const sortedData = insightList.sort((a: Insight, b: Insight) => b.impact_score - a.impact_score);
        setInsights(sortedData);
      } else {
        setInsights([]); 
      }
    } catch (err) {
      console.error("[InsightFeed] Engine synchronization failed:", err);
      setError("Failed to synchronize with the live intelligence engine.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase.auth]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const dismissInsight = async (id: string) => {
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
      console.error("[InsightFeed] Failed to dismiss:", error);
    }
  };

  const handleInvestigate = (insight: Insight, initialQuestion?: string) => {
    // Pre-loads the Omniscient Scratchpad context and routes to investigation
    const queryParam = initialQuestion ? `?q=${encodeURIComponent(initialQuestion)}` : '';
    router.push(`/investigate/${insight.id}${queryParam}`);
  };

  // --- 1. Loading State (Engineered Skeleton) ---
  if (isLoading) {
    return (
      <div className="w-full h-full min-h-[500px] border border-slate-200/80 shadow-sm bg-white rounded-2xl overflow-hidden flex flex-col">
        <div className="pb-4 pt-5 px-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Zap className="h-5 w-5 text-blue-500 animate-pulse" /> Scanning Telemetry...
          </h2>
          <p className="text-slate-500 font-medium mt-1 text-sm">Running deterministic variance checks.</p>
        </div>
        <div className="space-y-4 p-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50">
              <div className="h-4 w-1/3 bg-slate-200 rounded animate-pulse mb-3" />
              <div className="h-3 w-3/4 bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-3 w-1/2 bg-slate-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- 2. Error State ---
  if (error) {
    return (
      <div className="w-full h-full min-h-[500px] border border-slate-200/80 shadow-sm bg-white rounded-2xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl mb-4">
          <AlertCircle className="h-8 w-8 text-rose-500" />
        </div>
        <h3 className="text-xl font-extrabold text-slate-900 mb-1">Engine Disconnected</h3>
        <p className="text-sm text-slate-500 font-medium max-w-sm mb-6">{error}</p>
        <button 
          onClick={fetchInsights} 
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-white shadow-sm border border-slate-200 text-slate-700 hover:text-blue-600 transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Retry Handshake
        </button>
      </div>
    );
  }

  // --- 3. Zero State (Reassuring & Clean) ---
  if (insights.length === 0) {
    return (
      <div className="w-full h-full min-h-[500px] border border-slate-200/80 shadow-sm bg-white rounded-2xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mb-5 shadow-sm">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="text-xl font-extrabold text-slate-900 mb-2">Everything is optimal.</h3>
        <p className="text-sm text-slate-500 font-medium max-w-sm mb-8 leading-relaxed">
          The intelligence engine is active. No statistically significant anomalies or hidden opportunities detected in the current window.
        </p>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-white shadow-sm border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">
          <BarChart2 className="w-4 h-4 text-blue-500" /> View Raw Telemetry
        </button>
      </div>
    );
  }

  // --- 4. Populated State (The Executive Intelligence Wall) ---
  return (
    <div className="w-full flex flex-col h-full max-h-[850px] border border-slate-200/80 shadow-md bg-white rounded-2xl overflow-hidden">
      
      {/* Header */}
      <div className="pb-4 pt-5 px-6 border-b border-slate-100 bg-slate-50/50 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 tracking-tight">
            <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
              <Bell className="h-4 w-4" /> 
            </div>
            Priority Intelligence
          </h2>
          <p className="mt-1 text-slate-500 font-medium text-sm">
            High-impact shifts automatically detected and synthesized.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchInsights} 
            className="p-2.5 rounded-xl border border-slate-200 bg-white shadow-sm text-slate-500 hover:text-blue-600 transition-colors"
            title="Force refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <span className="bg-slate-900 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-sm">
            {insights.length} Updates
          </span>
        </div>
      </div>
      
      {/* Scrollable Feed */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#fafafa]">
        <div className="space-y-6">
          {insights.map((insight) => {
            
            // Derive Styling Rules from Insight Metadata
            const isCritical = insight.urgency === "critical";
            const isPositive = insight.direction === "positive";
            
            const theme = isCritical
              ? { border: "border-rose-200 hover:border-rose-300", bg: "bg-white", iconBg: "bg-rose-50 text-rose-600", topGlow: "from-rose-400 to-rose-100", icon: TrendingDown }
              : isPositive
              ? { border: "border-teal-200 hover:border-teal-300", bg: "bg-teal-50/30", iconBg: "bg-teal-100 text-teal-700", topGlow: "from-teal-400 to-teal-100", icon: TrendingUp }
              : { border: "border-slate-200", bg: "bg-white", iconBg: "bg-slate-100 text-slate-600", topGlow: "from-slate-300 to-slate-100", icon: Minus };

            const StatusIcon = theme.icon;

            return (
              <div 
                key={insight.id} 
                className={`group relative flex flex-col rounded-2xl border ${theme.border} ${theme.bg} p-5 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 overflow-hidden`}
              >
                {/* Visual Indicator Line */}
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${theme.topGlow}`} />

                {/* Insight Header */}
                <div className="flex items-start justify-between gap-4 mt-1">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl border border-white/50 shadow-sm shrink-0 ${theme.iconBg}`}>
                      <StatusIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 leading-tight mb-1.5 text-base flex items-center gap-2">
                        {insight.title}
                        {isCritical && (
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                          </span>
                        )}
                      </h4>
                      <p className="text-[13px] text-slate-600 font-medium leading-relaxed max-w-xl">
                        {insight.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Meta Priority Badge */}
                  <div className="shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border ${
                      isCritical ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}>
                      Impact: {insight.impact_score}
                    </span>
                  </div>
                </div>

                {/* Extracted Data Blocks */}
                {insight.stats && insight.stats.length > 0 && (
                  <div className="mt-5 ml-14 flex flex-wrap gap-3">
                    {insight.stats.map((stat, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</span>
                        <span className="text-sm font-extrabold text-slate-900">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Engine (Omniscient Scratchpad Integration) */}
                <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between">
                  
                  {/* Contextual Prompts */}
                  <div className="flex flex-wrap gap-2 flex-1">
                    {insight.suggested_questions.slice(0, 1).map((q, idx) => (
                      <button 
                        key={idx}
                        onClick={() => handleInvestigate(insight, q)}
                        className="text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full border border-blue-100 transition-colors flex items-center gap-1.5"
                      >
                        <Sparkles className="h-3 w-3" />
                        "{q}"
                      </button>
                    ))}
                  </div>

                  {/* Dismiss / Deep Dive Actions */}
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button 
                      className="text-xs font-bold text-slate-500 hover:text-slate-900 px-3 py-2 rounded-xl transition-colors"
                      onClick={() => dismissInsight(insight.id)}
                    >
                      Dismiss
                    </button>
                    <button 
                      onClick={() => handleInvestigate(insight)}
                      className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-4 py-2 font-bold text-xs shadow-md transition-all active:scale-95 group"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-blue-400" /> 
                      Deep Dive
                      <ArrowRight className="h-3.5 w-3.5 opacity-70 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}