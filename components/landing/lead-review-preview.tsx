"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, FileSearch, MessageSquareText, Send, Target } from "lucide-react";

import { C } from "@/lib/tokens";

const surfaceBorder = "1px solid rgba(15, 23, 42, 0.10)";
const surfaceShadow = "0 16px 38px rgba(15, 23, 42, 0.08)";

const views = [
  { id: "source", label: "Source", icon: MessageSquareText },
  { id: "fit", label: "Why it fits", icon: Target },
  { id: "reply", label: "Reply", icon: Send },
] as const;

type ReviewView = (typeof views)[number]["id"];

export function LeadReviewPreview() {
  const [activeView, setActiveView] = useState<ReviewView>("source");

  return (
    <section
      aria-labelledby="lead-review-heading"
      style={{
        background: "#F4F8FF",
        borderTop: surfaceBorder,
        borderBottom: surfaceBorder,
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "68px 24px",
      }}
    >
      <div className="grid-2" style={{ alignItems: "center", gap: 36, margin: "0 auto", maxWidth: 1040 }}>
        <div>
          <div
            style={{
              alignItems: "center",
              color: C.blue,
              display: "inline-flex",
              fontSize: 12,
              fontWeight: 700,
              gap: 8,
              letterSpacing: "0.08em",
              marginBottom: 14,
              textTransform: "uppercase",
            }}
          >
            <FileSearch size={15} /> Reviewable, not a black box
          </div>
          <h2
            className="pfd"
            id="lead-review-heading"
            style={{
              color: C.navy,
              fontSize: "clamp(30px, 3.5vw, 38px)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              margin: "0 0 18px",
            }}
          >
            See the reason before you reach out.
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62, margin: 0 }}>
            Each lead keeps the original conversation, the buyer signal Arcli found, and a
            suggested first reply. You decide whether it deserves action.
          </p>
          <a
            href="#pipeline"
            style={{
              alignItems: "center",
              color: C.navy,
              display: "inline-flex",
              fontSize: 14,
              fontWeight: 700,
              gap: 8,
              marginTop: 22,
              textDecoration: "underline",
              textDecorationColor: "rgba(37, 99, 235, 0.45)",
              textUnderlineOffset: 5,
            }}
          >
            See the review flow <ArrowRight size={16} />
          </a>
        </div>

        <div style={{ background: "#FFFFFF", border: surfaceBorder, borderRadius: 14, boxShadow: surfaceShadow, overflow: "hidden" }}>
          <div style={{ alignItems: "center", borderBottom: surfaceBorder, display: "flex", justifyContent: "space-between", padding: "13px 16px" }}>
            <span style={{ color: C.navy, fontSize: 13, fontWeight: 700 }}>Lead review</span>
            <span
              style={{
                background: "rgba(16, 185, 129, 0.10)",
                border: "1px solid rgba(16, 185, 129, 0.22)",
                borderRadius: 999,
                color: C.green,
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 9px",
              }}
            >
              Ready to review
            </span>
          </div>

          <div aria-label="Lead review sections" role="tablist" style={{ borderBottom: surfaceBorder, display: "flex", gap: 4, padding: "8px 10px" }}>
            {views.map(({ id, label, icon: Icon }) => {
              const active = activeView === id;
              return (
                <button
                  aria-controls={`review-${id}`}
                  aria-selected={active}
                  key={id}
                  onClick={() => setActiveView(id)}
                  role="tab"
                  style={{
                    alignItems: "center",
                    background: active ? C.bluePale : "transparent",
                    border: active ? "1px solid rgba(27, 110, 191, 0.18)" : "1px solid transparent",
                    borderRadius: 7,
                    color: active ? C.blue : C.navySoft,
                    cursor: "pointer",
                    display: "inline-flex",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 700,
                    gap: 5,
                    padding: "7px 8px",
                  }}
                  type="button"
                >
                  <Icon aria-hidden="true" size={13} />
                  {label}
                </button>
              );
            })}
          </div>

          <div id={`review-${activeView}`} role="tabpanel" style={{ minHeight: 178, padding: 16 }}>
            {activeView === "source" ? <SourceView /> : null}
            {activeView === "fit" ? <FitView /> : null}
            {activeView === "reply" ? <ReplyView /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceView() {
  return (
    <div style={{ background: "#F8FAFC", border: surfaceBorder, borderRadius: 10, padding: 14 }}>
      <p style={{ alignItems: "center", color: C.navySoft, display: "flex", fontSize: 12, fontWeight: 700, gap: 7, margin: "0 0 9px" }}>
        <MessageSquareText color={C.blue} size={15} /> PUBLIC CONVERSATION · EXAMPLE
      </p>
      <p style={{ color: C.navy, fontSize: 14, lineHeight: 1.58, margin: 0 }}>
        "We are still reviewing customer requests by hand. What is a better way to prioritize
        the work without losing important context?"
      </p>
    </div>
  );
}

function FitView() {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <ReviewSignal label="Buyer signal" value="Manual workflow frustration" />
      <ReviewSignal label="Why it fits" value="Matches the product's core problem" />
    </div>
  );
}

function ReplyView() {
  return (
    <div style={{ background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.18)", borderRadius: 10, padding: 14 }}>
      <p style={{ alignItems: "center", color: C.green, display: "flex", fontSize: 12, fontWeight: 700, gap: 7, margin: "0 0 9px" }}>
        <CheckCircle2 size={15} /> SUGGESTED FIRST REPLY
      </p>
      <p style={{ color: C.navy, fontSize: 14, lineHeight: 1.58, margin: 0 }}>
        It sounds like preserving context is the hard part. What have you tried for deciding
        which requests should be handled first?
      </p>
    </div>
  );
}

function ReviewSignal({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#F8FAFC", border: surfaceBorder, borderRadius: 10, padding: 12 }}>
      <p style={{ color: C.navySoft, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", margin: "0 0 5px", textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ color: C.navy, fontSize: 14, fontWeight: 700, lineHeight: 1.35, margin: 0 }}>{value}</p>
    </div>
  );
}
