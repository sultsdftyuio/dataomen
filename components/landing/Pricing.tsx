"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  CheckCircle2, 
  CreditCard, 
  ShieldCheck, 
  ArrowRight,
  Database,
  Workflow
} from 'lucide-react';

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section 
      id="pricing" 
      className="py-24 relative overflow-hidden"
      style={{ 
        fontFamily: "var(--font-geist-sans), sans-serif",
        background: "linear-gradient(180deg, #FFFFFF 0%, #F6FAFE 100%)"
      }}
    >
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-50/50 blur-3xl rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-100 text-[#1B6EBF] text-xs font-bold tracking-[0.08em] uppercase mb-6">
            <CreditCard className="w-3.5 h-3.5" />
            Transparent Pricing
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4 tracking-tight">
            Recover more revenue than you spend.
          </h2>
          <p className="text-slate-600 text-lg leading-relaxed">
            One simple, predictable tier. No hidden fees, no percentage cuts of your recovered revenue. You keep exactly what Arcli saves.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center items-center gap-4 mb-10">
          <span className={`text-sm font-medium transition-colors ${!isAnnual ? 'text-gray-900' : 'text-gray-500'}`}>
            Monthly
          </span>
          
          <button 
            type="button"
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B6EBF] focus:ring-offset-2"
            style={{ backgroundColor: isAnnual ? '#1B6EBF' : '#cbd5e1' }}
            role="switch"
            aria-checked={isAnnual}
          >
            <span className="sr-only">Toggle annual billing</span>
            <span 
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAnnual ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>

          <span className={`text-sm font-medium transition-colors flex items-center gap-2 ${isAnnual ? 'text-gray-900' : 'text-gray-500'}`}>
            Yearly
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wide">
              Save $58
            </span>
          </span>
        </div>

        {/* Pricing Card (Wide Split Layout) */}
        <div 
          className="bg-white rounded-3xl border shadow-lg overflow-hidden flex flex-col md:flex-row transition-all hover:shadow-xl"
          style={{ borderColor: "rgba(27,110,191,0.16)" }}
        >
          {/* Left: Price & CTA */}
          <div className="p-8 md:p-12 md:w-2/5 flex flex-col justify-center border-b md:border-b-0 md:border-r" style={{ borderColor: "rgba(27,110,191,0.12)", background: "linear-gradient(180deg, #FFFFFF 0%, #FAFCFF 100%)" }}>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Platform Access</h3>
            <p className="text-sm text-slate-500 mb-6">Everything you need to automate deterministic churn recovery.</p>
            
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-gray-900 tracking-tight">
                  ${isAnnual ? '290' : '29'}
                </span>
                <span className="text-slate-500 font-medium">
                  /{isAnnual ? 'year' : 'month'}
                </span>
              </div>
              {isAnnual && (
                <p className="text-sm text-emerald-600 font-medium mt-2">
                  Effectively ~$24.16 / month
                </p>
              )}
            </div>

            <Link 
              href="/register" 
              className="w-full h-12 flex items-center justify-center gap-2 rounded-lg font-semibold text-white transition-all"
              style={{ 
                background: "linear-gradient(135deg, #1B6EBF 0%, #0F4F91 100%)",
                boxShadow: "0 4px 12px rgba(27,110,191,0.2)",
                letterSpacing: "0.02em"
              }}
              onMouseOver={e => {
                (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 6px 16px rgba(27,110,191,0.28)";
              }}
              onMouseOut={e => {
                (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 12px rgba(27,110,191,0.2)";
              }}
            >
              Start 3-Day Pro Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs text-center text-slate-400 mt-4 font-medium">
              Card required. $29/month after the 3-day trial.
            </p>
          </div>

          {/* Right: Features */}
          <div className="p-8 md:p-12 md:w-3/5 bg-white">
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-6">
              Included in your workspace
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
              
              {/* Feature Item */}
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-slate-600 font-medium">Unlimited recovery campaigns</span>
              </div>

              {/* Feature Item */}
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-slate-600 font-medium">Deterministic revenue attribution</span>
              </div>

              {/* Feature Item */}
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-slate-600 font-medium">Smart retry-safe idempotency</span>
              </div>

              {/* Feature Item */}
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-slate-600 font-medium">Stripe & webhook integration</span>
              </div>

              {/* Feature Item */}
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-slate-600 font-medium">Automated contact cooldowns</span>
              </div>

              {/* Feature Item */}
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-slate-600 font-medium">Standard email delivery included</span>
              </div>

            </div>

            {/* Architecture Guarantees */}
            <div className="mt-8 pt-8 border-t flex flex-col sm:flex-row gap-4" style={{ borderColor: "rgba(27,110,191,0.12)" }}>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-[#1B6EBF]" />
                Transaction-Safe
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Database className="w-4 h-4 text-[#1B6EBF]" />
                Isolated Tenant RLS
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Workflow className="w-4 h-4 text-[#1B6EBF]" />
                State Machine Logic
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
