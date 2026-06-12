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

// Import centralized design tokens
import { C } from "@/lib/tokens";

// Import the newly built Command Center for API Keys
import { ApiKeysManager } from "./api-keys-manager";

export function DataSourcesTab() {
  const [ref0, vis0] = useVisible(0.1);

  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 2px 8px rgba(10, 22, 40, 0.04)";

  return (
    <section style={{ padding: "60px 24px", background: C.white, fontFamily: sans }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }} ref={ref0 as React.RefObject<HTMLDivElement>}>
        
        {/* ── Section Header ── */}
        <div className={`fu ${vis0 ? "vis" : ""}`} style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 64px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", marginBottom: 14, textTransform: "uppercase" }}>
            <Database size={14} /> Pipeline Inputs
          </div>
          <h2 className="pfd" style={{ fontSize: 38, color: C.navy, marginBottom: 16, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
            Data Sources & Webhooks
          </h2>
          <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62 }}>
            Manage the input layer of your recovery engine. Arcli requires a healthy billing connection and an active delivery provider to orchestrate recovery.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 56 }}>
          
          {/* ── Stripe Integration ── */}
          <div style={{ position: "relative" }}>
            <div style={{ background: C.white, padding: 28, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: C.offWhite, border: surfaceBorder, color: "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: surfaceShadow }}>
                  <CreditCard size={24} />
                </div>
                <div>
                  <h3 className="pfd" style={{ fontSize: 18, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Stripe Billing</h3>
                  <p style={{ fontSize: 15, color: C.navySoft, lineHeight: 1.5 }}>
                    Listens for <code style={{background: C.offWhite, border: surfaceBorder, padding: "2px 6px", borderRadius: 4}}>invoice.payment_failed</code> to detect churn risk.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: C.green, background: C.greenPale, padding: "6px 12px", borderRadius: 6, border: `1px solid rgba(16, 185, 129, 0.2)` }}>
                  <CheckCircle2 size={15} /> HEALTHY
                </span>
                <button style={{ height: 38, padding: "0 18px", borderRadius: 8, border: surfaceBorder, background: C.white, color: C.navy, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: surfaceShadow, letterSpacing: "0.02em" }}>
                  Manage
                </button>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 10, left: 10, right: -10, bottom: -10, background: C.offWhite, borderRadius: 8, zIndex: 1, border: surfaceBorder }} />
          </div>

          {/* ── Email Delivery Integration ── */}
          <div style={{ position: "relative" }}>
            <div style={{ background: C.white, padding: 28, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: C.offWhite, border: surfaceBorder, color: C.amber, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: surfaceShadow }}>
                  <Mail size={24} />
                </div>
                <div>
                  <h3 className="pfd" style={{ fontSize: 18, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Email Delivery (Resend)</h3>
                  <p style={{ fontSize: 15, color: C.navySoft, lineHeight: 1.5 }}>
                    Dispatches recovery sequences securely to at-risk subscribers.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: C.green, background: C.greenPale, padding: "6px 12px", borderRadius: 6, border: `1px solid rgba(16, 185, 129, 0.2)` }}>
                  <CheckCircle2 size={15} /> CONNECTED
                </span>
                <button style={{ height: 38, padding: "0 18px", borderRadius: 8, border: surfaceBorder, background: C.white, color: C.navy, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: surfaceShadow, letterSpacing: "0.02em" }}>
                  Manage
                </button>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 10, left: 10, right: -10, bottom: -10, background: C.offWhite, borderRadius: 8, zIndex: 1, border: surfaceBorder }} />
          </div>

          {/* ── Ingest API Reference ── */}
          <div style={{ position: "relative" }}>
            <div style={{ background: C.white, padding: 28, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: C.bluePale, border: `1px solid ${C.rule}`, color: C.blue, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: surfaceShadow }}>
                  <Webhook size={24} />
                </div>
                <div>
                  <h3 className="pfd" style={{ fontSize: 18, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Custom Event Ingestion</h3>
                  <p style={{ fontSize: 15, color: C.navySoft, lineHeight: 1.5 }}>
                    Push raw activity events (e.g., <code style={{background: C.offWhite, border: surfaceBorder, padding: "2px 6px", borderRadius: 4}}>app.session_started</code>) to: <br/>
                    <code style={{background: C.offWhite, border: surfaceBorder, padding: "4px 8px", borderRadius: 6, color: C.navy, marginTop: 8, display: "inline-block", fontWeight: 600, fontSize: 13}}>POST https://ingest.arcli.io/v1/events</code>
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: C.navySoft, background: C.offWhite, padding: "6px 12px", borderRadius: 6, border: surfaceBorder }}>
                  <Activity size={15} /> LISTENING
                </span>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 10, left: 10, right: -10, bottom: -10, background: C.bluePale, borderRadius: 8, zIndex: 1, border: surfaceBorder }} />
          </div>

          {/* ── The Real Production API Keys Manager ── */}
          <ApiKeysManager />

          {/* ── System Audit Log (Deterministic Observability) ── */}
          <div style={{ position: "relative", marginTop: 16 }}>
            <div style={{ background: C.navy, color: C.rule, padding: "24px 28px", borderRadius: 8, fontSize: 13, position: "relative", zIndex: 2, boxShadow: surfaceShadow, lineHeight: 1.6, border: `1px solid ${C.navyMid}`, fontFamily: "monospace" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, borderBottom: `1px solid ${C.navySoft}`, paddingBottom: 12 }}>
                <span style={{ fontSize: 11, color: C.faint, letterSpacing: "0.08em", fontFamily: sans, textTransform: "uppercase", fontWeight: 700 }}>
                  CONNECTION AUDIT LOG
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.faint, fontFamily: sans, fontWeight: 500 }}>
                  <AlertCircle size={13} /> Read-only system events
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div><span style={{ color: C.green, fontWeight: 600 }}>[OK]</span> 14:32:01 UTC - Stripe webhook signature verified.</div>
                <div><span style={{ color: C.green, fontWeight: 600 }}>[OK]</span> 14:30:45 UTC - Custom event <span style={{ color: C.white, fontWeight: 500 }}>app.session_started</span> processed (200 OK).</div>
                <div><span style={{ color: C.blueLight, fontWeight: 600 }}>[INFO]</span> 13:15:00 UTC - Resend delivery token refreshed successfully.</div>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: -8, left: 8, right: -8, bottom: 8, background: C.navySoft, borderRadius: 8, zIndex: 1, opacity: 0.4, border: `1px solid ${C.navyMid}` }} />
          </div>

        </div>
      </div>
    </section>
  );
}