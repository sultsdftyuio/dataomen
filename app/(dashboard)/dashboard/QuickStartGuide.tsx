// app/(dashboard)/dashboard/QuickStartGuide.tsx
//
// ⚠️  REQUIRED: The parent route must export:
//        export const dynamic = "force-dynamic";
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Key,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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

// UI Components for the Modal Injection
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

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
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [isStep2Highlighted, setIsStep2Highlighted] = useState(false);

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

  // ─── Highlight Step 2 after modal closes ─────────────────────────────────
  useEffect(() => {
    if (!isApiModalOpen && hasApiKey && !hasReceivedData) {
      setIsStep2Highlighted(true);
      const t = setTimeout(() => setIsStep2Highlighted(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isApiModalOpen, hasApiKey, hasReceivedData]);

  // ─── Derived display values ───────────────────────────────────────────────
  const isComplete = setupState === "complete";
  const isAwaitingEvents = setupState === "awaiting_first_event";
  const lastCheckedLabel = lastCheckedAt
    ? formatLastChecked(lastCheckedAt, now)
    : null;

  const progressPercent = hasReceivedData ? 100 : hasApiKey ? 66 : 33;
  const progressColor = hasReceivedData ? "#10B981" : C.blue;

  // ─── Aesthetic Config ───────────────────────────────────────────────────
  const [refSteps, visSteps] = useVisible(0.1);

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";
  const sans = "var(--font-geist-sans), sans-serif";

  // ─── Step 2 live status helpers ──────────────────────────────────────────
  const step2Status = hasReceivedData
    ? "complete"
    : hasApiKey
      ? "active"
      : "locked";

  const step2HelperText = hasApiKey
    ? hasReceivedData
      ? "✓ Event received — your integration is live."
      : "Waiting for your first event..."
    : "Complete Step 1 before event validation begins.";

  return (
    <section
      aria-labelledby="quickstart-heading"
      style={{
        fontFamily: sans,
        padding: "60px 24px",
        maxWidth: 1024,
        margin: "0 auto",
      }}
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
          <h2
            className="pfd"
            style={{
              fontSize: 32,
              color: C.navy,
              marginBottom: 12,
              lineHeight: 1.08,
              letterSpacing: "-0.015em",
              fontWeight: 600,
            }}
          >
            Get Arcli running in under 2 minutes
          </h2>
          <p
            style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62 }}
          >
            Complete these three steps to start detecting churn and recovering
            revenue.
          </p>
        </div>

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
          {/* ─── STEP 1: Create API Key ────────────────────────────────── */}
          <StepCard
            step={1}
            title="Create your API key"
            description="Generate secure credentials so Arcli can receive your Stripe webhooks and product events."
            status={hasApiKey ? "complete" : "active"}
            icon={<Key aria-hidden="true" size={16} />}
            helperText={
              hasApiKey
                ? "✓ API credentials created successfully."
                : "Usually takes less than 2 minutes to complete."
            }
            action={
              !hasApiKey ? (
                <Dialog
                  open={isApiModalOpen}
                  onOpenChange={setIsApiModalOpen}
                >
                  <DialogTrigger asChild>
                    <button
                      style={{
                        height: 40,
                        padding: "0 16px",
                        borderRadius: 8,
                        background: C.navy,
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        textDecoration: "none",
                        boxShadow: surfaceShadow,
                        letterSpacing: "0.02em",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Create API Key
                      <ArrowRight aria-hidden="true" size={14} />
                    </button>
                  </DialogTrigger>

                  <DialogContent
                    className="sm:max-w-3xl p-0 border-slate-200 shadow-xl overflow-hidden rounded-xl"
                    style={{ fontFamily: sans }}
                  >
                    <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-white">
                      <DialogTitle className="flex items-center gap-2.5 text-lg text-slate-900 tracking-tight">
                        <ShieldAlert className="h-5 w-5 text-blue-600" />
                        API Credentials
                      </DialogTitle>
                      <DialogDescription className="text-sm text-slate-500 mt-1.5">
                        Generate and store your API keys securely. Raw keys are
                        only displayed once — copy them to your integration
                        immediately.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 bg-slate-50/50 max-h-[60vh] overflow-y-auto">
                      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm">
                        <ApiKeysManager />
                      </div>
                    </div>

                    <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end">
                      <button
                        onClick={() => {
                          setIsApiModalOpen(false);
                          refreshDashboard();
                        }}
                        style={{
                          height: 36,
                          padding: "0 16px",
                          borderRadius: 6,
                          background: C.navy,
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : undefined
            }
          />

          {/* ─── STEP 2: Validate Events ───────────────────────────────── */}
          <StepCard
            step={2}
            title="Validate incoming events"
            description="We'll automatically detect your first event and confirm your integration is working."
            status={step2Status}
            icon={<Send aria-hidden="true" size={16} />}
            helperText={step2HelperText}
            isHighlighted={isStep2Highlighted}
            action={
              hasApiKey && !hasReceivedData ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    aria-live="polite"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      background: "rgba(16,185,129,0.06)",
                      border: "1px solid rgba(16,185,129,0.15)",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#059669",
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#10B981",
                        display: "inline-block",
                        animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                      }}
                    />
                    Listening for events...
                    {lastCheckedLabel && (
                      <span
                        style={{
                          marginLeft: "auto",
                          color: "#6B7280",
                          fontSize: 12,
                          fontWeight: 400,
                        }}
                      >
                        {lastCheckedLabel} · Auto-refreshing every 10s
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link
                      href="/docs/webhooks"
                      style={{
                        height: 36,
                        padding: "0 14px",
                        borderRadius: 6,
                        background: "#FFFFFF",
                        border: surfaceBorder,
                        color: C.navy,
                        fontSize: 13,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        textDecoration: "none",
                        boxShadow: surfaceShadow,
                      }}
                    >
                      <ExternalLink size={13} />
                      View integration docs
                    </Link>

                    <Link
                      href="/docs/test-events"
                      style={{
                        height: 36,
                        padding: "0 14px",
                        borderRadius: 6,
                        background: "#F3F4F6",
                        border: surfaceBorder,
                        color: C.navy,
                        fontSize: 13,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        textDecoration: "none",
                      }}
                    >
                      <Send size={13} />
                      Send a test event
                    </Link>
                  </div>
                </div>
              ) : hasReceivedData ? (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    background: "rgba(16,185,129,0.08)",
                    borderRadius: 6,
                    color: "#059669",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={15} />
                  Event received {lastCheckedLabel ? `— ${lastCheckedLabel}` : ""}
                </div>
              ) : undefined
            }
          />

          {/* ─── STEP 3: Dashboard Live ────────────────────────────────── */}
          <StepCard
            step={3}
            title="Your dashboard is now live"
            description="Monitor churn-risk accounts, trigger recovery sequences, and measure recovered MRR."
            status={hasReceivedData ? "complete" : "locked"}
            icon={<Sparkles aria-hidden="true" size={16} />}
            helperText={
              hasReceivedData
                ? "🎉 You're all set. Recovery automation is operational."
                : "This unlocks automatically once events begin flowing."
            }
            action={
              hasReceivedData ? (
                <Link
                  href="/dashboard"
                  style={{
                    height: 40,
                    padding: "0 18px",
                    borderRadius: 8,
                    background: "#10B981",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    textDecoration: "none",
                    boxShadow: "0 1px 3px rgba(16,185,129,0.25)",
                    letterSpacing: "0.02em",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Go to Dashboard
                  <ChevronRight aria-hidden="true" size={14} />
                </Link>
              ) : undefined
            }
          />
        </ol>
      </div>

      {/* ================================================================
          FOOTER
      ================================================================ */}
      <footer
        style={{
          marginTop: 80,
          borderTop: surfaceBorder,
          paddingTop: 40,
          paddingBottom: 40,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 500,
            color: C.navySoft,
          }}
        >
          Need help integrating Arcli?
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <Link
            href="/docs"
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              background: C.navy,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              boxShadow: surfaceShadow,
              letterSpacing: "0.02em",
            }}
          >
            Developer Documentation
            <ExternalLink size={14} />
          </Link>

          <Link
            href="/support"
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              background: "#F3F4F6",
              border: surfaceBorder,
              color: C.navy,
              fontSize: 14,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            Contact Support
          </Link>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </section>
  );
}