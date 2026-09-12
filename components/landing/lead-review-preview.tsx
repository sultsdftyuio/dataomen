import { ArrowRight, CheckCircle2, FileSearch, MessageSquareText } from "lucide-react";

import { C } from "@/lib/tokens";

const surfaceBorder = "1px solid rgba(15, 23, 42, 0.10)";
const surfaceShadow = "0 16px 38px rgba(15, 23, 42, 0.08)";

export function LeadReviewPreview() {
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
      <div
        className="grid-2"
        style={{
          alignItems: "center",
          gap: 36,
          margin: "0 auto",
          maxWidth: 1040,
        }}
      >
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

        <div
          aria-label="Example of a lead review with source evidence, buyer signal, and suggested reply"
          style={{
            background: "#FFFFFF",
            border: surfaceBorder,
            borderRadius: 14,
            boxShadow: surfaceShadow,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              alignItems: "center",
              borderBottom: surfaceBorder,
              display: "flex",
              justifyContent: "space-between",
            padding: "13px 16px",
            }}
          >
            <span style={{ color: C.navy, fontSize: 13, fontWeight: 700 }}>Lead review</span>
            <span
              style={{
                background: "rgba(16, 185, 129, 0.10)",
                border: "1px solid rgba(16, 185, 129, 0.22)",
                borderRadius: 999,
                color: "#047857",
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 9px",
              }}
            >
              Ready to review
            </span>
          </div>

          <div style={{ display: "grid", gap: 12, padding: 16 }}>
            <div style={{ background: "#F8FAFC", border: surfaceBorder, borderRadius: 10, padding: 13 }}>
              <div style={{ alignItems: "center", color: C.navySoft, display: "flex", fontSize: 12, fontWeight: 700, gap: 7, marginBottom: 8 }}>
                <MessageSquareText color={C.blue} size={15} /> PUBLIC CONVERSATION · EXAMPLE
              </div>
              <p style={{ color: C.navy, fontSize: 14, lineHeight: 1.55, margin: 0 }}>
                “We are still reviewing customer requests by hand. What is a better way to
                prioritize the work without losing important context?”
              </p>
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <Signal label="Buyer signal" value="Manual workflow frustration" />
              <Signal label="Why it fits" value="Matches your product’s core problem" />
            </div>

            <div style={{ borderTop: surfaceBorder, paddingTop: 12 }}>
              <div style={{ alignItems: "center", color: C.navySoft, display: "flex", fontSize: 12, fontWeight: 700, gap: 7, marginBottom: 8 }}>
                <CheckCircle2 color="#059669" size={15} /> SUGGESTED FIRST REPLY
              </div>
              <p style={{ color: C.navy, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                It sounds like preserving context is the hard part. What have you tried for
                deciding which requests should be handled first?
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#F8FAFC", border: surfaceBorder, borderRadius: 10, padding: 10 }}>
      <div style={{ color: C.navySoft, fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color: C.navy, fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{value}</div>
    </div>
  );
}
