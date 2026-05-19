// app/(dashboard)/dashboard/QuickStartGuide.tsx
"use client";

import React from "react";
import Link from "next/link";
import { Key, Send, ShieldAlert, ArrowRight, Activity, CheckCircle2 } from "lucide-react";

export default function QuickStartGuide() {
  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-3xl mx-auto mt-10">
      
      {/* ── Header Section ── */}
      <div className="text-center space-y-3 mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-blue-50 text-blue-600 rounded-full mb-2 ring-4 ring-white shadow-sm">
          <Activity className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">
          Welcome to Arcli
        </h1>
        <p className="text-slate-500 text-base max-w-lg mx-auto">
          Let's connect your data pipeline so you can start detecting churn signals and recovering lost MRR automatically.
        </p>
      </div>

      {/* ── Actionable Pipeline Checklist ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="relative">
          
          {/* Vertical Connecting Line */}
          <div className="absolute top-8 bottom-8 left-[1.125rem] w-0.5 bg-slate-100 hidden sm:block" aria-hidden="true" />

          <div className="space-y-10">
            
            {/* Step 1: Ingestion (ACTIVE) */}
            <div className="relative flex items-start gap-5 group">
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg text-blue-600 shrink-0 relative z-10 shadow-sm transition-transform group-hover:scale-105">
                <Key className="h-5 w-5" />
              </div>
              <div className="flex-1 pt-1">
                <h3 className="text-lg font-semibold text-[#0A192F] flex items-center gap-2">
                  1. Connect your data
                  <span className="text-[10px] uppercase tracking-wider font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Action Required
                  </span>
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 mb-4 leading-relaxed max-w-xl">
                  Generate an API key to securely pipe your Stripe webhook events and user activity into Arcli's deterministic scoring engine.
                </p>
                <Link 
                  href="/settings" 
                  className="inline-flex items-center gap-2 text-sm font-medium text-white bg-[#0A192F] hover:bg-slate-800 px-5 py-2.5 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
                >
                  Generate API Key <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Step 2: Campaigns (PENDING) */}
            <div className="relative flex items-start gap-5 opacity-60 transition-opacity hover:opacity-100">
              <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-400 shrink-0 relative z-10">
                <Send className="h-5 w-5" />
              </div>
              <div className="flex-1 pt-1">
                <h3 className="text-lg font-semibold text-slate-700">2. Configure Recovery Campaigns</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed max-w-xl">
                  Set up your email sender and customize the automated, idempotent sequences that will trigger when a user signals high churn risk.
                </p>
              </div>
            </div>

            {/* Step 3: Queue (PENDING) */}
            <div className="relative flex items-start gap-5 opacity-60 transition-opacity hover:opacity-100">
              <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-400 shrink-0 relative z-10">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="flex-1 pt-1">
                <h3 className="text-lg font-semibold text-slate-700">3. Monitor the Risk Queue</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed max-w-xl">
                  Once data flows, Arcli will automatically populate your queue with at-risk accounts, enforce cooldowns, and attribute recovered revenue.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Footer Note ── */}
      <div className="text-center mt-8 flex justify-center items-center gap-2 text-xs text-slate-400 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Need help? Check the <a href="#" className="text-blue-500 hover:underline">developer docs</a> to learn how to route your webhooks.
      </div>

    </div>
  );
}