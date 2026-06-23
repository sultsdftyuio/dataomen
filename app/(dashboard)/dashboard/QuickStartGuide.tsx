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
  Sparkles,
  Lock,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

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
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export default function QuickStartGuide({
  hasApiKey,
  hasReceivedData,
  setupState,
}: QuickStartGuideProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);

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

  // ─── Derived display values ─────────────────────────────────────────────
  const isComplete = setupState === "complete";
  const lastCheckedLabel = lastCheckedAt
    ? formatLastChecked(lastCheckedAt, now)
    : null;

  const progressPercent = hasReceivedData ? 100 : hasApiKey ? 66 : 33;

  // ─── Aesthetic Config ───────────────────────────────────────────────────
  const [refSteps, visSteps] = useVisible(0.1);

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";
  const sans = "var(--font-geist-sans), sans-serif";

  // ─── Compact Step Renderer ──────────────────────────────────────────────
  const renderStep = (
    stepNum: number,
    title: string,
    description: string,
    status: "complete" | "active" | "locked",
    action?: React.ReactNode
  ) => {
    const isDone = status === "complete";
    const isLocked = status === "locked";

    // COMPACT: Completed steps shrink to a horizontal row
    if (isDone) {
      return (
        <li
          key={stepNum}
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
          key={stepNum}
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

    // ACTIVE: Full but tight card (only one should ever be active)
    return (
      <li
        key={stepNum}
        style={{
          padding: "20px",
          borderRadius: 12,
          background: "#fff",
          border: surfaceBorder,
          boxShadow: surfaceShadow,
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
      </li>
    );
  };

  return (
    <section
      aria-labelledby="quickstart-heading"
      style={{
        fontFamily: sans,
        padding: "40px 24px",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {/* ─── Compact Hero (~140px) ──────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          {isComplete ? (
            <CheckCircle2 size={18} color="#10B981" />
          ) : (
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: `2px solid ${C.navy}`,
                borderTopColor: "transparent",
                animation: "spin 1s linear infinite",
              }}
            />
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: isComplete ? "#059669" : C.navySoft,
            }}
          >
            {isComplete ? "Setup Complete" : "Setup in Progress"}
          </span>
        </div>

        <h1
          id="quickstart-heading"
          style={{
            fontSize: 26,
            color: C.navy,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            marginBottom: 10,
          }}
        >
          {isComplete ? "You're all set" : "Get Arcli running in 2 minutes"}
        </h1>

        {!isComplete && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: "#E5E7EB",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: hasReceivedData ? "#10B981" : C.blue,
                  borderRadius: 2,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: C.navySoft,
                minWidth: 32,
                textAlign: "right",
              }}
            >
              {progressPercent}%
            </span>
          </div>
        )}

        {canCheckStatus && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#6B7280",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#10B981",
                display: "inline-block",
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
            Listening for events
            {lastCheckedLabel && (
              <span style={{ marginLeft: "auto" }}>
                Checked {lastCheckedLabel}
              </span>
            )}
            <button
              onClick={refreshDashboard}
              disabled={isPending}
              style={{
                background: "none",
                border: "none",
                color: C.blue,
                fontSize: 12,
                fontWeight: 600,
                cursor: isPending ? "wait" : "pointer",
                padding: 0,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              {isPending ? "Refreshing..." : "Refresh"}
            </button>
            {showRefreshFlash && (
              <span style={{ color: "#10B981", fontWeight: 600, fontSize: 12 }}>
                Updated
              </span>
            )}
          </div>
        )}
      </div>

      {/* ─── Steps (alternating density) ────────────────────────────────── */}
      <div
        className={`fu ${visSteps ? "vis" : ""}`}
        ref={refSteps as React.RefObject<HTMLDivElement>}
      >
        <ol
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {/* ─── STEP 1 ─────────────────────────────────────────────────── */}
          {renderStep(
            1,
            "Create your API key",
            "Generate credentials for your integration.",
            hasApiKey ? "complete" : "active",
            !hasApiKey ? (
              <Dialog
                open={isApiModalOpen}
                onOpenChange={setIsApiModalOpen}
              >
                <DialogTrigger asChild>
                  <button
                    style={{
                      height: 36,
                      padding: "0 14px",
                      borderRadius: 8,
                      background: C.navy,
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "none",
                      cursor: "pointer",
                      boxShadow: surfaceShadow,
                    }}
                  >
                    Create API Key
                    <ArrowRight size={13} />
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
                      only displayed once.
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
          )}

          {/* ─── STEP 2 ─────────────────────────────────────────────────── */}
          {renderStep(
            2,
            "Validate incoming events",
            hasApiKey
              ? hasReceivedData
                ? "Integration verified."
                : "Send your first event to verify the integration."
              : "Complete Step 1 first.",
            hasReceivedData ? "complete" : hasApiKey ? "active" : "locked",
            hasApiKey && !hasReceivedData ? (
              <Link
                href="/docs/test-events"
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 8,
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
                Send test event
              </Link>
            ) : hasReceivedData ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "#059669",
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={14} />
                Event received
              </div>
            ) : undefined
          )}

          {/* ─── STEP 3 ─────────────────────────────────────────────────── */}
          {renderStep(
            3,
            "Your dashboard is live",
            "Monitor churn-risk accounts and trigger recovery.",
            hasReceivedData ? "complete" : "locked",
            hasReceivedData ? (
              <Link
                href="/dashboard"
                style={{
                  height: 36,
                  padding: "0 16px",
                  borderRadius: 8,
                  background: "#10B981",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                  boxShadow: "0 1px 3px rgba(16,185,129,0.25)",
                }}
              >
                Go to Dashboard
                <ChevronRight size={13} />
              </Link>
            ) : undefined
          )}
        </ol>
      </div>

      {/* ─── Compact Footer (~60px) ─────────────────────────────────────── */}
      <footer
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: surfaceBorder,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 13, color: C.navySoft, fontWeight: 500 }}>
          Need help?
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/docs"
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              background: C.navy,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              textDecoration: "none",
            }}
          >
            Docs
            <ExternalLink size={11} />
          </Link>
          <Link
            href="/support"
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              background: "#F3F4F6",
              border: surfaceBorder,
              color: C.navy,
              fontSize: 12,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            Support
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
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </section>
  );
}