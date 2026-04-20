"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Sparkles, TrendingUp, TrendingDown, ArrowRight, BarChart2, Code, Terminal } from "lucide-react";
import { useVisible } from "@/hooks/useVisible";

const QUERIES = [
  {
    q: "Why did Q4 revenue spike?",
    headline: "Expansion revenue drove a 32% spike in Q4.",
    detail: "Analysis pinpointed 14 'Pro' accounts that upgraded to 'Enterprise' following the v2.0 feature release.",
    metric: "+32% Revenue",
    delta: "Expansion Driven",
    bars: [20, 25, 22, 30, 35, 32, 45, 50, 48, 70, 85, 100],
    positive: true,
    sql: "SELECT account_tier, SUM(delta_mrr) FROM events WHERE type = 'upgrade' AND date > '2023-10-01' GROUP BY 1;"
  },
  {
    q: "Predict churn for the next 30 days.",
    headline: "Projected churn is down 12% for next month.",
    detail: "High-risk segments identified in the Feb cohort have stabilized following the new automated onboarding flow.",
    metric: "1.4% Est. Churn",
    delta: "↓ Improving",
    bars: [100, 95, 80, 70, 60, 55, 45, 40, 35, 30, 25, 20],
    positive: false,
    sql: "SELECT cohort_month, predict_churn(user_id) FROM users WHERE last_active < now() - interval '7 days';"
  },
  {
    q: "What is the LTV/CAC ratio by channel?",
    headline: "Organic Search leads with a 5.2x LTV/CAC ratio.",
    detail: "While Paid Social has higher volume, Organic Search users retain 40% longer and cost 85% less to acquire.",
    metric: "5.2x Ratio",
    delta: "Organic Lead",
    bars: [30, 40, 35, 50, 60, 55, 70, 75, 80, 90, 95, 100],
    positive: true,
    sql: "SELECT channel, (avg(ltv) / avg(cac)) as ratio FROM marketing_metrics GROUP BY 1 ORDER BY 2 DESC;"
  },
  {
    q: "Which features drive 90-day retention?",
    headline: "AI Agent deployment is the #1 retention driver.",
    detail: "Users who deploy at least one 'Watchdog' agent show a 94% retention rate compared to 61% for dashboard-only users.",
    metric: "94% Retention",
    delta: "+33pts Lift",
    bars: [30, 40, 52, 61, 72, 80, 86, 90, 92, 93, 93, 94],
    positive: true,
    sql: "SELECT feature_name, retention_rate FROM usage_stats WHERE day = 90 ORDER BY 2 DESC LIMIT 5;"
  },
];

type QueryResult = typeof QUERIES[0];

export function InteractiveDemo() {
  const [secRef, secVis] = useVisible(0.15);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [typing, setTyping] = useState(false);
  const [inputVal, setInputVal] = useState("");
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const runQuery = useCallback((idx: number) => {
    const q = QUERIES[idx];
    setActiveIdx(idx);
    setTyping(true);
    setResult(null);
    setInputVal(q.q);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setTyping(false);
      setResult(q);
    }, 1200);
  }, []);

  return (
    <section
      id="demo"
      className="py-24 px-6 border-y"
      style={{
        background: "#FAFAFA",
        borderColor: "rgba(0,0,0,0.08)",
        fontFamily: "var(--font-geist-sans), sans-serif"
      }}
    >
      <div className="max-w-6xl mx-auto" ref={secRef as React.RefObject<HTMLDivElement>}>
        
        {/* Header Section */}
        <header className={`text-center mb-10 transition-all duration-700 transform ${secVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="inline-flex items-center gap-2 bg-white border border-black/10 px-3 py-1 rounded-md mb-4 text-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <Sparkles size={14} className="text-blue-600" /> 
            <span className="text-xs font-semibold tracking-[0.08em] uppercase">Interactive Playground</span>
          </div>
          <h2 style={{ fontSize: "clamp(34px, 5vw, 44px)", fontWeight: 700, color: "#0F172A", marginBottom: 12, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Stop Guessing. <br className="hidden md:block" /> Ask Arcli.
          </h2>
          <p className="text-slate-600 text-base max-w-xl mx-auto leading-relaxed">
            Experience the power of our AI Data Analyst. Click an example question below to see Arcli generate insights in real-time.
          </p>
        </header>

        {/* Demo Interface Shell */}
        <div className={`transition-all duration-700 delay-150 transform ${secVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          
          {/* Suggestion Chips */}
          <div className="flex flex-wrap gap-2 justify-center mb-7" role="group" aria-label="Demo Queries">
            {QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => runQuery(i)}
                className={`h-10 px-4 rounded-md font-semibold text-sm transition-all duration-200 border 
                  ${activeIdx === i 
                    ? "border-blue-600 bg-white text-blue-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)]" 
                    : "border-black/10 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                  }`}
              >
                {q.q}
              </button>
            ))}
          </div>

          {/* App Window */}
          <div className="bg-white border border-black/10 rounded-lg overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.08)] min-h-[440px] flex flex-col">
            
            {/* Browser Chrome */}
            <div className="h-11 bg-slate-50 border-b border-black/10 flex items-center px-4 gap-2">
              <div className="flex gap-2">
                {[1, 2, 3].map(i => <div key={i} className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-400/50" />)}
              </div>
              <div className="flex-1 h-8 bg-white rounded-md border border-black/10 ml-4 flex items-center px-3 gap-2">
                <Search size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-900 truncate">
                  {inputVal || "Initialize a query to see the engine in action..."}
                </span>
              </div>
            </div>

            {/* Response Area */}
            <div className="p-6 md:p-8 flex-1 flex flex-col" aria-live="polite">
              
              {!typing && !result && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center">
                  <BarChart2 size={36} className="mb-3 opacity-30" />
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] opacity-60">Awaiting Input Signal</p>
                </div>
              )}

              {typing && (
                <div className="flex-1 flex flex-col items-center justify-center gap-5">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-3 h-3 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-blue-600 text-xs font-semibold uppercase tracking-[0.08em]">Supervisor Engine Active</span>
                    <span className="text-slate-500 text-sm">Scanning schema and calculating variance...</span>
                  </div>
                </div>
              )}

              {!typing && result && (
                <div className="w-full animate-in slide-in-from-bottom-4 fade-in duration-500">
                  <div className="flex gap-4 items-start mb-7">
                    <div className="w-10 h-10 rounded-md bg-slate-900 flex items-center justify-center shrink-0 border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                      <Sparkles size={16} className="text-blue-300" />
                    </div>
                    <div>
                      <h4 className="text-[24px] md:text-[28px] font-bold text-slate-900 mb-2 leading-tight tracking-tight">
                        {result.headline}
                      </h4>
                      <p className="text-slate-600 text-sm md:text-base leading-relaxed max-w-2xl">
                        {result.detail}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Visual Result */}
                    <div className="bg-slate-50 rounded-lg p-5 border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                      <div className="flex justify-between items-center mb-5 gap-3">
                        <div className="text-[30px] font-bold text-slate-900 tracking-tight leading-none">
                          {result.metric}
                        </div>
                        <div className={`h-8 inline-flex items-center gap-1.5 font-semibold text-xs px-3 rounded-md border ${
                          result.positive ? "text-emerald-700 bg-white border-emerald-200" : "text-blue-700 bg-white border-blue-200"
                        }`}>
                          {result.positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />} 
                          {result.delta}
                        </div>
                      </div>
                      
                      <div className="flex items-end gap-1.5 h-32">
                        {result.bars.map((height, i) => (
                          <div key={i} className="flex-1 h-full flex items-end group relative">
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-1 px-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                              Val: {height}%
                            </div>
                            <div 
                              className={`w-full rounded-t-sm transition-all duration-1000 ease-out border-x border-t border-slate-900/10 ${
                                i > 8 ? "bg-blue-600" : "bg-slate-300"
                              }`}
                              style={{ height: `${height}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Logic Result (Generated SQL) */}
                    <div className="bg-slate-900 rounded-lg p-5 border border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)] flex flex-col">
                      <div className="flex items-center gap-2 mb-4">
                        <Code size={14} className="text-blue-300" />
                        <span className="text-blue-300 text-xs font-semibold uppercase tracking-[0.08em]">Logic Generation</span>
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed flex-1 flex items-center opacity-90">
                         {result.sql}
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                         <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-[0.08em] flex items-center gap-2">
                           <Terminal size={12} /> Compute Layer: DuckDB
                         </span>
                         <span className="text-[10px] text-emerald-400 font-semibold uppercase">Optimized</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-center mt-12">
            <a 
              href="/register" 
              className="inline-flex h-10 items-center justify-center gap-2 bg-slate-900 text-white font-semibold text-sm px-4 rounded-md hover:bg-slate-800 transition-all border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
            >
              Initialize Your Agent <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}