"use client";

import React from "react";
import { 
  CheckCircle2, 
  Database, 
  Webhook, 
  CreditCard, 
  Mail, 
  Activity, 
  AlertCircle
} from "lucide-react";
import { useVisible } from "@/hooks/useVisible";

// Import the newly built Command Center for API Keys
import { ApiKeysManager } from "./api-keys-manager";

// Design tokens
const C = {
  navy: "#0F172A",
  navySoft: "#334155",
  faint: "#64748B",
  blue: "#2563EB",
  green: "#10B981",
  red: "#EF4444"
};

export function DataSourcesTab() {
  const [ref0, vis0] = useVisible(0.1);

  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section style={{ padding: "40px 24px", background: "#FFFFFF", fontFamily: sans }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }} ref={ref0 as React.RefObject<HTMLDivElement>}>
        
        {/* ── Section Header ── */}
        <div className={`fu ${vis0 ? "vis" : ""}`} style={{ marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", marginBottom: 14, textTransform: "uppercase" }}>
            <Database size={14} /> Pipeline Inputs
          </div>
          <h2 style={{ fontSize: 32, color: C.navy, marginBottom: 12, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
            Data Sources & Webhooks
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62, maxWidth: 600 }}>
            Manage the input layer of your recovery engine. Arcli requires a healthy billing connection and an active delivery provider to orchestrate recovery.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          
          {/* ── Stripe Integration ── */}
          <div style={{ background: "#FAFAFA", padding: 24, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, background: "#FFFFFF", border: surfaceBorder, color: "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: surfaceShadow }}>
                <CreditCard size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Stripe Billing</h3>
                <p style={{ fontSize: 14, color: C.faint, lineHeight: 1.4 }}>
                  Listens for <code style={{background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4}}>invoice.payment_failed</code> to detect churn risk.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.green, background: "rgba(16,185,129,0.08)", padding: "6px 12px", borderRadius: 6, border: surfaceBorder }}>
                <CheckCircle2 size={14} /> HEALTHY
              </span>
              <button style={{ height: 36, padding: "0 16px", borderRadius: 6, border: surfaceBorder, background: "#FFFFFF", color: C.navy, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Manage
              </button>
            </div>
          </div>

          {/* ── Email Delivery Integration ── */}
          <div style={{ background: "#FAFAFA", padding: 24, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, background: "#FFFFFF", border: surfaceBorder, color: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: surfaceShadow }}>
                <Mail size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Email Delivery (Resend)</h3>
                <p style={{ fontSize: 14, color: C.faint, lineHeight: 1.4 }}>
                  Dispatches recovery sequences securely to at-risk subscribers.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.green, background: "rgba(16,185,129,0.08)", padding: "6px 12px", borderRadius: 6, border: surfaceBorder }}>
                <CheckCircle2 size={14} /> CONNECTED
              </span>
              <button style={{ height: 36, padding: "0 16px", borderRadius: 6, border: surfaceBorder, background: "#FFFFFF", color: C.navy, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Manage
              </button>
            </div>
          </div>

          {/* ── Ingest API Reference ── */}
          <div style={{ background: "#FAFAFA", padding: 24, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, background: "rgba(59,130,246,0.1)", color: C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Webhook size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Custom Event Ingestion</h3>
                <p style={{ fontSize: 14, color: C.faint, lineHeight: 1.4 }}>
                  Push raw activity events (e.g., <code style={{background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4}}>app.session_started</code>) to: <br/>
                  <code style={{background: "#E2E8F0", padding: "2px 6px", borderRadius: 4, color: C.navy, marginTop: 6, display: "inline-block", fontWeight: 600}}>POST https://ingest.arcli.io/v1/events</code>
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.navySoft, background: "#F3F4F6", padding: "6px 12px", borderRadius: 6, border: surfaceBorder }}>
                <Activity size={14} /> LISTENING
              </span>
            </div>
          </div>

          {/* ── The Real Production API Keys Manager ── */}
          <ApiKeysManager />

          {/* ── System Audit Log (Deterministic Observability) ── */}
          <div style={{ background: "#111827", color: "#D1D5DB", padding: "20px 24px", borderRadius: 8, fontSize: 12, boxShadow: surfaceShadow, lineHeight: 1.6, fontFamily: "monospace" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "#9CA3AF", letterSpacing: "0.08em", fontFamily: sans, textTransform: "uppercase" }}>
                CONNECTION AUDIT LOG
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#9CA3AF", fontFamily: sans }}>
                <AlertCircle size={12} /> Read-only system events
              </span>
            </div>
            <div>
              <span style={{ color: C.green }}>[OK]</span> 14:32:01 UTC - Stripe webhook signature verified.<br />
              <span style={{ color: C.green }}>[OK]</span> 14:30:45 UTC - Custom event <span style={{ color: "#fff" }}>app.session_started</span> processed (200 OK).<br />
              <span style={{ color: C.blue }}>[INFO]</span> 13:15:00 UTC - Resend delivery token refreshed successfully.<br />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}