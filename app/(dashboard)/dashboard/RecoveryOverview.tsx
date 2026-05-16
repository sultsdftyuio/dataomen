// app/(dashboard)/dashboard/RecoveryOverview.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Activity, 
  DollarSign, 
  ShieldAlert, 
  ArrowRight,
  RefreshCw
} from "lucide-react";

export default function RecoveryOverview({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true);
  
  // In a real implementation, you will fetch this from a deterministic endpoint 
  // like `/api/metrics/summary?tenant_id=${tenantId}`
  const [summary, setSummary] = useState({
    recoveredMrr: 0,
    atRiskMrr: 0,
    recoveryRate: 0,
    activeRisks: 0,
  });

  useEffect(() => {
    if (!tenantId) return;

    let mounted = true;
    
    // Simulating initial data load for the deterministic pipeline
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        // Placeholder for your actual API call
        // const res = await fetch(`/api/dashboard/summary?tenant_id=${tenantId}`);
        // const data = await res.json();
        
        // Mocked response representing deterministic SaaS metrics
        setTimeout(() => {
          if (mounted) {
            setSummary({
              recoveredMrr: 4250,
              atRiskMrr: 1150,
              recoveryRate: 68,
              activeRisks: 12
            });
            setLoading(false);
          }
        }, 600);
      } catch (e) {
        console.error("Failed to load dashboard metrics", e);
        if (mounted) setLoading(false);
      }
    };

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, [tenantId]);

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

      {/* ── 3. The Actionable Queue Preview (Explainable Scoring) ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-[#0A192F] uppercase tracking-wide">Live Risk Queue Preview</h3>
          <Link href="/dashboard/queue" className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
            View Full Queue <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        
        <div className="divide-y divide-slate-100">
          {/* Row 1 */}
          <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors gap-4">
            <div>
              <div className="text-sm font-semibold text-[#0A192F]">alex.martinez@example.com</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 font-medium">
                  Failed Stripe Invoice
                </span>
                <span className="font-mono">$49/mo</span>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-sm font-medium text-slate-700 flex items-center sm:justify-end gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                Email 1 Sent
              </div>
              <div className="text-[11px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">
                Cooldown: 48h remaining
              </div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors gap-4">
            <div>
              <div className="text-sm font-semibold text-[#0A192F]">sarah.j@startup.io</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 font-medium">
                  Zero Logins (14d)
                </span>
                <span className="font-mono">$199/mo</span>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-sm font-medium text-slate-700 flex items-center sm:justify-end gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                Pending Routing
              </div>
              <div className="text-[11px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">
                Evaluating suppression list
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}