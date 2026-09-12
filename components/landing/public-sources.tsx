"use client";

import { Blocks, CircleHelp, Github, MessagesSquare, Radio } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Reveal, RevealWords } from "@/components/landing/reveal";
import { C } from "@/lib/tokens";

const surfaceBorder = "1px solid rgba(10, 22, 40, 0.10)";

const coreSources: Array<{ name: string; icon: LucideIcon }> = [
  { name: "Hacker News", icon: MessagesSquare },
  { name: "Bluesky", icon: Radio },
];

const contextualSources: Array<{ name: string; icon: LucideIcon }> = [
  { name: "Lemmy", icon: Blocks },
  { name: "Stack Exchange", icon: CircleHelp },
  { name: "GitHub", icon: Github },
];

export function PublicSources() {
  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      style={{
        background: "#FFFFFF",
        borderTop: surfaceBorder,
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "72px 24px",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: 960 }}>
        <Reveal style={{ margin: "0 auto 32px", maxWidth: 620, textAlign: "center" }}>
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
            <Radio size={14} /> Public coverage
          </div>
          <h2
            className="pfd"
            id="sources-heading"
            style={{
              color: C.navy,
              fontSize: "clamp(30px, 3.5vw, 38px)",
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.08,
              margin: "0 0 14px",
            }}
          >
            <RevealWords text="Coverage that follows the product context." />
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62, margin: 0 }}>
            Arcli begins with public buyer conversations, then adds technical or community
            sources only when they fit your product and audience.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div
            style={{
              background: "#F8FAFC",
              border: surfaceBorder,
              borderRadius: 12,
              display: "grid",
              gap: 14,
              padding: 16,
            }}
          >
            <SourceGroup label="Core conversations" sources={coreSources} />
            <div style={{ borderTop: surfaceBorder }} />
            <SourceGroup label="Contextual coverage" sources={contextualSources} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SourceGroup({
  label,
  sources,
}: {
  label: string;
  sources: Array<{ name: string; icon: LucideIcon }>;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p style={{ color: C.muted, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", margin: 0, textTransform: "uppercase" }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map(({ name, icon: Icon }) => (
          <span
            key={name}
            style={{
              alignItems: "center",
              background: "#FFFFFF",
              border: surfaceBorder,
              borderRadius: 999,
              color: C.navy,
              display: "inline-flex",
              fontSize: 13,
              fontWeight: 600,
              gap: 7,
              padding: "7px 10px",
            }}
          >
            <Icon aria-hidden="true" color={C.blue} size={14} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
