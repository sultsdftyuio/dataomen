"use client";

import React from "react";
import { ArrowRight, Shield, Lock, CheckCircle2 } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

const integrations = [
  "PostgreSQL",
  "Snowflake",
  "Stripe",
  "Shopify",
  "Salesforce",
  "Google BigQuery",
  "MySQL",
  "AWS Redshift",
  "S3 Parquet",
  "DuckDB",
  "Google Analytics 4"
];

export function IntegrationsAndSecurity() {
  const [ref, vis] = useVisible(0.1);
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";
  const darkSurfaceBorder = "1px solid rgba(255,255,255,0.12)";

  return (
    <section id="integrations" style={{ padding: "140px 24px", background: "#fff", borderTop: surfaceBorder, fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }} ref={ref as React.RefObject<HTMLDivElement>}>

        {/* Header Block */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 60 }}>
          <h2 className="pfd" style={{ fontSize: "clamp(38px, 5vw, 48px)", color: C.navy, marginBottom: 18, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
            Connect your data. Secure your insights.
          </h2>
          <p style={{ color: C.navySoft, fontSize: 17, maxWidth: 660, margin: "0 auto", lineHeight: 1.62 }}>
            No engineering tickets or ETL pipelines required. Arcli securely authenticates with your tools 
            and automatically maps your metadata for instant conversational analysis.
          </p>
        </div>

        {/* Integration grid */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          flexWrap: "wrap", gap: 10, marginBottom: 96,
        }}>
          {integrations.map((name, i) => (
            <div
              key={i}
              style={{
                height: 40,
                padding: "0 14px",
                background: "#fff",
                border: surfaceBorder,
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: "0.02em",
                color: C.navy,
                boxShadow: surfaceShadow,
                transition: "all 0.2s",
                cursor: "default",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseOver={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = C.blue;
                (e.currentTarget as HTMLDivElement).style.color = C.blue;
                (e.currentTarget as HTMLDivElement).style.background = "#FAFAFA";
              }}
              onMouseOut={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,0,0,0.08)";
                (e.currentTarget as HTMLDivElement).style.color = C.navy;
                (e.currentTarget as HTMLDivElement).style.background = "#fff";
              }}
            >
              {name}
            </div>
          ))}
          <div style={{ height: 40, padding: "0 14px", border: "1px dashed rgba(0,0,0,0.2)", borderRadius: 8, fontWeight: 600, color: C.faint, fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            + Custom Connectors
          </div>
        </div>

        {/* Security bento */}
        <div id="security" className="bento-grid">

          {/* Main security card */}
          <div className={`fu ${vis ? "vis" : ""}`} style={{
            background: C.navy,
            borderRadius: 8,
            padding: 28,
            color: "#FFFFFF",
            position: "relative",
            overflow: "hidden",
            border: darkSurfaceBorder,
            boxShadow: surfaceShadow,
          }}>
            <Shield size={16} color={C.blueLight} style={{ marginBottom: 14 }} />
            <h3 className="pfd" style={{ fontSize: 30, marginBottom: 12, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.08 }}>Security by Design</h3>
            <p style={{ color: C.faint, fontSize: 15, lineHeight: 1.62, maxWidth: 560, marginBottom: 18 }}>
              Your raw data never leaves your infrastructure. Arcli connects via 100% read-only credentials, 
              and our AI agents only process metadata to generate queries—ensuring row-level privacy at every step.
            </p>
            <a href="/security" style={{ height: 40, padding: "0 14px", borderRadius: 8, border: darkSurfaceBorder, boxShadow: surfaceShadow, color: "#FFFFFF", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", background: "rgba(255,255,255,0.12)", letterSpacing: "0.02em" }}>
              Explore our Security Architecture <ArrowRight size={14} />
            </a>
          </div>

          {/* Corrected Compliance & Engineering Guardrails */}
          <div className={`fu ${vis ? "vis" : ""}`} style={{
            background: "#FAFAFA",
            borderRadius: 8,
            padding: 24,
            border: surfaceBorder,
            boxShadow: surfaceShadow,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}>
            <Lock size={16} color={C.navy} style={{ marginBottom: 12 }} />
            <h3 className="pfd" style={{ fontSize: 24, color: C.navy, marginBottom: 14, fontWeight: 600, lineHeight: 1.1 }}>Infrastructure Guardrails</h3>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "Strict Tenant Isolation",     // Enforced via context wrappers
                "Hashed Storage Pathing",      // Isolated R2/S3 directory structures
                "Vectorized PII Masking",      // HMAC-SHA256 anonymization
                "Secure Credential Vault",     // Fernet encryption for all secrets
                "Immutable Audit Logging",     // Full prompt and SQL transparency
                "Automated Schema Jailing"     // Drops unauthorized data on ingestion
              ].map((item, i) => (
                <li key={i} style={{ display: "flex", gap: 8, alignItems: "center", color: C.muted, fontSize: 14, fontWeight: 600 }}>
                  <CheckCircle2 size={14} color={C.blue} style={{ flexShrink: 0 }} /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}