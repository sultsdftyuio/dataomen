// components/dashboard/ExecutiveKPICard.tsx
"use client";

import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { KPI } from "@/lib/intelligence/kpi-engine";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface ExecutiveKPICardProps {
  kpi: KPI;
  isLoading?: boolean;
}

// -----------------------------------------------------------------------------
// Sub-component: GPU-Accelerated SVG Sparkline
// -----------------------------------------------------------------------------
const Sparkline = ({ data, status }: { data: number[], status: KPI["status"] }) => {
  const points = useMemo(() => {
    if (!data || data.length === 0) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // Prevent division by zero
    
    return data.map((val, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((val - min) / range) * 100;
      return `${x},${y}`;
    }).join(" ");
  }, [data]);

  // Status-based coloring for the sparkline
  const strokeColor = 
    status === "good" ? "var(--emerald-400, #34d399)" :
    status === "warning" ? "var(--amber-400, #fbbf24)" :
    "var(--rose-400, #fb7185)";

  return (
    <div className="absolute inset-x-0 bottom-0 h-16 opacity-[0.15] pointer-events-none transform-gpu translate-z-0 overflow-hidden rounded-b-2xl">
      <svg
        viewBox="0 -10 100 120"
        preserveAspectRatio="none"
        className="w-full h-full drop-shadow-sm"
      >
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          className="animate-in fade-in duration-1000"
        />
      </svg>
      {/* Fading gradient mask so the line blends into the card */}
      <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/90" />
    </div>
  );
};

// -----------------------------------------------------------------------------
// Main Component: Executive KPI Card
// -----------------------------------------------------------------------------
export const ExecutiveKPICard: React.FC<ExecutiveKPICardProps> = ({ kpi, isLoading }) => {
  if (isLoading) {
    return (
      <div className="relative h-32 rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between overflow-hidden shadow-sm">
        <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
        <div className="h-8 w-32 bg-slate-100 rounded animate-pulse mt-2" />
        <div className="h-3 w-16 bg-slate-100 rounded animate-pulse mt-auto" />
      </div>
    );
  }

  // Determine Semantic Colors based on the KPI engine's deterministic output
  const statusConfig = {
    good: {
      border: "hover:border-emerald-300",
      glow: "group-hover:shadow-[0_0_15px_-3px_rgba(52,211,153,0.15)]",
      badgeBg: "bg-emerald-50",
      badgeText: "text-emerald-700",
      icon: TrendingUp
    },
    warning: {
      border: "hover:border-amber-300",
      glow: "group-hover:shadow-[0_0_15px_-3px_rgba(251,191,36,0.15)]",
      badgeBg: "bg-amber-50",
      badgeText: "text-amber-700",
      icon: Minus
    },
    critical: {
      border: "hover:border-rose-300",
      glow: "group-hover:shadow-[0_0_15px_-3px_rgba(251,113,133,0.15)]",
      badgeBg: "bg-rose-50",
      badgeText: "text-rose-700",
      icon: TrendingDown
    }
  };

  const activeConfig = statusConfig[kpi.status];
  const DeltaIcon = activeConfig.icon;

  return (
    <div 
      className={`
        group relative h-32 rounded-2xl border border-slate-200 bg-white p-5 
        shadow-sm transition-all duration-300 overflow-hidden cursor-default
        ${activeConfig.border} ${activeConfig.glow}
      `}
    >
      {/* 1. Background Context */}
      <Sparkline data={kpi.trend} status={kpi.status} />

      {/* 2. Typographic Hierarchy - Meta Level */}
      <div className="relative z-10 flex items-center justify-between">
        <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest line-clamp-1">
          {kpi.label}
        </h3>
        
        {/* AI Confidence Indicator */}
        {kpi.confidence && kpi.confidence > 0 && (
          <div 
            className="flex items-center gap-1 text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md uppercase tracking-wider cursor-help"
            title={`AI Confidence Score: ${(kpi.confidence * 100).toFixed(0)}%`}
          >
            <Sparkles className="w-2.5 h-2.5" />
            {(kpi.confidence * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {/* 3. Typographic Hierarchy - Core Data */}
      <div className="relative z-10 mt-1.5">
        <span className="text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
          {kpi.formatted}
        </span>
      </div>

      {/* 4. Typographic Hierarchy - Delta & Frame */}
      <div className="relative z-10 mt-auto flex items-end pt-2">
        <div className="flex items-center gap-2">
          {/* Semantic Delta Badge */}
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${activeConfig.badgeBg} ${activeConfig.badgeText}`}>
            <DeltaIcon className="w-3 h-3 stroke-[3]" />
            <span className="text-[11px] font-bold tabular-nums tracking-wide">
              {kpi.delta.direction === "up" ? "+" : kpi.delta.direction === "down" ? "-" : ""}
              {Math.abs(kpi.delta.percentage)}%
            </span>
          </div>
          
          {/* Timeframe Comparison Label */}
          <span className="text-[10px] font-medium text-slate-400">
            {kpi.delta.comparisonLabel}
          </span>
        </div>
      </div>

    </div>
  );
};