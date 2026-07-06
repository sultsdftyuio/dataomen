"use client";

import { useState } from "react";
import { C } from "@/lib/tokens";

const items = [
  {
    q: "Will Arcli annoy or spam our existing customers?",
    a: "Not at all. Protecting your customer relationships is our top priority. You set strict contact limits and mandatory cooldown periods (for example, contacting a customer at most once every 30 days). Arcli also automatically respects all unsubscribes, bounces, and customer communication preferences.",
  },
  {
    q: "How do you keep our customer data secure and private?",
    a: "We operate on a strict zero-data-retention architecture. Arcli only reads basic activity signals and anonymized identifiers required to detect dropping engagement. We never store raw customer databases, sensitive personal records, or private support conversations.",
  },
  {
    q: "Can our team customize the recovery messages and rules?",
    a: "Yes. You maintain complete control over every message sent and every rule triggered. You can easily tailor the wording, timing, and incentives to match your brand voice and customer lifecycle perfectly.",
  },
  {
    q: "How long does it take to set up and start saving customers?",
    a: "Setup takes just a few minutes. Once you connect your core customer communication and engagement tools, Arcli immediately begins monitoring for early churn indicators and enrolling slipping accounts into your saved workflows.",
  },
  {
    q: "How does pricing scale? Do we pay per team member?",
    a: "We do not charge per-seat licenses. We believe everyone on your team should have visibility into customer retention, so you can invite your entire organization to collaborate within Arcli without paying arbitrary license fees per user.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section style={{ padding: "100px 24px", background: "#FAFAFA", borderTop: surfaceBorder, fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 className="pfd" style={{ fontSize: "clamp(36px, 5vw, 48px)", textAlign: "center", marginBottom: 44, color: C.navy, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
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
                <span style={{ fontWeight: 600, color: C.navy, fontSize: 15, lineHeight: 1.55, paddingRight: 16 }}>
                  {item.q}
                </span>
                <span style={{ color: open === i ? C.blue : C.muted, fontSize: 18, fontWeight: 600, lineHeight: 1, flexShrink: 0 }}>
                  {open === i ? "−" : "+"}
                </span>
              </button>

              {open === i && (
                <div style={{ padding: "0 16px 14px", color: C.navySoft, lineHeight: 1.65, fontSize: 15 }}>
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