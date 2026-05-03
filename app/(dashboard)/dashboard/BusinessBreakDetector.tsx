"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, Link as LinkIcon, Code, Loader2 } from "lucide-react";

const METRICS = [
  { id: "revenue", label: "Revenue (Stripe)" },
  { id: "signups", label: "Signups (Events)" },
  { id: "logins", label: "Logins (Events)" },
  { id: "active_users", label: "Active Users (Events)" },
  { id: "conversion_rate", label: "Conversion Rate (Events)" },
];

interface AnomalyResult {
  isAnomaly: boolean;
  message: string;
  cause?: string;
  recommendation?: string;
}

interface BusinessBreakDetectorProps {
  tenantId: string;
}

export default function BusinessBreakDetector({ tenantId }: BusinessBreakDetectorProps) {
  const [activeMetric, setActiveMetric] = useState("revenue");
  const [activeTab, setActiveTab] = useState<"alerts" | "setup">("alerts");

  const [status, setStatus] = useState<AnomalyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "alerts" || !tenantId) return;

    let isMounted = true;
    const runDetection = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/metrics/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            metric_name: activeMetric,
          }),
        });

        if (!res.ok) throw new Error("Failed to run metric detection");

        const data = await res.json();
        if (isMounted) setStatus(data);
      } catch (err: any) {
        if (isMounted) setError(err.message || "An error occurred");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    runDetection();
    return () => {
      isMounted = false;
    };
  }, [activeMetric, activeTab, tenantId]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Arcli</h1>
        <p className="text-slate-500 mt-2 font-medium">Business Break Detector</p>
      </header>

      <div className="flex space-x-6 border-b border-slate-200 pb-px">
        <button
          onClick={() => setActiveTab("alerts")}
          className={`pb-2 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "alerts"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Metric Alerts
        </button>
        <button
          onClick={() => setActiveTab("setup")}
          className={`pb-2 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "setup"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Integration Setup
        </button>
      </div>

      {activeTab === "alerts" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-bold text-slate-700">Select Metric</label>
            <select
              value={activeMetric}
              onChange={(e) => setActiveMetric(e.target.value)}
              className="max-w-sm block w-full rounded-lg border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900 sm:text-sm p-2.5 border bg-white"
            >
              {METRICS.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="p-6 rounded-xl border border-slate-200 bg-white flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              <span className="text-sm font-medium text-slate-600">Analyzing 7-day baseline...</span>
            </div>
          ) : error ? (
            <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold">
              {error}
            </div>
          ) : status ? (
            <div
              className={`p-6 rounded-xl border ${
                status.isAnomaly ? "bg-red-50/50 border-red-200" : "bg-emerald-50/50 border-emerald-200"
              }`}
            >
              <div className="flex items-start gap-4">
                {status.isAnomaly ? (
                  <AlertTriangle className="w-6 h-6 text-red-600 mt-1 flex-shrink-0" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-emerald-600 mt-1 flex-shrink-0" />
                )}

                <div className="space-y-4 w-full">
                  <h3 className={`text-lg font-bold ${status.isAnomaly ? "text-red-900" : "text-emerald-900"}`}>
                    {status.message}
                  </h3>

                  {status.isAnomaly && (
                    <div className="space-y-2 text-sm text-red-800 bg-red-100/50 p-4 rounded-lg">
                      {status.cause && (
                        <p>
                          <span className="font-bold">Main cause:</span> {status.cause}
                        </p>
                      )}
                      <div className="mt-4 pt-4 border-t border-red-200/50">
                        <p className="font-bold text-red-900 mb-1">Recommended Action:</p>
                        <p>{status.recommendation}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {activeTab === "setup" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <LinkIcon className="w-5 h-5 text-indigo-500" />
              <h3 className="text-lg font-bold text-slate-900">Connect Stripe (Revenue)</h3>
            </div>
            <p className="text-sm text-slate-600 font-medium">
              Link your Stripe account to automatically monitor revenue drops and transaction anomalies.
            </p>
            <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition shadow-sm">
              Connect Stripe
            </button>
          </div>
          <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <Code className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-bold text-slate-900">Event Tracking API</h3>
            </div>
            <p className="text-sm text-slate-600 font-medium">
              Send custom product events (signups, logins, active users) directly to our ingestion API.
            </p>
            <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-emerald-400 text-sm font-mono shadow-inner">
              <pre>{`fetch('https://api.arcli.com/track', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    event_name: 'signup',
    user_id: 'usr_123',
    timestamp: new Date().toISOString()
  })
});`}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
