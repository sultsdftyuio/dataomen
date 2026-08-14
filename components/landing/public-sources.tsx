"use client";

import {
  Blocks,
  CircleHelp,
  Github,
  MessagesSquare,
  Radio,
} from "lucide-react";

import { C } from "@/lib/tokens";

const sources = [
  {
    name: "Hacker News",
    detail: "Founder and builder discussions",
    icon: MessagesSquare,
  },
  {
    name: "Bluesky",
    detail: "Public asks and conversations",
    icon: Radio,
  },
  {
    name: "Lemmy",
    detail: "Independent public communities",
    icon: Blocks,
  },
  {
    name: "Stack Exchange",
    detail: "Specific how-to problems",
    icon: CircleHelp,
  },
  {
    name: "GitHub",
    detail: "Issues and discussions",
    icon: Github,
  },
];

export function PublicSources() {
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";

  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      style={{
        padding: "112px 24px",
        background: "#FFFFFF",
        borderTop: surfaceBorder,
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                color: C.blue,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              <Radio size={14} /> PUBLIC SOURCES
            </div>
            <h2
              id="sources-heading"
              className="pfd"
              style={{
                fontSize: 42,
                color: C.navy,
                lineHeight: 1.08,
                letterSpacing: "-0.015em",
                fontWeight: 600,
                marginBottom: 18,
              }}
            >
              We check the conversations where people ask for help.
            </h2>
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, maxWidth: 520 }}>
              Arcli looks across public communities for people describing the
              problems your product solves. You choose the coverage for each
              buyer group.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sources.map(({ name, detail, icon: Icon }) => (
              <article
                key={name}
                className="flex items-start gap-3 rounded-lg border bg-white p-4 transition-colors hover:bg-[#F7FBFF]"
                style={{ borderColor: C.rule, boxShadow: "0 1px 3px rgba(10,22,40,0.04)" }}
              >
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: C.bluePale, color: C.blue }}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: C.navy }}>
                    {name}
                  </h3>
                  <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                    {detail}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
