"use client";

import { useRouter } from "next/navigation";
import { Sparkles, CheckCircle2 } from "lucide-react";
import React, {
  useEffect,
  useRef,
  useState,
  useTransition,
  useMemo,
} from "react";

import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

import { QuickStartGuideSteps } from "@/app/(dashboard)/dashboard/tutorial/QuickStartGuideSteps";
import { QuickStartGuideModal } from "@/app/(dashboard)/dashboard/tutorial/QuickStartGuideModal";

// Removed "missing_stripe" from the possible states
export type SetupState =
  | "missing_api_key"
  | "awaiting_first_event"
  | "active";

// Removed hasStripe prop
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

  // ─── Optimistic Local State ──────────────────────────────────────────────
  const [localKeyGenerated, setLocalKeyGenerated] = useState(false);

  // Progressive Unlocking Logic (Stripe removed)
  const isApiKeyActive = hasApiKey || localKeyGenerated;
  const isComplete = setupState === "active";

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

  // ─── Stable refresh callback ────────────────────────────────────────────
  const isPendingRef = useRef(isPending);
  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  // Only poll if they have generated an API key but we haven't received events yet
  const canCheckStatus = isApiKeyActive && !hasReceivedData;

  const refreshDashboard = React.useCallback(() => {
    if (isPendingRef.current) return;
    startTransition(() => router.refresh());
  }, [router, startTransition]);

  // ─── Auto-poll interval (pauses when hidden) ──────────────────────────
  useEffect(() => {
    if (!canCheckStatus) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      interval = setInterval(() => {
        refreshDashboard();
      }, 10_000);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (interval) clearInterval(interval);
        interval = null;
      } else if (!interval) {
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [canCheckStatus, refreshDashboard]);

  // ─── Derived display values ─────────────────────────────────────────────
  const progressPercent = useMemo(() => {
    if (hasReceivedData) return 100;
    if (isApiKeyActive) return 50; // API Key done, waiting for data
    return 5; // Minimal progress just for starting
  }, [isApiKeyActive, hasReceivedData]);

  const lastCheckedLabel = useMemo(
    () => (lastCheckedAt ? formatLastChecked(lastCheckedAt, now) : null),
    [lastCheckedAt, now]
  );

  // ─── Aesthetic Config ───────────────────────────────────────────────────
  const [refSteps, visSteps] = useVisible(0.1);

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const sans = "var(--font-geist-sans), sans-serif";

  return (
    <section
      aria-labelledby="quickstart-heading"
      style={{
        fontFamily: sans,
        padding: "140px 24px",
        background: "#FAFAFA",
        borderTop: surfaceBorder,
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* ─── Compact Hero ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: isComplete ? "#059669" : C.blue,
              fontWeight: 700,
              fontSize: 12,
              marginBottom: 14,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {isComplete ? (
              <CheckCircle2 size={14} />
            ) : (
              <Sparkles size={14} />
            )}
            {isComplete ? "Setup Complete" : "Setup in Progress"}
          </div>

          <h1
            id="quickstart-heading"
            className="pfd"
            style={{
              fontSize: 42,
              color: C.navy,
              fontWeight: 600,
              lineHeight: 1.06,
              letterSpacing: "-0.015em",
              marginBottom: 20,
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
              aria-live="polite"
              aria-atomic="true"
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
                  animation:
                    "qsg-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
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
                <span
                  style={{ color: "#10B981", fontWeight: 600, fontSize: 12 }}
                >
                  Updated
                </span>
              )}
            </div>
          )}
        </div>

        {/* ─── Steps ────────────────────────────────────────────────── */}
        <div
          className={`fu ${visSteps ? "vis" : ""}`}
          ref={refSteps}
        >
          <QuickStartGuideSteps
            hasApiKey={isApiKeyActive}
            hasReceivedData={hasReceivedData}
            setupState={setupState}
            onOpenApiModal={() => setIsApiModalOpen(true)}
          />
        </div>

        {/* ─── Compact Footer ─────────────────────────────────────── */}
        <footer
          style={{
            marginTop: 48,
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
            <a
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
            </a>
            <a
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
            </a>
          </div>
        </footer>
      </div>

      {/* ─── Modal ────────────────────────────────────────────────── */}
      <QuickStartGuideModal
        isOpen={isApiModalOpen}
        onOpenChange={(open) => {
          setIsApiModalOpen(open);
          if (!open) refreshDashboard();
        }}
        onKeyGenerated={() => setLocalKeyGenerated(true)}
        onDone={() => {
          setIsApiModalOpen(false);
          refreshDashboard();
        }}
      />

      {/* ─── Scoped keyframes ───────────────────────────────────── */}
      <style jsx>{`
        @keyframes qsg-pulse {
          0%,
          100% {
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