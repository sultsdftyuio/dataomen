import { ArrowRight, FileSearch } from "lucide-react";

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
        className="grid-2 lead-review-layout"
        style={{ alignItems: "center", gap: 48, margin: "0 auto", maxWidth: 1200 }}
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

        <figure
          aria-label="Lead review walkthrough"
          style={{
            background: "#FFFFFF",
            border: surfaceBorder,
            borderRadius: 14,
            boxShadow: surfaceShadow,
            margin: 0,
            overflow: "hidden",
          }}
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            style={{ display: "block", height: "auto", width: "100%" }}
          >
            <source src="/video/landing/lead-review-demo.mp4" type="video/mp4" />
            Your browser does not support embedded video.
          </video>
        </figure>
      </div>
    </section>
  );
}
