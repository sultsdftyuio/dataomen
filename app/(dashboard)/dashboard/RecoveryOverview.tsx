// app/(dashboard)/dashboard/RecoveryOverview.tsx
"use client";

import React, { useState, useEffect } from "react";
import { ApiClient } from "@/lib/api-client";
import Link from "next/link";
import { 
  Activity, 
  AlertCircle,
  DollarSign, 
  ShieldAlert, 
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  RefreshCw
} from "lucide-react";

import type { WorkspaceEntitlements } from "@/lib/entitlements";

// Phase 2: Added RecentRisk interface for dynamic data
interface RecentRisk {
  id: string;
  email: string;
  signal: string;
  mrr: number;
  status: string;
  cooldown?: string | null;
}

interface MetricsSummary {
  recoveredMrr: number;
  atRiskMrr: number;
  recoveryRate: number;
  activeRisks: number;
  recentRisks: RecentRisk[]; // Phase 2: Replaces hardcoded preview
}

interface RecoveryOverviewProps {
  entitlements?: WorkspaceEntitlements;
}

// Phase 1: Removed tenantId prop (Server-side resolution only)
export default function RecoveryOverview({ entitlements }: RecoveryOverviewProps) {
  const [loading, setLoading] = useState(true);
  
  // Deterministic state initialized to baseline zero
  const [summary, setSummary] = useState<MetricsSummary>({
    recoveredMrr: 0,
    atRiskMrr: 0,
    recoveryRate: 0,
    activeRisks: 0,
    recentRisks: [],
  });

  useEffect(() => {
    let mounted = true;
    
    // Fetch live data from the deterministic Python API
    const loadDashboardData = async () => {
  setLoading(true);
  try {
    // Automatically injects auth JWT and routes to /api/v1/metrics/summary
    const data = await ApiClient.get<MetricsSummary>('/metrics/summary');
    
    if (mounted) {
      setSummary({
        recoveredMrr: data.recoveredMrr || 0,
        atRiskMrr: data.atRiskMrr || 0,
        recoveryRate: data.recoveryRate || 0,
        activeRisks: data.activeRisks || 0,
        recentRisks: data.recentRisks || []
      });
      setLoading(false);
    }
  } catch (e) {
    console.error("Failed to load dashboard metrics:", e);
        if (mounted) {
          // Fail gracefully to zero-state on error
          setSummary({
            recoveredMrr: 0,
            atRiskMrr: 0,
            recoveryRate: 0,
            activeRisks: 0,
            recentRisks: []
          });
          setLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, []); // Removed tenantId dependency

  const proFeatures = entitlements
    ? [
        { label: "Risk queue", unlocked: entitlements.canViewCustomerLists },
        { label: "Campaign sending", unlocked: entitlements.canSendEmails },
        { label: "Custom templates", unlocked: entitlements.canCreateTemplates },
      ]
    : [];
  const unlockedFeatureCount = proFeatures.filter((feature) => feature.unlocked).length;
  const statusTone = entitlements?.isCanceling
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : entitlements?.isPro
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : entitlements?.planTier === "pro" && entitlements.subscriptionStatus === "past_due"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* ── 1. The ROI Header ── */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-semibold text-[#0A192F] tracking-tight">Recovery Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Measuring deterministic churn signals and automated recovery performance.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Pipeline Active
        </div>
      </div>

      {entitlements && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone}`}>
                {entitlements.isCanceling ? (
                  <AlertCircle className="h-3.5 w-3.5" />
                ) : entitlements.isPro ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <LockKeyhole className="h-3.5 w-3.5" />
                )}
                {entitlements.billingLabel}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Current workspace status
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {entitlements.billingDescription}
            </p>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <div className="text-xs font-semibold text-slate-500">
              {unlockedFeatureCount} of {proFeatures.length} Pro features open
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {proFeatures.map((feature) => (
                <span
                  key={feature.label}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${
                    feature.unlocked
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  {feature.unlocked ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <LockKeyhole className="h-3.5 w-3.5" />
                  )}
                  {feature.label}
                  <span className="uppercase tracking-wide">
                    {feature.unlocked ? "Open" : "Pro"}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Hero Metrics (Value Realization) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Recovered MRR - The Hero Metric */}
        <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm ring-1 ring-emerald-50 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="h-16 w-16" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recovered MRR (30d)</span>
            <DollarSign className="text-emerald-500 h-5 w-5" />
          </div>
          <div className="text-4xl font-bold text-[#0A192F] mt-4 flex items-center gap-2">
            {loading ? <RefreshCw className="h-6 w-6 animate-spin text-slate-300" /> : `$${summary.recoveredMrr}`}
          </div>
          <div className="text-xs text-emerald-600 mt-2 font-medium">Attributed to Arcli Campaigns</div>
        </div>

        {/* At-Risk MRR */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">At-Risk MRR</span>
            <ShieldAlert className="text-amber-500 h-5 w-5" />
          </div>
          <div className="text-4xl font-bold text-[#0A192F] mt-4 flex items-center gap-2">
            {loading ? <RefreshCw className="h-6 w-6 animate-spin text-slate-300" /> : `$${summary.atRiskMrr}`}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-medium">{summary.activeRisks} users currently in recovery pipeline</div>
        </div>

        {/* Recovery Rate */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recovery Rate</span>
            <Activity className="text-blue-500 h-5 w-5" />
          </div>
          <div className="text-4xl font-bold text-[#0A192F] mt-4 flex items-center gap-2">
            {loading ? <RefreshCw className="h-6 w-6 animate-spin text-slate-300" /> : `${summary.recoveryRate}%`}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-medium">Based on deterministic risk cohorts</div>
        </div>
      </div>

      {/* ── 3. The Actionable Queue Preview (Dynamic & Compact) ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-[#0A192F] uppercase tracking-wide">Live Risk Queue Preview</h3>
          <Link href="/dashboard/queue" className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
            View Full Queue <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        
        <div className="divide-y divide-slate-100">
          {loading ? (
             <div className="px-5 py-8 flex flex-col items-center justify-center text-slate-400">
               <RefreshCw className="h-5 w-5 animate-spin mb-2" />
               <span className="text-xs">Loading queue...</span>
             </div>
          ) : summary.recentRisks.length === 0 ? (
             <div className="px-5 py-8 flex flex-col items-center justify-center text-slate-400">
               <ShieldAlert className="h-6 w-6 mb-2 opacity-50" />
               <span className="text-sm text-slate-500">No active risks at the moment.</span>
             </div>
          ) : (
            summary.recentRisks.map((risk) => (
              /* Compact Row Design: reduced padding (py-3 px-5), smaller gaps, smaller text for metadata */
              <div key={risk.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors gap-3 border-l-2 border-transparent hover:border-blue-500 group">
                <div>
                  <div className="text-sm font-semibold text-[#0A192F] group-hover:text-blue-700 transition-colors">{risk.email}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                    <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                      {risk.signal}
                    </span>
                    <span className="font-mono text-slate-400">${risk.mrr}/mo</span>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xs font-medium text-slate-700 flex items-center sm:justify-end gap-1.5">
                    {/* Smaller status dot */}
                    <div className={`h-1.5 w-1.5 rounded-full ${risk.status.toLowerCase().includes('pending') ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    {risk.status}
                  </div>
                  {risk.cooldown ? (
                    <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">
                      Cooldown: {risk.cooldown}
                    </div>
                  ) : (
                    <div className="text-[10px] text-emerald-500 mt-0.5 uppercase tracking-wider font-semibold">
                      Ready for action
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
