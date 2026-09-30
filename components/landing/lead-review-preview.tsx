import { FileSearch } from "lucide-react";

import { C } from "@/lib/tokens";
import { SourceExample } from "./source-example";

const surfaceBorder = "1px solid rgba(15, 23, 42, 0.10)";

export function LeadReviewPreview() {
  return (
    <section
      id="proof"
      aria-labelledby="lead-review-heading"
      style={{
        background: "#F4F8FF",
        borderTop: surfaceBorder,
        borderBottom: surfaceBorder,
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "84px 24px",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: 1200 }}>
        <div style={{ margin: "0 auto", maxWidth: 760, textAlign: "center" }}>
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
            <span className="section-heading-icon" aria-hidden="true"><FileSearch size={15} /></span>
            Evidence you can inspect
          </div>
          <h2
            className="pfd"
            id="lead-review-heading"
            style={{
              color: C.navy,
              fontSize: "clamp(32px, 4vw, 42px)",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              lineHeight: 1.08,
              margin: "0 0 18px",
            }}
          >
            Decide what a public signal actually means.
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62, margin: 0 }}>
            A relevant post is a starting point, not proof that its author is a buyer. Review the
            original words, the fit, and what remains unknown before deciding what to do.
          </p>
        </div>

        <SourceExample />

        <figure
          aria-describedby="lead-review-caption"
          aria-label="Arcli interface walkthrough"
          style={{
            background: "#FFFFFF",
            border: surfaceBorder,
            borderRadius: 18,
            boxShadow: "0 20px 54px rgba(15, 23, 42, 0.14)",
            margin: "24px auto 0",
            maxWidth: 860,
            overflow: "hidden",
          }}
        >
          <video
            autoPlay
            controls
            loop
            muted
            playsInline
            preload="metadata"
            style={{ aspectRatio: "8 / 5", background: C.navy, display: "block", height: "auto", width: "100%" }}
          >
            <source src="/video/landing/lead-review-demo.mp4" type="video/mp4" />
            Your browser does not support embedded video.
          </video>
          <figcaption
            id="lead-review-caption"
            style={{
              color: C.navySoft,
              fontSize: 14,
              lineHeight: 1.6,
              padding: "18px 24px",
              textAlign: "center",
            }}
          >
            Interface walkthrough: source conversation, fit reasoning, and a suggested next step.
            The example above is a manually selected historical discussion, not a live customer result.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
