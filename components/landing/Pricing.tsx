"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  CheckCircle2, 
  ShieldAlert, 
  Workflow, 
  DollarSign, 
  Activity, 
  Zap, 
  Database, 
  Lock, 
  ArrowRight, 
  Code2, 
  RefreshCcw,
  Terminal
} from "lucide-react";

export default function ArcliPricingCards() {
  const [isAnnual, setIsAnnual] = useState(false);

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section 
      id="pricing" 
      className="py-24 relative overflow-hidden bg-[#FAFAFA]"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif", borderTop: surfaceBorder }}
    >
      {/* Background Decorative Gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-50/40 blur-3xl rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-100 text-[#1B6EBF] text-xs font-bold tracking-[0.08em] uppercase mb-6">
            <Activity className="w-3.5 h-3.5" />
            Deterministic Revenue Recovery
          </div>
          <h2 className="text-4xl md:text-5xl font-semibold text-slate-900 mb-4 tracking-tight leading-[1.08]">
            Predictable infrastructure. <br />
            <span className="text-[#1B6EBF]">Zero black-box taxing.</span>
          </h2>
          <p className="text-slate-600 text-lg leading-relaxed max-w-2xl mx-auto">
            Test your webhook ingestion pipeline for free. Upgrade to automate idempotent churn recovery and keep 100% of the MRR you save.
          </p>

          {/* Billing Toggle */}
          <div className="flex justify-center items-center gap-4 mt-10">
            <span className={`text-sm font-semibold transition-colors ${!isAnnual ? "text-slate-900" : "text-slate-400"}`}>
              Monthly Billing
            </span>
            
            <button 
              type="button"
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B6EBF] focus:ring-offset-2"
              style={{ backgroundColor: isAnnual ? "#1B6EBF" : "#cbd5e1" }}
              role="switch"
              aria-checked={isAnnual}
            >
              <span className="sr-only">Toggle annual billing</span>
              <span 
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAnnual ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>

            <span className={`text-sm font-semibold transition-colors flex items-center gap-2 ${isAnnual ? "text-slate-900" : "text-slate-400"}`}>
              Annual Commitment
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                2 Months Free
              </span>
            </span>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          
          {/* ── CARD 1: Developer Sandbox ($0) ── */}
          <div 
            className="bg-white rounded-3xl border flex flex-col justify-between transition-all hover:shadow-xl relative overflow-hidden"
            style={{ border: surfaceBorder, boxShadow: surfaceShadow }}
          >
            <div className="p-8 md:p-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-slate-100 text-slate-700 tracking-wide uppercase mb-3">
                    <Terminal className="w-3.5 h-3.5" /> Sandbox Environment
                  </span>
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Integration Verification</h3>
                </div>
                <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded border">
                  env: staging
                </span>
              </div>

              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                Built for solo engineers to test Stripe webhook replay safety, inspect explainable risk scoring, and verify tenant isolation logic locally.
              </p>

              {/* Price Display */}
              <div className="mb-8 pb-8 border-b border-slate-100">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold text-slate-900 tracking-tight">$0</span>
                  <span className="text-slate-500 font-medium text-sm">/ forever</span>
                </div>
                <p className="text-xs text-slate-400 font-medium mt-2">
                  No credit card required. Instant synchronous workspace creation.
                </p>
              </div>

              {/* Technical Feature Specs */}
              <div className="space-y-4 mb-8">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Deterministic Pipeline Specs
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#1B6EBF] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700 font-medium">Up to 100 tracked events / month</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#1B6EBF] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700 font-medium">Local webhook catcher &amp; deduplication testing</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#1B6EBF] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700 font-medium">Deterministic signal debugging inspector</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#1B6EBF] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700 font-medium">Isolated tenant schema (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">WHERE tenant_id = ?</code>)</span>
                </div>
              </div>

              {/* Embedded UI Snippet (Signal Inspector) */}
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 text-slate-300 font-mono text-xs space-y-2 mb-6 shadow-inner">
                <div className="flex justify-between items-center text-[10px] text-slate-500 pb-2 border-b border-slate-800">
                  <span>SIGNAL_LOG // LOCALHOST</span>
                  <span className="text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> READY</span>
                </div>
                <div className="text-slate-400 truncate">
                  &gt; trackEvent(<span className="text-amber-300">&quot;inactivity_detected&quot;</span>, user.id)
                </div>
                <div className="text-emerald-400">
                  [PASS] Signal validated. Score: +15 pts.
                </div>
              </div>
            </div>

            <div className="p-8 pt-0">
              <Link 
                href="/register?tier=sandbox" 
                className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all text-sm"
              >
                Deploy Sandbox Tenant <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* ── CARD 2: Production Recovery ($29) ── */}
          <div 
            className="bg-white rounded-3xl border flex flex-col justify-between transition-all hover:shadow-xl relative overflow-hidden"
            style={{ 
              borderColor: "rgba(27,110,191,0.3)", 
              boxShadow: "0 12px 32px -8px rgba(27,110,191,0.12)",
              background: "linear-gradient(180deg, #FFFFFF 0%, #FAFCFF 100%)"
            }}
          >
            {/* Top Accent Bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-[#1B6EBF] to-blue-400" />

            <div className="p-8 md:p-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-blue-50 text-[#1B6EBF] border border-blue-100 tracking-wide uppercase mb-3">
                    <Zap className="w-3.5 h-3.5 fill-[#1B6EBF]" /> Production Engine
                  </span>
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Automated Recovery Layer</h3>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  <DollarSign className="w-3 h-3" /> 0% Rev-Share
                </span>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Route high-risk accounts into retry-safe recovery sequences. Automatically recover failed payments and attribute exact MRR won back without spamming users.
              </p>

              {/* Price Display */}
              <div className="mb-8 pb-8 border-b border-blue-100/60">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold text-slate-900 tracking-tight">
                    ${isAnnual ? "24" : "29"}
                  </span>
                  <span className="text-slate-500 font-medium text-sm">/ month</span>
                </div>
                <p className="text-xs text-[#1B6EBF] font-semibold mt-2 flex items-center gap-1">
                  {isAnnual ? "Billed annually ($290/year)" : "Billed monthly ($29/month)"} · Keep 100% of recovered revenue.
                </p>
              </div>

              {/* Technical Feature Specs */}
              <div className="space-y-4 mb-8">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Production Guarantees
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-800 font-medium">Unlimited automated recovery campaigns</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-800 font-medium">Exact revenue attribution ledger (<code className="text-xs bg-blue-50 text-[#1B6EBF] px-1 py-0.5 rounded font-mono">user_returned &rarr; MRR</code>)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-800 font-medium">Distributed worker execution with idempotency locks</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-800 font-medium">Strict anti-spam cooldown enforcement (7d/14d/30d)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-800 font-medium">Stripe invoice &amp; subscription lifecycle sync</span>
                </div>
              </div>

              {/* Embedded UI Snippet (Attribution Engine Mock) */}
              <div className="bg-[#0B1120] rounded-xl p-4 border border-slate-800 text-slate-300 font-mono text-xs space-y-2.5 mb-6 shadow-inner">
                <div className="flex justify-between items-center text-[10px] text-slate-400 pb-2 border-b border-slate-800/80">
                  <span className="flex items-center gap-1.5"><Workflow className="w-3 h-3 text-blue-400" /> PIPELINE: PAY_FAIL_RECOVERY</span>
                  <span className="text-emerald-400 font-semibold">ATTRIBUTED</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 text-[11px]">
                  <span>stripe.invoice_paid</span>
                  <span className="text-emerald-400 font-bold">+$149.00 MRR</span>
                </div>
                <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/50">
                  <span>IDEMPOTENCY_KEY: val_98a</span>
                  <span className="text-amber-400">COOLDOWN_LOCKED</span>
                </div>
              </div>
            </div>

            <div className="p-8 pt-0">
              <Link 
                href="/register?tier=pro" 
                className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all text-sm shadow-md hover:shadow-lg"
                style={{ background: "linear-gradient(135deg, #1B6EBF 0%, #0F4F91 100%)" }}
              >
                Start 3-Day Pro Trial <ArrowRight className="w-4 h-4" />
              </Link>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-[#1B6EBF]" /> RLS Protected</span>
                <span>·</span>
                <span className="flex items-center gap-1"><RefreshCcw className="w-3 h-3 text-[#1B6EBF]" /> Retry-Safe</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}