"use client";

import { useState } from "react";
import { C } from "@/lib/tokens";
import { Reveal, RevealWords } from "@/components/landing/reveal";

const items = [
  {
    q: "What do I need to get started?",
    a: "Start with your website. Arcli drafts a picture of your offer and audience for you to review. You approve the target accounts, buyer roles, and exclusions before a founding pilot begins.",
  },
  {
    q: "What is the founding prospect pilot?",
    a: "It is a separately scoped, service-assisted prospect feed for selected markets. We check source coverage and agree on the targeting, delivery scope, and price before starting. Pilot access is separate from the $35 Pro plan.",
  },
  {
    q: "Does every prospect have a recent buying signal?",
    a: "No. We label direct buyer intent, timely opportunities, and high-fit prospects separately. A high-fit account can be useful without a fresh event, and its card states when no recent buying signal was observed.",
  },
  {
    q: "What makes a pilot prospect worth reviewing?",
    a: "The account must match the approved brief, have reviewable source evidence, a specific reason to approach it, and a plausible action route. Raw company-list entries do not count as delivered prospects.",
  },
  {
    q: "Does Arcli automate cold outreach?",
    a: "No. Arcli helps you find and understand useful opportunities. It does not send mass messages, read your inbox, or make outreach decisions for you.",
  },
  {
    q: "How is $35 Pro different from the pilot?",
    a: "Pro is the existing self-serve public-conversation scanner. It opens source-linked matches when supported discussions fit your brief; results vary by market. The reviewed account pilot has a separate application and commercial scope.",
  },
  {
    q: "Is there a weekly prospect guarantee?",
    a: "There is no general weekly-volume promise today. We assess your market and agree on realistic scope before a pilot starts, and report shortfalls rather than filling a target with weak accounts.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section style={{ padding: "84px 24px", background: "#FAFAFA", borderTop: surfaceBorder, fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 className="pfd" style={{ fontSize: "clamp(32px, 4vw, 42px)", textAlign: "center", marginBottom: 34, color: C.navy, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
          <RevealWords text="Questions before you start" />
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item, i) => (
            <Reveal key={item.q} delay={i * 70}>
              <div
                style={{
                  border: open === i ? "1px solid rgba(37,99,235,0.45)" : surfaceBorder,
                  borderRadius: 8,
                  overflow: "hidden",
                  transition: "all 0.2s", background: "#fff",
                  boxShadow: surfaceShadow,
                }}
              >
              <button
                aria-controls={`faq-answer-${i}`}
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: "100%", padding: "12px 14px",
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
                <div id={`faq-answer-${i}`} style={{ padding: "0 14px 12px", color: C.navySoft, lineHeight: 1.65, fontSize: 15 }}>
                  {item.a}
                </div>
              )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
