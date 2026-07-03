"use client";

import React from "react";
import { Sparkles, CornerDownLeft, ShieldCheck } from "lucide-react";
import { C } from "@/lib/tokens";

interface WorkspaceSettingsPreviewProps {
  companyName: string;
  websiteUrl: string;
  supportEmail: string;
}

export default function WorkspaceSettingsPreview({
  companyName,
  websiteUrl,
  supportEmail,
}: WorkspaceSettingsPreviewProps) {
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 24 }}>
      {/* Box 1: Dynamic Injection Panel */}
      <div
        style={{
          background: C.bluePale,
          borderRadius: 8,
          border: `1px solid rgba(27, 110, 191, 0.25)`,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.blue }}>
          <Sparkles size={14} />
          <span>Dynamic Injection Preview</span>
        </div>

        <p style={{ fontSize: 11, color: C.navySoft, margin: 0, lineHeight: 1.5 }}>
          These global variables are injected dynamically into your outbound recovery emails.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: C.white,
              border: surfaceBorder,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              overflow: "hidden",
            }}
          >
            <span style={{ fontSize: 11, fontFamily: "monospace", color: C.blue, fontWeight: 600, userSelect: "none" }}>
              {"{{ company.name }}"}
            </span>
            <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
              {companyName || <span style={{ color: C.muted, fontStyle: "italic", fontFamily: sans }}>Not set</span>}
            </span>
          </div>

          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: C.white,
              border: surfaceBorder,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              overflow: "hidden",
            }}
          >
            <span style={{ fontSize: 11, fontFamily: "monospace", color: C.blue, fontWeight: 600, userSelect: "none" }}>
              {"{{ company.url }}"}
            </span>
            <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
              {websiteUrl || <span style={{ color: C.muted, fontStyle: "italic", fontFamily: sans }}>Not set</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Box 2: Reply-To Routing Panel */}
      <div
        style={{
          background: C.white,
          borderRadius: 8,
          border: surfaceBorder,
          boxShadow: surfaceShadow,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.navy }}>
          <CornerDownLeft size={14} color={C.blue} />
          <span>Reply-To Routing</span>
        </div>

        <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
          When recovered users reply directly to your automated campaign emails, responses route to the Support Email configured above.
        </p>

        <div
          style={{
            marginTop: 4,
            padding: "8px 10px",
            borderRadius: 6,
            background: C.offWhite,
            border: surfaceBorder,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ShieldCheck size={14} color={C.green} />
          <span style={{ fontSize: 11, fontFamily: "monospace", color: C.navy, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {supportEmail || <span style={{ color: C.muted, fontStyle: "italic", fontFamily: sans, fontWeight: 400 }}>No support email set</span>}
          </span>
        </div>
      </div>
    </div>
  );
}