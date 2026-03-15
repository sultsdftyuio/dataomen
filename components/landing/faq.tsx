"use client";

import { useState } from "react";
import { C } from "@/lib/tokens";

const items = [
  {
    q: "What if my database schema is messy or undocumented?",
    a: "Arclis's semantic layer is designed for the real world. During setup, it scans your schema and allows you to add plain-English descriptions to tables or columns. It learns your business logic quickly.",
  },
  {
    q: "Do you train your AI on my proprietary data?",
    a: "Absolutely not. We use enterprise-grade LLM endpoints with zero-data-retention policies. Furthermore, only structural metadata (like column names) is sent to the LLM to generate the SQL query. Your actual row data stays in your infrastructure.",
  },
  {
    q: "How long does setup really take?",
    a: "Usually less than 5 minutes. You securely authenticate your data sources (like Stripe or a read-only Postgres replica), Arclis maps the relationships, and you can start asking questions immediately.",
  },
  {
    q: "How does pricing scale?",
    a: "Pricing is based on compute (queries run) rather than per-seat licenses. This means you can invite your entire organization to use Arclis without paying arbitrary license fees per user.",
  },
  {
    q: "Can I use Arclis with multiple data sources simultaneously?",
    a: "Yes. Arclis can join and query across multiple connected sources in a single question. Ask \"Compare our Stripe revenue to our Salesforce pipeline\" and Arclis will query both, join them semantically, and give you a unified answer.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section style={{ padding: "100px 24px", background: C.offWhite, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 className="pfd" style={{ fontSize: 38, textAlign: "center", marginBottom: 64, color: C.navy }}>
          Frequently Asked Questions
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${open === i ? C.blueLight : C.ruleDark}`,
                borderRadius: 16, overflow: "hidden",
                transition: "all 0.2s", background: "#fff",
                boxShadow: open === i ? "0 8px 24px rgba(27,110,191,0.07)" : "none",
              }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: "100%", padding: "26px 28px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: open === i ? C.bluePale : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left",
                  transition: "background 0.2s",
                }}
              >
                <span style={{ fontWeight: 700, color: C.navy, fontSize: 16, paddingRight: 24 }}>
                  {item.q}
                </span>
                <span style={{ color: open === i ? C.blue : C.muted, fontSize: 22, fontWeight: 300, flexShrink: 0 }}>
                  {open === i ? "−" : "+"}
                </span>
              </button>

              {open === i && (
                <div style={{ padding: "0 28px 28px", color: C.muted, lineHeight: 1.75, fontSize: 15 }}>
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