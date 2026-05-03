"use client";

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Database,
  ArrowRight,
  Loader2,
} from "lucide-react";

import { C } from "@/lib/tokens";

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

export default function BusinessBreakDetector({ tenantId }: { tenantId: string }) {
  const [activeMetric, setActiveMetric] = useState("revenue");
  const [status, setStatus] = useState<AnomalyResult | null>(null);
  const [loading, setLoading] = useState(false);

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  useEffect(() => {
    if (!tenantId) return;

    let mounted = true;

    const run = async () => {
      setLoading(true);

      try {
        const res = await fetch("/api/metrics/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            metric_name: activeMetric,
          }),
        });

        const data = await res.json();
        if (mounted) setStatus(data);
      } catch (e) {
        if (mounted) {
          setStatus({
            isAnomaly: true,
            message: "System failed to analyze metric.",
            cause: "Unexpected API failure",
            recommendation: "Retry or check integration health.",
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [activeMetric, tenantId]);

  return (
    <section style={{ padding: "120px 24px", background: "#FFFFFF" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        
        {/* ── Header ── */}
        <div style={{ marginBottom: 80 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: C.blue,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 16
          }}>
            <Database size={14} />
            AI WATCHDOG
          </div>

          <h1 style={{
            fontSize: 40,
            fontWeight: 600,
            color: C.navy,
            letterSpacing: "-0.02em",
            marginBottom: 16
          }}>
            Live anomaly detection.
          </h1>

          <p style={{
            color: C.navySoft,
            fontSize: 17,
            lineHeight: 1.6,
            maxWidth: 540
          }}>
            Your metrics are continuously analyzed against behavioral baselines.
            When something breaks, DataOmen tells you why — instantly.
          </p>
        </div>

        {/* ── Controls ── */}
        <div style={{
          background: "#FAFAFA",
          border: surfaceBorder,
          borderRadius: 8,
          padding: 20,
          marginBottom: 40,
          boxShadow: surfaceShadow
        }}>
          <label style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: C.faint,
            textTransform: "uppercase",
            marginBottom: 8,
            display: "block"
          }}>
            Metric
          </label>

          <select
            value={activeMetric}
            onChange={(e) => setActiveMetric(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: surfaceBorder,
              fontSize: 14,
              fontWeight: 600,
              color: C.navy,
              background: "#fff",
              boxShadow: surfaceShadow
            }}
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── Result Card ── */}
        <div style={{ position: "relative" }}>
          <div style={{
            background: "#FFFFFF",
            border: surfaceBorder,
            borderRadius: 8,
            padding: 28,
            position: "relative",
            zIndex: 2,
            boxShadow: surfaceShadow
          }}>

            {/* Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 20,
              borderBottom: surfaceBorder,
              paddingBottom: 12
            }}>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.05em",
                color: C.faint
              }}>
                LIVE ANALYSIS
              </span>

              {loading && (
                <span style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: C.faint
                }}>
                  <Loader2 size={14} className="animate-spin" />
                  Analyzing...
                </span>
              )}
            </div>

            {/* Loading State */}
            {loading && (
              <div style={{ color: C.navySoft, fontSize: 14 }}>
                Building behavioral baseline... Detecting deviation patterns...
              </div>
            )}

            {/* Result */}
            {!loading && status && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                
                {/* Main Insight */}
                <div style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start"
                }}>
                  {status.isAnomaly ? (
                    <AlertTriangle size={18} color={C.red} />
                  ) : (
                    <CheckCircle2 size={18} color={C.green} />
                  )}

                  <div>
                    <div style={{
                      fontWeight: 600,
                      fontSize: 16,
                      color: C.navy
                    }}>
                      {status.isAnomaly
                        ? "AI Diagnosis: Anomaly detected"
                        : "System nominal"}
                    </div>

                    <div style={{
                      fontSize: 14,
                      color: C.navySoft,
                      marginTop: 4
                    }}>
                      {status.message}
                    </div>
                  </div>
                </div>

                {/* Cause */}
                {status.isAnomaly && status.cause && (
                  <div style={{
                    background: "#FAFAFA",
                    border: surfaceBorder,
                    borderRadius: 8,
                    padding: 16
                  }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: C.faint,
                      marginBottom: 6
                    }}>
                      ROOT CAUSE
                    </div>

                    <div style={{ fontSize: 14, color: C.navy }}>
                      {status.cause}
                    </div>
                  </div>
                )}

                {/* Recommendation */}
                {status.isAnomaly && status.recommendation && (
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#FFFFFF",
                    border: surfaceBorder,
                    borderRadius: 8,
                    padding: "14px 16px",
                    boxShadow: surfaceShadow
                  }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: C.navy
                    }}>
                      {status.recommendation}
                    </div>

                    <ArrowRight size={16} color={C.faint} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Offset background (DataOmen signature) */}
          <div style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: -12,
            bottom: -12,
            background: "#F3F4F6",
            borderRadius: 8,
            zIndex: 1,
            border: surfaceBorder
          }} />
        </div>
      </div>
    </section>
  );
}