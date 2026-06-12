// app/(dashboard)/dashboard/QuickStartHero.tsx
"use client";

import {
  Activity,
  CheckCircle2,
  Key,
  RefreshCw,
  Sparkles,
  Webhook,
} from "lucide-react";
import React from "react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

interface QuickStartHeroProps {
  isComplete: boolean;
  isAwaitingEvents: boolean;
  hasApiKey: boolean;
  hasReceivedData: boolean;
  canCheckStatus: boolean;
  isPending: boolean;
  showRefreshFlash: boolean;
  lastCheckedLabel: string | null;
  progressPercent: number;
  progressColor: string;
  refreshDashboard: () => void;
}

export default function QuickStartHero({
  isComplete,
  isAwaitingEvents,
  hasApiKey,
  hasReceivedData,
  canCheckStatus,
  isPending,
  showRefreshFlash,
  lastCheckedLabel,
  progressPercent,
  refreshDashboard,
}: QuickStartHeroProps) {
  // Entrance animations matching the landing page
  const [refHero, visHero] = useVisible(0.1);
  const [refProg, visProg] = useVisible(0.1);

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  // Determine colors based on true HEX codes instead of tailwind classes 
  // for the exact inline-style aesthetic
  const barColor = hasReceivedData ? "#10B981" : C.blue;

  return (
    <>
      {/* ================================================================
          HERO SECTION
      ================================================================ */}
      <div 
        className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16 fu ${visHero ? "vis" : ""}`}
        ref={refHero as React.RefObject<HTMLDivElement>}
      >
        
        {/* ── Left: Copy & Messaging ── */}
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", marginBottom: 16, textTransform: "uppercase" }}>
            <Sparkles size={14} /> DETERMINISTIC ONBOARDING
          </div>

          <h1
            id="quickstart-heading"
            className="pfd"
            style={{ fontSize: 42, color: C.navy, marginBottom: 20, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}
          >
            {isComplete
              ? "You're live and monitoring."
              : isAwaitingEvents
                ? "Integration detected."
                : "Welcome to Arcli."}
          </h1>

          <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, maxWidth: 540 }}>
            {isComplete
              ? "Churn scoring, automated recovery workflows, and revenue attribution are fully operational. Your pipeline is processing live events."
              : isAwaitingEvents
                ? "Your API integration is active. Arcli is now waiting for your first Stripe or product events before enabling automated churn detection and recovery workflows."
                : "Connect your billing and product events to begin detecting churn risk, recovering revenue, and automating lifecycle intervention flows."}
          </p>
        </div>

        {/* ── Right: Live Telemetry Panel ── */}
        <div style={{ position: "relative" }}>
          <div style={{ background: "#FFFFFF", padding: 28, borderRadius: 12, border: surfaceBorder, position: "relative", zIndex: 2, boxShadow: surfaceShadow }}>
            
            {/* Panel Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, borderBottom: surfaceBorder, paddingBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.faint, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
                SYSTEM STATUS
              </span>
              <span style={{ 
                display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, 
                color: hasReceivedData ? "#10B981" : C.blue, 
                background: hasReceivedData ? "rgba(16,185,129,0.08)" : "rgba(59,130,246,0.08)", 
                padding: "4px 10px", borderRadius: 8, textTransform: "uppercase"
              }}>
                <Activity size={14} className={!hasReceivedData ? "animate-pulse" : ""} />
                {hasReceivedData ? "ONLINE" : "LISTENING"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              
              {/* Row 1: API Key */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAFA", padding: "14px 16px", borderRadius: 8, border: surfaceBorder }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: hasApiKey ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", color: hasApiKey ? "#10B981" : "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Key size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>API Authentication</div>
                    <div style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>Authorization Header</div>
                  </div>
                </div>
                <div style={{ background: "#fff", border: surfaceBorder, padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: hasApiKey ? "#10B981" : "#F59E0B", boxShadow: surfaceShadow }}>
                  {hasApiKey ? "Connected" : "Pending"}
                </div>
              </div>

              {/* Row 2: Event Stream */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAFA", padding: "14px 16px", borderRadius: 8, border: surfaceBorder }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: hasReceivedData ? "rgba(16,185,129,0.1)" : "rgba(59,130,246,0.1)", color: hasReceivedData ? "#10B981" : C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Webhook size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>Event Ingestion</div>
                    <div style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>Webhook Pipeline</div>
                  </div>
                </div>
                <div style={{ background: "#fff", border: surfaceBorder, padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: hasReceivedData ? "#10B981" : C.blue, boxShadow: surfaceShadow }}>
                  {hasReceivedData ? "Receiving" : "Awaiting"}
                </div>
              </div>

              {/* Refresh / Polling Footer */}
              {canCheckStatus && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, paddingTop: 16, borderTop: "1px dashed rgba(0,0,0,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", minHeight: "1.25rem" }}>
                    {showRefreshFlash ? (
                      <span className="animate-in fade-in" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#10B981" }}>
                        <CheckCircle2 size={14} /> Updated
                      </span>
                    ) : lastCheckedLabel ? (
                      <span style={{ fontSize: 12, color: C.faint, fontWeight: 500 }}>{lastCheckedLabel}</span>
                    ) : (
                      <span />
                    )}
                  </div>
                  
                  <button
                    type="button"
                    onClick={refreshDashboard}
                    disabled={isPending}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "#FFFFFF", border: surfaceBorder, boxShadow: surfaceShadow,
                      padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: C.navy,
                      cursor: isPending ? "not-allowed" : "pointer",
                      opacity: isPending ? 0.6 : 1,
                      transition: "all 0.2s"
                    }}
                  >
                    <RefreshCw size={14} className={isPending ? "animate-spin" : ""} color={C.faint} />
                    {isPending ? "Polling..." : "Poll Status"}
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Offset Background Accent */}
          <div style={{ position: "absolute", top: 16, left: 16, right: -12, bottom: -12, background: "#F3F4F6", borderRadius: 12, zIndex: 1, opacity: 0.9, border: surfaceBorder }} />
        </div>
      </div>

      {/* ================================================================
          PROGRESS BAR
      ================================================================ */}
      <div 
        className={`fu ${visProg ? "vis" : ""}`} 
        ref={refProg as React.RefObject<HTMLDivElement>} 
        style={{ background: "#FFFFFF", borderRadius: 12, border: surfaceBorder, padding: "24px 28px", boxShadow: surfaceShadow, marginBottom: 16 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
          <div>
             <div style={{ color: C.navySoft, fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
               ONBOARDING PROGRESS
             </div>
             <div style={{ fontSize: 18, fontWeight: 600, color: C.navy }}>
               {hasReceivedData
                  ? "Setup complete"
                  : hasApiKey
                    ? "Waiting for incoming events"
                    : "Connect your integration"}
             </div>
          </div>
          <div style={{ textAlign: "right" }}>
             <div className="pfd" style={{ fontSize: 32, fontWeight: 700, color: C.navy, lineHeight: 1, letterSpacing: "-0.02em" }}>
               {progressPercent}%
             </div>
             <div style={{ fontSize: 12, color: C.faint, fontWeight: 500, marginTop: 8 }}>
               System readiness
             </div>
          </div>
        </div>

        <div style={{ height: 6, background: "#F3F4F6", borderRadius: 6, overflow: "hidden" }}>
          <div 
            style={{ 
              height: "100%", 
              width: `${progressPercent}%`, 
              background: barColor, 
              transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)" 
            }} 
          />
        </div>
      </div>
    </>
  );
}