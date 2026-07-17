"use client";

import { useState } from "react";
import { C } from "@/lib/tokens";

const items = [
  {
    q: "Is Arcli a social listening or keyword-alert tool?",
    a: "No. Arcli is a prospect intelligence layer. It uses your website-derived Service Profile, semantic matching, and LLM verification to surface discussions that show real problem fit.",
  },
  {
    q: "Does Arcli send messages or automate cold outreach?",
    a: "No. Arcli helps you discover and understand useful opportunities. It does not blast DMs, scrape inboxes, or run mass outreach campaigns.",
  },
  {
    q: "How does Arcli understand our product?",
    a: "You enter your website URL. Arcli crawls your public pages and extracts a structured Service Profile with your target audience, core problem, use cases, and negative keywords.",
  },
  {
    q: "How do you reduce false positives?",
    a: "Arcli first compares each discussion to your Service Profile using semantic similarity. Then an explainable LLM verifier checks whether the post shows actual buying intent, operational pain, or a mismatch.",
  },
  {
    q: "How does pricing scale? Do we pay per team member?",
    a: "We do not charge per-seat licenses. Solo founders and small SaaS teams can invite collaborators without paying arbitrary user fees just to review prospect intelligence together.",
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
