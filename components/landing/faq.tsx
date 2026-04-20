"use client";

import { useState } from "react";
import { C } from "@/lib/tokens";

const items = [
  {
    q: "What if my database schema is messy or undocumented?",
    a: "Arcli's AI is built for real-world, messy data. During setup, it automatically maps your schema relationships. You can also add plain-English definitions to tables or columns so the AI instantly learns your unique business logic.",
  },
  {
    q: "Do you train your AI on my proprietary data?",
    a: "Never. We use enterprise-grade models with strict zero-data-retention policies. Arcli only looks at your structural metadata (like column names) to write the SQL. Your actual customer and revenue data never leaves your secure infrastructure.",
  },
  {
    q: "How long does setup really take?",
    a: "Under 5 minutes. Securely connect your data source (like a read-only Postgres replica or Stripe), and Arcli instantly maps the relationships. You can start asking plain-English questions immediately—no engineering tickets required.",
  },
  {
    q: "How does pricing scale? Do I pay per user?",
    a: "We charge based on compute (queries run), not per-seat licenses. We believe insights should be accessible to everyone, so you can invite your entire organization to use Arcli without paying arbitrary license fees per user.",
  },
  {
    q: "Can I query multiple data sources at the same time?",
    a: "Yes. Arcli can join and query across multiple connected sources on the fly. Ask \"Compare our Stripe revenue to our Salesforce pipeline\" and Arcli will seamlessly merge the data to give you a single, unified chart.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section style={{ padding: "100px 24px", background: "#FAFAFA", borderTop: surfaceBorder, fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ fontSize: "clamp(32px, 5vw, 44px)", textAlign: "center", marginBottom: 44, color: C.navy, lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 700 }}>
          Frequently Asked Questions
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                border: open === i ? "1px solid rgba(37,99,235,0.45)" : surfaceBorder,
                borderRadius: 8,
                overflow: "hidden",
                transition: "all 0.2s", background: "#fff",
                boxShadow: surfaceShadow,
              }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: "100%", padding: "14px 16px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: open === i ? "#F8FAFC" : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left",
                  transition: "background 0.2s",
                }}
              >
                <span style={{ fontWeight: 600, color: C.navy, fontSize: 14, lineHeight: 1.5, paddingRight: 16 }}>
                  {item.q}
                </span>
                <span style={{ color: open === i ? C.blue : C.muted, fontSize: 18, fontWeight: 600, lineHeight: 1, flexShrink: 0 }}>
                  {open === i ? "−" : "+"}
                </span>
              </button>

              {open === i && (
                <div style={{ padding: "0 16px 14px", color: C.muted, lineHeight: 1.6, fontSize: 14 }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}