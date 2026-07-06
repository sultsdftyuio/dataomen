"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  Send,
  KeyRound,
} from "lucide-react";
import React from "react";

import { C } from "@/lib/tokens";

import type { SetupState } from "@/app/(dashboard)/dashboard/QuickStartGuide";

interface QuickStartGuideStepsProps {
  hasApiKey: boolean;
  hasReceivedData: boolean;
  setupState: SetupState;
  onOpenApiModal: () => void;
}

const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

function StepCard({
  stepNum,
  title,
  description,
  status,
  action,
}: {
  stepNum: number;
  title: string;
  description: string;
  status: "complete" | "active" | "locked";
  action?: React.ReactNode;
}) {
  const isDone = status === "complete";
  const isLocked = status === "locked";

  // COMPACT: Completed steps shrink to a horizontal row
  if (isDone) {
    return (
      <li
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 10,
          background: "rgba(16,185,129,0.04)",
          border: "1px solid rgba(16,185,129,0.12)",
        }}
      >
        <CheckCircle2 size={18} color="#10B981" />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#059669",
            textDecoration: "line-through",
            textDecorationColor: "rgba(5,150,105,0.3)",
            textDecorationThickness: 1,
          }}
        >
          {title}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 600,
            color: "#10B981",
            background: "rgba(16,185,129,0.08)",
            padding: "2px 8px",
            borderRadius: 4,
            letterSpacing: "0.02em",
          }}
        >
          Done
        </span>
      </li>
    );
  }

  // LOCKED: Muted compact row
  if (isLocked) {
    return (
      <li
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 10,
          background: "#FAFAFA",
          border: "1px solid rgba(0,0,0,0.06)",
          opacity: 0.55,
        }}
      >
        <Lock size={15} color="#9CA3AF" />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#9CA3AF" }}>
          {title}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#9CA3AF",
            fontWeight: 500,
          }}
        >
          Locked
        </span>
      </li>
    );
  }

  // ACTIVE: Full card with offset accent
  return (
    <li
      style={{
        position: "relative",
        padding: 24,
        borderRadius: 8,
        background: "#fff",
        border: surfaceBorder,
        boxShadow: surfaceShadow,
        zIndex: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: C.navy,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {stepNum}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: C.navy,
              marginBottom: 3,
              lineHeight: 1.3,
            }}
          >
            {title}
          </h3>
          <p
            style={{
              fontSize: 13,
              color: C.navySoft,
              lineHeight: 1.5,
              marginBottom: action ? 14 : 0,
            }}
          >
            {description}
          </p>
          {action}
        </div>
      </div>

      {/* Offset Background Accent */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          right: -10,
          bottom: -10,
          background:
            stepNum === 1
              ? "rgba(59,154,232,0.12)" // Blue for API Key (Now Step 1)
              : "rgba(16,185,129,0.12)", // Green for Event Validation (Now Step 2)
          borderRadius: 8,
          zIndex: -1,
          border: surfaceBorder,
        }}
      />
    </li>
  );
}

export function QuickStartGuideSteps({
  hasApiKey,
  hasReceivedData,
  setupState,
  onOpenApiModal,
}: QuickStartGuideStepsProps) {
  return (
    <ol
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        listStyle: "none",
        padding: 0,
        margin: 0,
      }}
    >
      {/* ─── STEP 1: API KEY ──────────────────────────────────────────── */}
      <StepCard
        stepNum={1}
        title="Track Product Usage"
        description="Generate an API key to track user inactivity and engagement signals."
        status={hasApiKey ? "complete" : "active"}
        action={
          !hasApiKey ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenApiModal();
              }}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: surfaceBorder,
                boxShadow: surfaceShadow,
                background: C.navy,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              <KeyRound size={14} />
              Create API Key
              <ArrowRight size={14} />
            </button>
          ) : undefined
        }
      />

      {/* ─── STEP 2: EVENT VALIDATION ─────────────────────────────────── */}
      <StepCard
        stepNum={2}
        title="Validate incoming events"
        description={
          hasReceivedData
            ? "Integration verified. Arcli is listening."
            : hasApiKey
              ? "Send your first product event to verify the integration."
              : "Complete the previous step to unlock your dashboard."
        }
        status={
          hasReceivedData ? "complete" : hasApiKey ? "active" : "locked"
        }
        action={
          hasApiKey && !hasReceivedData ? (
            <Link
              href="/docs/test-events"
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: surfaceBorder,
                boxShadow: surfaceShadow,
                background: "#F3F4F6",
                color: C.navy,
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                letterSpacing: "0.02em",
              }}
            >
              <Send size={14} />
              Send test event
            </Link>
          ) : hasReceivedData ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                color: "#059669",
                fontWeight: 700,
              }}
            >
              <CheckCircle2 size={14} />
              Event received
            </div>
          ) : undefined
        }
      />
    </ol>
  );
}
