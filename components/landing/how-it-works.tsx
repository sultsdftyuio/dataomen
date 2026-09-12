"use client";

import { ArrowDown, ArrowRight, BadgeCheck, Globe2, SearchCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal, RevealWords } from "@/components/landing/reveal";
import { C } from "@/lib/tokens";

const steps: Array<{
  icon: LucideIcon;
  label: string;
  title: string;
  copy: string;
  signal: string;
  detail: string;
}> = [
  {
    icon: Globe2,
    label: "01 · Understand",
    title: "Start with your website.",
    copy: "Arcli builds a focused picture of what you sell, who it is for, and the problems it solves.",
    signal: "Product context ready",
    detail: "Audience · problems · buyer language",
  },
  {
    icon: SearchCheck,
    label: "02 · Find",
    title: "Check relevant conversations.",
    copy: "It looks for public discussions where people describe a problem your product could genuinely help solve.",
    signal: "Buyer signal found",
    detail: "Conversation · context · intent",
  },
  {
    icon: BadgeCheck,
    label: "03 · Review",
    title: "Decide with evidence.",
    copy: "You receive the original post, the reason it matches, and a suggested way to start a useful conversation.",
    signal: "Ready to review",
    detail: "Source · why it fits · reply",
  },
];

export function HowItWorks() {
  const surfaceBorder = "1px solid rgba(10, 22, 40, 0.10)";

  return (
    <section
      id="pipeline"
      aria-labelledby="pipeline-heading"
      style={{
        background: "#FFFFFF",
        borderTop: surfaceBorder,
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "84px 24px",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: 1120 }}>
        <Reveal style={{ margin: "0 auto 44px", maxWidth: 640, textAlign: "center" }}>
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
            <SearchCheck size={14} /> The workflow
          </div>
          <h2
            className="pfd"
            id="pipeline-heading"
            style={{
              color: C.navy,
              fontSize: "clamp(32px, 4vw, 40px)",
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.08,
              margin: "0 0 16px",
            }}
          >
            <RevealWords text="From your website to a reviewable lead." />
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62, margin: 0 }}>
            A concise process that keeps product context and source evidence together from the
            first search to your final decision.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-4">
          {steps.map((step, index) => (
            <Fragment key={step.label}>
              <Reveal delay={index * 100}>
                <WorkflowStep {...step} number={index + 1} />
              </Reveal>
              {index < steps.length - 1 ? <FlowArrow /> : null}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowStep({
  icon: Icon,
  label,
  title,
  copy,
  signal,
  detail,
  number,
}: (typeof steps)[number] & { number: number }) {
  const isReady = number === 3;

  return (
    <article
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(10, 22, 40, 0.10)",
        borderRadius: 10,
        boxShadow: "0 4px 14px rgba(10, 22, 40, 0.04)",
        height: "100%",
        padding: 20,
      }}
    >
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
        <span
          style={{
            alignItems: "center",
            background: C.bluePale,
            borderRadius: 8,
            color: C.blue,
            display: "flex",
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Icon aria-hidden="true" size={17} />
        </span>
        <span style={{ color: C.faint, fontSize: 12, fontWeight: 700 }}>0{number}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", margin: "0 0 8px", textTransform: "uppercase" }}>
        {label}
      </p>
      <h3 className="pfd" style={{ color: C.navy, fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.15, margin: "0 0 10px" }}>
        {title}
      </h3>
      <p style={{ color: C.navySoft, fontSize: 15, lineHeight: 1.58, margin: "0 0 18px" }}>{copy}</p>
      <div
        style={{
          background: isReady ? "rgba(16, 185, 129, 0.08)" : "#F8FAFC",
          border: isReady ? "1px solid rgba(16, 185, 129, 0.20)" : "1px solid rgba(10, 22, 40, 0.08)",
          borderRadius: 8,
          padding: 10,
        }}
      >
        <p style={{ color: isReady ? C.green : C.navy, fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>{signal}</p>
        <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.45, margin: 0 }}>{detail}</p>
      </div>
    </article>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center py-1 md:py-0" style={{ color: C.blue }}>
      <ArrowRight className="hidden md:block" aria-hidden="true" size={19} />
      <ArrowDown className="md:hidden" aria-hidden="true" size={19} />
    </div>
  );
}

function Fragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
