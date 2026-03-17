"use client";

import React, { useState, useEffect, useRef } from "react";

// Types to strictly type our component state
type DemoStatus = "idle" | "running" | "complete";
type PipelineStage = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
};

const DEMO_QUERY = "Analyze Q3 Enterprise churn rates and identify the leading root cause.";

export function InteractiveDemo() {
  const [status, setStatus] = useState<DemoStatus>("idle");
  const [typedQuery, setTypedQuery] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([
    { id: "semantic", label: "Checking semantic memory & routing datasets", status: "pending" },
    { id: "planner", label: "Architecting multi-dataset query strategy", status: "pending" },
    { id: "compute", label: "Executing vectorized DuckDB compute", status: "pending" },
    { id: "narrative", label: "Synthesizing executive narrative", status: "pending" },
  ]);
  const [activeStageIndex, setActiveStageIndex] = useState(-1);

  // Auto-type the query when the user clicks "Run Analysis" to make it feel frictionless
  useEffect(() => {
    if (status === "running" && typedQuery.length < DEMO_QUERY.length) {
      const timeout = setTimeout(() => {
        setTypedQuery(DEMO_QUERY.slice(0, typedQuery.length + 1));
      }, 30); // Fast typing effect
      return () => clearTimeout(timeout);
    } else if (status === "running" && typedQuery.length === DEMO_QUERY.length && activeStageIndex === -1) {
      // Start pipeline simulation once typing is done
      setActiveStageIndex(0);
    }
  }, [status, typedQuery, activeStageIndex]);

  // Simulate the backend orchestrator's SSE stream
  useEffect(() => {
    if (activeStageIndex >= 0 && activeStageIndex < stages.length) {
      // Mark current stage as active
      setStages((prev) =>
        prev.map((s, i) => (i === activeStageIndex ? { ...s, status: "active" } : s))
      );

      // Simulate processing time for this specific engine layer
      const processingTime = activeStageIndex === 2 ? 1500 : 800; // Compute takes longer

      const timeout = setTimeout(() => {
        setStages((prev) =>
          prev.map((s, i) => (i === activeStageIndex ? { ...s, status: "done" } : s))
        );
        setActiveStageIndex((prev) => prev + 1);
      }, processingTime);

      return () => clearTimeout(timeout);
    } else if (activeStageIndex === stages.length) {
      setStatus("complete");
    }
  }, [activeStageIndex, stages.length]);

  const handleRun = () => {
    if (status === "idle") {
      setStatus("running");
      setTypedQuery("");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setTypedQuery("");
    setActiveStageIndex(-1);
    setStages((prev) => prev.map((s) => ({ ...s, status: "pending" })));
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 lg:px-8 font-sans">
      <div className="flex flex-col items-center mb-10 text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white mb-4">
          Experience the <span className="text-blue-400">Autonomous Engine</span>
        </h2>
        <p className="text-neutral-400 max-w-2xl">
          Watch as DataOmen routes intent, generates optimized SQL, executes via vector compute, and delivers executive-ready insights in milliseconds.
        </p>
      </div>

      {/* Terminal/IDE Window Mockup */}
      <div className="rounded-xl border border-white/10 bg-neutral-900/50 backdrop-blur-xl shadow-2xl overflow-hidden">
        
        {/* Window Chrome */}
        <div className="flex items-center px-4 py-3 border-b border-white/5 bg-neutral-900/80">
          <div className="flex space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
          </div>
          <div className="mx-auto text-xs font-medium text-neutral-500 uppercase tracking-widest">
            DataOmen Interactive Terminal
          </div>
        </div>

        <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column: Input & Pipeline Status */}
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-400">Ask your data anything</label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={status === "idle" ? "" : typedQuery}
                  placeholder="e.g., Analyze Q3 Enterprise churn rates..."
                  className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 px-4 text-slate-50 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                />
                <button
                  onClick={status === "idle" ? handleRun : handleReset}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-1.5 px-4 rounded-md transition-colors"
                >
                  {status === "idle" ? "Run Analysis" : "Reset"}
                </button>
              </div>
            </div>

            {/* Pipeline Stage Indicators */}
            <div className="flex-grow bg-neutral-950/50 rounded-lg border border-white/5 p-5 font-mono text-sm space-y-4">
              {stages.map((stage, index) => (
                <div key={stage.id} className="flex items-center gap-3">
                  <div className="w-5 flex justify-center">
                    {stage.status === "pending" && <span className="text-neutral-700">•</span>}
                    {stage.status === "active" && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    )}
                    {stage.status === "done" && <span className="text-emerald-500">✓</span>}
                  </div>
                  <span
                    className={`transition-colors duration-300 ${
                      stage.status === "pending"
                        ? "text-neutral-600"
                        : stage.status === "active"
                        ? "text-blue-400"
                        : "text-neutral-300"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Output Visualization */}
          <div className="bg-neutral-950 border border-white/5 rounded-lg overflow-hidden flex flex-col relative min-h-[300px]">
            {status === "idle" && (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-sm">
                Awaiting input to generate insights...
              </div>
            )}

            {status !== "idle" && (
              <>
                {/* Result Tabs */}
                <div className="flex border-b border-white/5">
                  <button className="px-4 py-2 text-xs font-medium text-blue-400 border-b-2 border-blue-500 bg-blue-500/5">
                    Executive Summary
                  </button>
                  <button className="px-4 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-300 transition-colors">
                    Generated SQL
                  </button>
                </div>

                {/* Simulated Result Payload */}
                <div className="p-5 flex-grow overflow-y-auto custom-scrollbar">
                  {status === "complete" ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="p-4 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 text-sm leading-relaxed">
                        <strong>Insight:</strong> Enterprise churn in Q3 increased by 2.4% primarily due to a drop in platform usage following the v4.0 update. Customers utilizing the new API endpoints showed a 98% retention rate.
                      </div>
                      
                      {/* Fake Data Visualization Block */}
                      <div className="h-32 w-full mt-4 flex items-end gap-2 pt-4 border-b border-white/10">
                        {[40, 30, 60, 80, 45, 25, 55].map((height, i) => (
                          <div 
                            key={i} 
                            className="flex-1 bg-blue-500/20 border-t border-blue-500/50 rounded-t-sm hover:bg-blue-400/40 transition-colors"
                            style={{ height: `${height}%` }}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-neutral-500 uppercase tracking-wider px-1">
                        <span>Jul</span>
                        <span>Aug</span>
                        <span>Sep</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}