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
    <section id="demo" className="py-24 px-6 bg-slate-50 border-y border-slate-200">
      <div className="max-w-6xl mx-auto" ref={secRef as React.RefObject<HTMLDivElement>}>
        
        {/* Header Section */}
        <header className={`text-center mb-14 transition-all duration-700 transform ${secVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-1.5 rounded-full mb-6 text-blue-600">
            <Sparkles size={14} className="animate-pulse" /> 
            <span className="text-sm font-bold tracking-wide uppercase">Interactive Playground</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 leading-tight uppercase tracking-tighter">
            Stop Guessing. <br className="hidden md:block" /> Ask Arcli.
          </h2>
          <p className="text-slate-600 text-lg max-w-xl mx-auto">
            Experience the power of our AI Data Analyst. Click an example question below to see Arcli generate insights in real-time.
          </p>
        </header>

        {/* Demo Interface Shell */}
        <div className={`transition-all duration-700 delay-150 transform ${secVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          
          {/* Suggestion Chips */}
          <div className="flex flex-wrap gap-3 justify-center mb-10" role="group" aria-label="Demo Queries">
            {QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => runQuery(i)}
                className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all duration-200 border-2 
                  ${activeIdx === i 
                    ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md" 
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600"
                  }`}
              >
                {q.q}
              </button>
            ))}
          </div>

          {/* App Window */}
          <div className="bg-white border-2 border-slate-900 rounded-2xl overflow-hidden shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] min-h-[500px] flex flex-col">
            
            {/* Browser Chrome */}
            <div className="h-12 bg-slate-100 border-b-2 border-slate-900 flex items-center px-5 gap-2">
              <div className="flex gap-2">
                {[1, 2, 3].map(i => <div key={i} className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400" />)}
              </div>
              <div className="flex-1 h-8 bg-white rounded border border-slate-300 ml-5 flex items-center px-3 gap-2">
                <Search size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-900 font-mono truncate">
                  {inputVal || "Initialize a query to see the engine in action..."}
                </span>
              </div>
            </div>

            {/* Response Area */}
            <div className="p-8 md:p-12 flex-1 flex flex-col" aria-live="polite">
              
              {!typing && !result && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center">
                  <BarChart2 size={64} className="mb-4 opacity-20" />
                  <p className="text-lg font-bold uppercase tracking-widest opacity-50">Awaiting Input Signal</p>
                </div>
              )}

              {typing && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-3 h-3 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-blue-600 text-xs font-black uppercase tracking-widest">Supervisor Engine Active</span>
                    <span className="text-slate-400 text-sm font-mono">Scanning schema and calculating variance...</span>
                  </div>
                </div>
              )}

              {!typing && result && (
                <div className="w-full animate-in slide-in-from-bottom-4 fade-in duration-500">
                  <div className="flex gap-6 items-start mb-10">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 border-2 border-blue-500">
                      <Sparkles size={28} className="text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-2xl md:text-3xl font-black text-slate-900 mb-2 uppercase tracking-tighter">
                        {result.headline}
                      </h4>
                      <p className="text-slate-600 text-lg leading-relaxed max-w-2xl">
                        {result.detail}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Visual Result */}
                    <div className="bg-slate-50 rounded-2xl p-8 border-2 border-slate-200">
                      <div className="flex justify-between items-center mb-8">
                        <div className="text-4xl font-black text-slate-900 tracking-tighter">
                          {result.metric}
                        </div>
                        <div className={`flex items-center gap-1.5 font-bold text-xs px-3 py-1.5 rounded-full border-2 ${
                          result.positive ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-blue-700 bg-blue-50 border-blue-200"
                        }`}>
                          {result.positive ? <TrendingUp size={16} /> : <TrendingDown size={16} />} 
                          {result.delta}
                        </div>
                      </div>
                      
                      <div className="flex items-end gap-2 h-40">
                        {result.bars.map((height, i) => (
                          <div key={i} className="flex-1 h-full flex items-end group relative">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-mono">
                              Val: {height}%
                            </div>
                            <div 
                              className={`w-full rounded-t-sm transition-all duration-1000 ease-out border-x border-t border-slate-900/10 ${
                                i > 8 ? "bg-blue-600" : "bg-slate-200"
                              }`}
                              style={{ height: `${height}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Logic Result (Generated SQL) */}
                    <div className="bg-slate-900 rounded-2xl p-8 border-2 border-slate-700 flex flex-col">
                      <div className="flex items-center gap-2 mb-4">
                        <Code size={16} className="text-blue-400" />
                        <span className="text-blue-400 text-xs font-black uppercase tracking-widest">Logic Generation</span>
                      </div>
                      <div className="font-mono text-sm text-slate-300 leading-relaxed flex-1 flex items-center italic opacity-80">
                         {result.sql}
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                         <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                           <Terminal size={12} /> Compute Layer: DuckDB
                         </span>
                         <span className="text-[10px] text-emerald-500 font-black uppercase">Optimized</span>
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
              className="inline-flex items-center justify-center gap-4 bg-slate-900 text-white font-black text-lg px-10 py-5 rounded-xl hover:bg-blue-600 transition-all border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(59,154,232,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
            >
              INITIALIZE YOUR AGENT <ArrowRight size={20} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}