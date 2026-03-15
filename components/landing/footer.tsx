"use client";

import { Database } from "lucide-react";
import { C } from "@/lib/tokens";

const links = {
  Product:  ["Platform", "AI Agents", "Integrations", "Changelog"],
  Company:  ["About", "Blog", "Careers", "Press"],
  Legal:    ["Privacy Policy", "Terms of Service", "Security", "GDPR"],
  Support:  ["Documentation", "Status", "Contact", "Community"],
};

export function Footer() {
  return (
    <footer style={{ background: "#fff", borderTop: `1px solid ${C.rule}`, padding: "80px 24px 40px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>

        {/* Top row */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 40, marginBottom: 64 }}>

          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Database size={14} color="#fff" />
              </div>
              <span style={{ fontSize: 20, fontWeight: 800, color: C.navy, letterSpacing: "-0.03em", textTransform: "uppercase" }}>
                Arclis<span style={{ color: C.blue }}>.</span>
              </span>
            </div>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, maxWidth: 280 }}>
              The AI data analyst for modern teams. Ask questions. Get charts. Deploy agents. No SQL required.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([heading, items]) => (
            <div key={heading}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                {heading}
              </p>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map(item => (
                  <li key={item}>
                    <a href="#" style={{ textDecoration: "none", color: C.muted, fontSize: 14, fontWeight: 500, transition: "color 0.15s" }}
                      onMouseOver={e => (e.currentTarget.style.color = C.navy)}
                      onMouseOut={e  => (e.currentTarget.style.color = C.muted)}
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 28, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <p style={{ fontSize: 13, color: C.faint }}>
            © 2026 Arclis Technologies Inc. · SOC2 Type II Certified
          </p>
          <p style={{ fontSize: 13, color: C.faint }}>
            Made with care for data teams worldwide.
          </p>
        </div>
      </div>
    </footer>
  );
}