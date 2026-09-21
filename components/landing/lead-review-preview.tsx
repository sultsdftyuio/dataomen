import { FileSearch } from "lucide-react";

import { C } from "@/lib/tokens";

const surfaceBorder = "1px solid rgba(15, 23, 42, 0.10)";
const surfaceShadow = "0 20px 54px rgba(15, 23, 42, 0.14)";

const walkthroughSteps = [
  "The original buyer conversation.",
  "Why this is a real fit.",
  "A thoughtful way to respond.",
];

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
            <FileSearch size={15} /> <span className="pulse-indicator" aria-hidden="true" /> A review-ready lead
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
            See the evidence before you decide to reach out.
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62, margin: 0 }}>
            Follow one public conversation from the original source to a clear match explanation
            and thoughtful first reply—so you can decide what deserves action.
          </p>
        </div>

        <figure
          aria-describedby="lead-review-caption"
          aria-label="Arcli lead review walkthrough"
          style={{
            background: "#FFFFFF",
            border: surfaceBorder,
            borderRadius: 18,
            boxShadow: surfaceShadow,
            margin: "36px auto 0",
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
              alignItems: "center",
              color: C.navySoft,
              display: "flex",
              flexWrap: "wrap",
              fontSize: 14,
              gap: "10px 22px",
              justifyContent: "center",
              padding: "18px 24px",
            }}
          >
            {walkthroughSteps.map((step, index) => (
              <span key={step} style={{ alignItems: "center", display: "inline-flex", gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{
                    alignItems: "center",
                    background: C.bluePale,
                    borderRadius: "50%",
                    color: C.blue,
                    display: "inline-flex",
                    fontSize: 11,
                    fontWeight: 800,
                    height: 22,
                    justifyContent: "center",
                    width: 22,
                  }}
                >
                  {index + 1}
                </span>
                {step}
              </span>
            ))}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
