"use client";

import { ArrowDown, ArrowRight, CheckCircle2, FileCheck2, Radar, SlidersHorizontal } from "lucide-react";
import { Fragment } from "react";

import { Reveal, RevealWords } from "@/components/landing/reveal";
import { C } from "@/lib/tokens";

const trustSteps = [
  {
    icon: Radar,
    label: "01 / Direct buyer intent",
    title: "A linked request or problem.",
    copy: "A public source shows someone asking for help or describing a need related to your offer.",
  },
  {
    icon: FileCheck2,
    label: "02 / Timely opportunity",
    title: "A dated reason to approach.",
    copy: "A relevant company event can create an outreach angle without proving purchase intent.",
  },
  {
    icon: SlidersHorizontal,
    label: "03 / High-fit prospect",
    title: "Strong fit without a fresh event.",
    copy: "Current company facts match your targeting brief. The card says when no recent buying signal was observed.",
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
            <span className="section-heading-icon" aria-hidden="true"><CheckCircle2 size={14} /></span>
            Qualification standards
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
            <RevealWords text="Clear labels for the evidence we actually have." />
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62, margin: 0 }}>
            A useful recommendation needs a reason to act. Arcli separates direct buyer intent,
            timely opportunities, and high-fit accounts so you can judge each one fairly.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-4">
          {trustSteps.map(({ icon: Icon, label, title, copy }, index) => (
            <Fragment key={title}>
              <Reveal delay={index * 100}>
                <article style={{ height: "100%", padding: "4px 10px" }}>
                  <div
                    style={{
                      alignItems: "center",
                      background: C.bluePale,
                      borderRadius: 8,
                      color: C.blue,
                      display: "flex",
                      height: 34,
                      justifyContent: "center",
                      marginBottom: 16,
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
              {index < trustSteps.length - 1 ? <TrustArrow /> : null}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustArrow() {
  return (
    <div className="flex items-center justify-center py-1 md:py-0" style={{ color: C.blue }}>
      <ArrowRight className="hidden md:block" aria-hidden="true" size={19} />
      <ArrowDown className="md:hidden" aria-hidden="true" size={19} />
    </div>
  );
}
