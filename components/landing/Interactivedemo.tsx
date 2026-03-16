// components/landing/Interactivedemo.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Sparkles, TrendingUp, TrendingDown, ArrowRight, BarChart2 } from "lucide-react";
import { useVisible } from "@/hooks/useVisible";

// Extracted outside the component to avoid unnecessary re-allocations on every render.
const QUERIES = [
  {
    q: "What was MRR last month?",
    headline: "MRR last month was $312,400.",
    detail: "That's up 8.7% month-over-month, driven by 43 new Enterprise subscriptions.",
    metric: "$312,400",
    delta: "+8.7%",
    bars: [55, 60, 58, 65, 70, 68, 75, 80, 78, 85, 90, 100],
    positive: true,
  },
  {
    q: "Which campaign drove the most revenue in Q3?",
    headline: '"Product-Led Growth" campaign led with $148K.',
    detail: "It outperformed the next campaign by 2.3× and had the lowest CAC at $42/customer.",
    metric: "$148,000",
    delta: "+2.3×",
    bars: [30, 45, 38, 60, 100, 55, 70, 48, 62, 75, 80, 68],
    positive: true,
  },
  {
    q: "What is churn by cohort this year?",
    headline: "Churn is highest in the Feb cohort at 6.4%.",
    detail: "Cohorts onboarded post-April show consistent improvement, averaging 2.1% monthly churn.",
    metric: "2.1% avg",
    delta: "↓ Improving",
    bars: [100, 88, 75, 64, 55, 50, 45, 40, 36, 32, 28, 25],
    positive: false,
  },
  {
    q: "Which features increase retention?",
    headline: "Users who activate 3+ integrations retain at 94%.",
    detail: "Integration depth is your #1 retention driver. Users with 1 integration retain at only 61%.",
    metric: "94% retention",
    delta: "+33pts",
    bars: [30, 40, 52, 61, 72, 80, 86, 90, 92, 93, 93, 94],
    positive: true,
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

  // Cleanup timeout on unmount to prevent state updates on an unmounted component
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

    // Clear existing timeout to handle rapid clicking cleanly (prevent race conditions)
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setTyping(false);
      setResult(q);
    }, 900);
  }, []);

  return (
    <section className="py-24 px-6 bg-slate-50 border-y border-slate-200">
      <div className="max-w-5xl mx-auto" ref={secRef}>
        
        {/* Header Section */}
        <header className={`text-center mb-14 transition-all duration-700 transform ${secVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-1.5 rounded-full mb-6 text-blue-600">
            <Sparkles size={14} className="animate-pulse" /> 
            <span className="text-sm font-bold tracking-wide">TRY IT LIVE</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 leading-tight">
            Ask your data a question.
          </h2>
          <p className="text-slate-600 text-lg max-w-xl mx-auto">
            Click any example below and watch the AI agent answer in real time.
          </p>
        </header>

        {/* Demo Interface Shell */}
        <div className={`transition-all duration-700 delay-150 transform ${secVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          
          {/* Suggestion Chips */}
          <div className="flex flex-wrap gap-3 justify-center mb-8" role="group" aria-label="Demo Queries">
            {QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => runQuery(i)}
                onKeyDown={(e) => e.key === 'Enter' && runQuery(i)}
                aria-pressed={activeIdx === i}
                className={`px-5 py-2.5 rounded-full font-semibold text-sm transition-all duration-200 border-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-50
                  ${activeIdx === i 
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" 
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  }`}
              >
                {q.q}
              </button>
            ))}
          </div>

          {/* App Window */}
          <div className="bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-2xl shadow-slate-200/50 min-h-[420px] flex flex-col">
            
            {/* Browser Chrome */}
            <div className="h-12 bg-slate-50 border-b border-slate-200 flex items-center px-5 gap-2">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-300" />
                <div className="w-3 h-3 rounded-full bg-slate-300" />
                <div className="w-3 h-3 rounded-full bg-slate-300" />
              </div>
              <div className="flex-1 h-8 bg-white rounded-md border border-slate-200 ml-5 flex items-center px-3 gap-2 shadow-sm">
                <Search size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-900 font-medium truncate">
                  {inputVal || "Click a question above to try the live demo..."}
                </span>
              </div>
            </div>

            {/* Response Area */}
            <div 
              className="p-8 md:p-12 flex-1 flex flex-col justify-center"
              aria-live="polite"
              aria-busy={typing}
            >
              {/* Idle State */}
              {!typing && !result && (
                <div className="text-center text-slate-400 animate-in fade-in duration-500">
                  <BarChart2 size={48} className="mx-auto mb-4 opacity-30" />
                  <p className="text-base font-medium">Select a question to see the engine in action</p>
                </div>
              )}

              {/* Typing Indicator */}
              {typing && (
                <div className="flex items-center justify-center gap-3 animate-in fade-in duration-300">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div 
                        key={i} 
                        className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} 
                      />
                    ))}
                  </div>
                  <span className="text-slate-500 text-sm font-medium">Querying vector embeddings…</span>
                </div>
              )}

              {/* Data Result */}
              {!typing && result && (
                <div className="w-full animate-in slide-in-from-bottom-4 fade-in duration-500">
                  <div className="flex gap-5 items-start mb-8">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/20">
                      <Sparkles size={24} className="text-white" />
                    </div>
                    <div className="pt-1">
                      <h4 className="text-xl md:text-2xl font-bold text-slate-900 mb-2">
                        {result.headline}
                      </h4>
                      <p className="text-slate-600 text-base leading-relaxed">
                        {result.detail}
                      </p>
                    </div>
                  </div>

                  {/* Chart Card */}
                  <div className="bg-slate-50 rounded-2xl p-6 md:p-8 border border-slate-200">
                    <div className="flex justify-between items-center mb-8">
                      <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {result.metric}
                      </div>
                      <div className={`flex items-center gap-1.5 font-bold text-sm px-4 py-2 rounded-full ${
                        result.positive 
                          ? "text-emerald-700 bg-emerald-100" 
                          : "text-blue-700 bg-blue-100"
                      }`}>
                        {result.positive ? <TrendingUp size={16} /> : <TrendingDown size={16} />} 
                        {result.delta}
                      </div>
                    </div>
                    
                    {/* Dynamic Bar Chart */}
                    <div className="flex items-end gap-2 md:gap-3 h-32">
                      {result.bars.map((heightPercent, i) => (
                        <div key={i} className="flex-1 h-full flex items-end group relative">
                          {/* Tooltip implementation for realism */}
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                            Value: {heightPercent}%
                          </div>
                          <div 
                            className={`w-full rounded-t-md transition-all duration-700 ease-out ${
                              i > 8 ? "bg-blue-600 hover:bg-blue-500" : "bg-blue-300 hover:bg-blue-400 opacity-60"
                            }`}
                            style={{ height: `${heightPercent}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center mt-10">
            <a 
              href="/register" 
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold text-base px-8 py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
            >
              Connect your own data <ArrowRight size={18} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}