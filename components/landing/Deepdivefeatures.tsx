"use client";

import { CheckCircle2, FileCheck2, Radar, SlidersHorizontal } from "lucide-react";

import { Reveal, RevealWords } from "@/components/landing/reveal";
import { C } from "@/lib/tokens";

const trustSteps = [
  {
    icon: Radar,
    label: "01 · Product context",
    title: "Learns what matters to your buyer.",
    copy: "Your website gives Arcli the product, audience, problem, and language to look for.",
  },
  {
    icon: FileCheck2,
    label: "02 · Evidence check",
    title: "Shows the context behind a match.",
    copy: "A lead includes the public conversation, the buyer signal, and why it may be worth a reply.",
  },
  {
    icon: SlidersHorizontal,
    label: "03 · Helpful feedback",
    title: "Prioritizes what has been useful.",
    copy: "Your feedback helps similar signals surface sooner without shutting off broad discovery.",
  },
];

export function DeepDiveFeatures() {
  const surfaceBorder = "1px solid rgba(10, 22, 40, 0.10)";

  return (
    <section
      id="quality"
      aria-labelledby="quality-heading"
      style={{
        background: "#FAFAFA",
        borderTop: surfaceBorder,
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "84px 24px",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: 1120 }}>
        <Reveal style={{ margin: "0 auto 42px", maxWidth: 650, textAlign: "center" }}>
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
            <CheckCircle2 size={14} /> Why the queue stays useful
          </div>
          <h2
            className="pfd"
            id="quality-heading"
            style={{
              color: C.navy,
              fontSize: "clamp(32px, 4vw, 40px)",
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.08,
              margin: "0 0 16px",
            }}
          >
            <RevealWords text="A lead is more than a matching word." />
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62, margin: 0 }}>
            Arcli connects your product context to the full conversation, then lets your
            feedback influence priority without making discovery narrow.
          </p>
        </Reveal>

        <div className="grid gap-4 md:grid-cols-3">
          {trustSteps.map(({ icon: Icon, label, title, copy }, index) => (
            <Reveal key={title} delay={index * 100}>
              <article
                style={{
                  background: "#FFFFFF",
                  border: surfaceBorder,
                  borderRadius: 10,
                  boxShadow: "0 4px 14px rgba(10, 22, 40, 0.04)",
                  height: "100%",
                  padding: 20,
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    background: C.bluePale,
                    borderRadius: 8,
                    color: C.blue,
                    display: "flex",
                    height: 34,
                    justifyContent: "center",
                    marginBottom: 18,
                    width: 34,
                  }}
                >
                  <Icon size={17} aria-hidden="true" />
                </div>
                <p
                  style={{
                    color: C.muted,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    margin: "0 0 8px",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </p>
                <h3
                  className="pfd"
                  style={{
                    color: C.navy,
                    fontSize: 21,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.15,
                    margin: "0 0 10px",
                  }}
                >
                  {title}
                </h3>
                <p style={{ color: C.navySoft, fontSize: 15, lineHeight: 1.58, margin: 0 }}>
                  {copy}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
