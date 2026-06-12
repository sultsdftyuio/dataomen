// app/(dashboard)/dashboard/QuickStartGuide.tsx
//
// ⚠️  REQUIRED: The parent route must export:
//       export const dynamic = "force-dynamic";
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  HelpCircle,
  Key,
  Send,
  ShieldCheck,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import QuickStartHero from "./QuickStartHero";
import StepCard from "./StepCard";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export type SetupState =
  | "missing_api_key"
  | "awaiting_first_event"
  | "complete";

export interface QuickStartGuideProps {
  hasApiKey: boolean;
  hasReceivedData: boolean;
  setupState: SetupState;
}

function formatLastChecked(timestamp: Date, now: number): string {
  const seconds = Math.round((now - timestamp.getTime()) / 1000);
  if (seconds < 5) return "Checked just now";
  if (seconds < 60) return `Checked ${seconds}s ago`;
  return `Checked ${Math.round(seconds / 60)}m ago`;
}

export default function QuickStartGuide({
  hasApiKey,
  hasReceivedData,
  setupState,
}: QuickStartGuideProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ─── Reactive timestamp ticker ──────────────────────────────────────────
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  // ─── Detect transition completion ───────────────────────────────────────
  const [showRefreshFlash, setShowRefreshFlash] = useState(false);
  const prevIsPendingRef = useRef(false);

  useEffect(() => {
    const wasRefreshing = prevIsPendingRef.current;
    prevIsPendingRef.current = isPending;

    if (wasRefreshing && !isPending) {
      setLastCheckedAt(new Date());
      setShowRefreshFlash(true);
      const t = setTimeout(() => setShowRefreshFlash(false), 1800);
      return () => clearTimeout(t);
    }
  }, [isPending]);

  // ─── Stable refresh callback ─────────────────────────────────────────────
  const isPendingRef = useRef(isPending);
  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  const canCheckStatus = hasApiKey && !hasReceivedData;

  const refreshDashboard = useCallback(() => {
    if (isPendingRef.current) return;
    startTransition(() => router.refresh());
  }, [router, startTransition]);

  // ─── Auto-poll interval ──────────────────────────────────────────────────
  useEffect(() => {
    if (!canCheckStatus) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      refreshDashboard();
    }, 10_000);

    return () => clearInterval(interval);
  }, [canCheckStatus, refreshDashboard]);

  // ─── Derived display values ───────────────────────────────────────────────
  const isComplete = setupState === "complete";
  const isAwaitingEvents = setupState === "awaiting_first_event";
  const lastCheckedLabel = lastCheckedAt ? formatLastChecked(lastCheckedAt, now) : null;

  const progressPercent = hasReceivedData ? 100 : hasApiKey ? 66 : 33;
  const progressColor = hasReceivedData ? "#10B981" : C.blue;

  // ─── Aesthetic Config ───────────────────────────────────────────────────
  const [refSteps, visSteps] = useVisible(0.1);
  const [refHelp, visHelp] = useVisible(0.1);

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";
  const sans = "var(--font-geist-sans), sans-serif";

  return (
    <section
      aria-labelledby="quickstart-heading"
      style={{ fontFamily: sans, padding: "60px 24px", maxWidth: 1024, margin: "0 auto" }}
    >
      <QuickStartHero
        isComplete={isComplete}
        isAwaitingEvents={isAwaitingEvents}
        hasApiKey={hasApiKey}
        hasReceivedData={hasReceivedData}
        canCheckStatus={canCheckStatus}
        isPending={isPending}
        showRefreshFlash={showRefreshFlash}
        lastCheckedLabel={lastCheckedLabel}
        progressPercent={progressPercent}
        progressColor={progressColor}
        refreshDashboard={refreshDashboard}
      />

      {/* ================================================================
          STEPS
      ================================================================ */}
      <div
        className={`fu ${visSteps ? "vis" : ""}`}
        ref={refSteps as React.RefObject<HTMLDivElement>}
        style={{ marginTop: 80 }}
      >
        <div style={{ marginBottom: 32 }}>
          <h2 className="pfd" style={{ fontSize: 32, color: C.navy, marginBottom: 12, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
            Setup Checklist
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62 }}>
            Complete the following steps to activate deterministic churn scoring,
            automated recovery campaigns, and revenue attribution.
          </p>
        </div>

        <ol style={{ display: "flex", flexDirection: "column", gap: 24, listStyle: "none", padding: 0, margin: 0 }}>
          <StepCard
            step={1}
            title="Connect your data pipeline"
            description="Generate a secure API key and begin streaming Stripe webhooks and product events into Arcli."
            status={hasApiKey ? "complete" : "active"}
            icon={<Key aria-hidden="true" size={16} />}
            helperText={
              hasApiKey
                ? "Integration credentials generated successfully."
                : "Usually takes less than 2 minutes to complete."
            }
            action={
              !hasApiKey ? (
                <Link
                  href="/settings"
                  style={{
                    height: 40, padding: "0 16px", borderRadius: 8,
                    background: C.navy, color: "#fff", fontSize: 14, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
                    boxShadow: surfaceShadow, letterSpacing: "0.02em"
                  }}
                >
                  Create API Key
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              ) : undefined
            }
          />

          <StepCard
            step={2}
            title="Validate incoming event traffic"
            description="Arcli will automatically verify webhook ingestion, normalize event payloads, and activate scoring pipelines."
            status={hasReceivedData ? "complete" : hasApiKey ? "active" : "locked"}
            icon={<Send aria-hidden="true" size={16} />}
            helperText={
              hasApiKey && !hasReceivedData
                ? "Waiting for your first production or test event."
                : hasReceivedData
                  ? "Live events detected successfully."
                  : "Complete Step 1 before event validation begins."
            }
          />

          <StepCard
            step={3}
            title="Activate recovery automation"
            description="Monitor churn-risk accounts, trigger automated recovery sequences, and measure recovered MRR attribution."
            status={hasReceivedData ? "complete" : "locked"}
            icon={<ShieldCheck aria-hidden="true" size={16} />}
            helperText={
              hasReceivedData
                ? "Your recovery queue is now operational."
                : "This unlocks automatically once events begin flowing."
            }
          />
        </ol>
      </div>

      {/* ================================================================
          HELP SECTION
      ================================================================ */}
      <div
        className={`fu ${visHelp ? "vis" : ""}`}
        ref={refHelp as React.RefObject<HTMLDivElement>}
        style={{
          marginTop: 80,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24
        }}
      >
        <div style={{ background: "#FFFFFF", border: surfaceBorder, borderRadius: 12, padding: 28, boxShadow: surfaceShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue }}>
              <Activity size={18} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: C.navy, letterSpacing: "-0.01em" }}>
              Real-time ingestion monitoring
            </h3>
          </div>
          <p style={{ color: C.navySoft, fontSize: 15, lineHeight: 1.62 }}>
            Arcli continuously validates incoming events, prevents duplicate
            processing, and maintains deterministic recovery attribution.
          </p>
        </div>

        <div style={{ background: "#FFFFFF", border: surfaceBorder, borderRadius: 12, padding: 28, boxShadow: surfaceShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981" }}>
              <ShieldCheck size={18} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: C.navy, letterSpacing: "-0.01em" }}>
              Enterprise-grade recovery workflows
            </h3>
          </div>
          <p style={{ color: C.navySoft, fontSize: 15, lineHeight: 1.62 }}>
            Cooldowns, idempotency protection, attribution tracking, and
            deterministic orchestration are enabled automatically.
          </p>
        </div>
      </div>

      {/* ================================================================
          FOOTER
      ================================================================ */}
      <footer style={{ marginTop: 80, borderTop: surfaceBorder, paddingTop: 40, paddingBottom: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: C.navySoft }}>
          <HelpCircle size={16} color={C.faint} />
          Need help integrating Arcli?
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Link
            href="/docs"
            style={{
              height: 40, padding: "0 16px", borderRadius: 8,
              background: "#FFFFFF", border: surfaceBorder, color: C.navy, fontSize: 14, fontWeight: 600,
              display: "inline-flex", alignItems: "center", textDecoration: "none", boxShadow: surfaceShadow
            }}
          >
            Developer Documentation
          </Link>

          <Link
            href="/support"
            style={{
              height: 40, padding: "0 16px", borderRadius: 8,
              background: "#F3F4F6", border: surfaceBorder, color: C.navy, fontSize: 14, fontWeight: 600,
              display: "inline-flex", alignItems: "center", textDecoration: "none"
            }}
          >
            Contact Support
          </Link>
        </div>
      </footer>
    </section>
  );
}