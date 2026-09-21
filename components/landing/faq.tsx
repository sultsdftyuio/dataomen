"use client";

import { useState } from "react";
import { C } from "@/lib/tokens";
import { Reveal, RevealWords } from "@/components/landing/reveal";

const items = [
  {
    q: "What do I need to get started?",
    a: "Start with your website. Arcli uses your public pages to build a focused picture of your offer, audience, buyer problems, and language to look for.",
  },
  {
    q: "Where do I review results?",
    a: "Review every match in your Prospect Inbox. Workspace owners and admins can also choose to receive website refresh emails; Pro summaries include aggregate review-ready lead results.",
  },
  {
    q: "Which public sources does Arcli cover?",
    a: "Core coverage begins with Hacker News and Bluesky. Arcli may add technical or community sources, including Lemmy, Stack Exchange, and GitHub, when they fit your product and audience.",
  },
  {
    q: "How does Arcli keep weak matches out of the queue?",
    a: "Arcli evaluates the surrounding conversation, not just a matching word. You see the original source and match reasoning before you act, and your feedback helps improve what rises to the top.",
  },
  {
    q: "Does Arcli automate cold outreach?",
    a: "No. Arcli helps you find and understand useful opportunities. It does not send mass messages, read your inbox, or make outreach decisions for you.",
  },
  {
    q: "How does pricing scale? Do we pay per team member?",
    a: "No per-seat licenses. Solo founders and small SaaS teams can invite collaborators to review prospects together without arbitrary user fees.",
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
