"use client";

import { ArrowRight, Shield, Lock, CheckCircle2 } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

const integrations = ["Stripe", "PostgreSQL", "Snowflake", "Shopify", "Salesforce", "BigQuery", "MySQL", "Redshift"];

export function IntegrationsAndSecurity() {
  const [ref, vis] = useVisible(0.1);

  return (
    <section id="integrations" style={{ padding: "140px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }} ref={ref as React.RefObject<HTMLDivElement>}>

        {/* Header */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 80 }}>
          <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24 }}>
            Connect your data. Secure your insights.
          </h2>
          <p style={{ color: C.muted, fontSize: 18, maxWidth: 600, margin: "0 auto" }}>
            No engineering tickets or ETL pipelines required. Arcli securely authenticates with your tools and automatically maps your data for instant analysis.
          </p>
        </div>

        {/* Integration grid */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          flexWrap: "wrap", gap: 16, marginBottom: 120,
        }}>
          {integrations.map((name, i) => (
            <div
              key={i}
              style={{
                padding: "14px 24px",
                background: "#fff",
                border: `1.5px solid ${C.ruleDark}`,
                borderRadius: 12, fontWeight: 700, color: C.navy,
                boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                transition: "all 0.2s",
                cursor: "default",
              }}
              onMouseOver={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = C.blue;
                (e.currentTarget as HTMLDivElement).style.color = C.blue;
                (e.currentTarget as HTMLDivElement).style.background = C.bluePale;
              }}
              onMouseOut={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = C.ruleDark;
                (e.currentTarget as HTMLDivElement).style.color = C.navy;
                (e.currentTarget as HTMLDivElement).style.background = "#fff";
              }}
            >
              {name}
            </div>
          ))}
          <div style={{ padding: "14px 24px", border: `1.5px dashed ${C.ruleDark}`, borderRadius: 12, fontWeight: 600, color: C.faint, fontSize: 14 }}>
            + 40 more
          </div>
        </div>

        {/* Security bento */}
        <div id="security" className="bento-grid">

          {/* Main security card */}
          <div className={`fu ${vis ? "vis" : ""}`} style={{
            background: C.navy, borderRadius: 24, padding: 56,
            color: "#fff", position: "relative", overflow: "hidden",
          }}>
            <Shield size={48} color={C.blueLight} style={{ marginBottom: 24 }} />
            <h3 className="pfd" style={{ fontSize: 32, marginBottom: 16 }}>Enterprise-Grade Trust</h3>
            <p style={{ color: C.faint, fontSize: 16, lineHeight: 1.65, maxWidth: 420, marginBottom: 32 }}>
              Your raw data never leaves your infrastructure. Arcli connects via 100% read-only credentials, and our AI models only process metadata to generate queries—never your sensitive row-level data.
            </p>
            <a href="#" style={{ color: C.blueLight, fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              Read our Security Whitepaper <ArrowRight size={16} />
            </a>
            <div style={{ position: "absolute", right: -24, bottom: -24, opacity: 0.07 }}>
              <Shield size={220} />
            </div>
          </div>

          {/* Compliance card */}
          <div className={`fu ${vis ? "vis" : ""}`} style={{
            background: C.offWhite, borderRadius: 24, padding: 48,
            border: `1px solid ${C.rule}`, display: "flex", flexDirection: "column", justifyContent: "center",
          }}>
            <Lock size={40} color={C.navy} style={{ marginBottom: 24 }} />
            <h3 className="pfd" style={{ fontSize: 26, color: C.navy, marginBottom: 20 }}>Compliance Built-In</h3>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              {["SOC2 Type II Certified", "GDPR & CCPA Compliant", "Zero Data Retention Policy", "AES-256 Data Encryption", "Enterprise SSO / SAML"].map((item, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "center", color: C.muted, fontSize: 15, fontWeight: 500 }}>
                  <CheckCircle2 size={16} color={C.blue} style={{ flexShrink: 0 }} /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}