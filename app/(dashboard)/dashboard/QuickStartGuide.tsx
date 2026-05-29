// app/(dashboard)/dashboard/QuickStartGuide.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Key,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type SetupState =
  | "missing_api_key"
  | "awaiting_first_event";

interface QuickStartGuideProps {
  hasApiKey: boolean;
  hasReceivedData: boolean;
  setupState: SetupState;
}

interface StepProps {
  step: number;
  title: string;
  description: string;
  status: "complete" | "active" | "locked";
  icon: React.ReactNode;
  action?: React.ReactNode;
  helperText?: string;
}

function StepCard({
  step,
  title,
  description,
  status,
  icon,
  action,
  helperText,
}: StepProps) {
  const isComplete = status === "complete";
  const isActive = status === "active";

  return (
    <li
      className={`relative flex gap-5 rounded-2xl border p-5 transition-all duration-200 ${
        isComplete
          ? "border-emerald-200 bg-emerald-50/50"
          : isActive
            ? "border-blue-200 bg-blue-50/40 shadow-sm"
            : "border-slate-200 bg-white opacity-70"
      }`}
    >
      {/* Step Number Line */}
      <div
        aria-hidden="true"
        className="absolute left-[2.15rem] top-[4.8rem] bottom-[-2.5rem] w-px bg-slate-200 last:hidden"
      />

      {/* Icon */}
      <div
        className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-sm ${
          isComplete
            ? "border-emerald-200 bg-emerald-100 text-emerald-700"
            : isActive
              ? "border-blue-200 bg-blue-100 text-blue-700"
              : "border-slate-200 bg-slate-100 text-slate-400"
        }`}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wider uppercase text-slate-400">
            Step {step}
          </span>

          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isComplete
                ? "bg-emerald-100 text-emerald-700"
                : isActive
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {isComplete
              ? "Complete"
              : isActive
                ? "In Progress"
                : "Locked"}
          </span>
        </div>

        <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
          {title}
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          {description}
        </p>

        {helperText && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500">
            <Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{helperText}</span>
          </div>
        )}

        {action && (
          <div className="mt-5">
            {action}
          </div>
        )}
      </div>
    </li>
  );
}

function formatLastChecked(timestamp: Date) {
  const seconds = Math.round((Date.now() - timestamp.getTime()) / 1000);

  if (seconds < 5) {
    return "Checked just now";
  }

  if (seconds < 60) {
    return `Checked ${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  return `Checked ${minutes}m ago`;
}

export default function QuickStartGuide({
  hasApiKey,
  hasReceivedData,
  setupState,
}: QuickStartGuideProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const canCheckStatus = hasApiKey && !hasReceivedData;
  const isAwaitingEvents = setupState === "awaiting_first_event";
  const lastCheckedLabel = lastCheckedAt
    ? formatLastChecked(lastCheckedAt)
    : null;

  const handleRefresh = () => {
    if (isPending) return;

    startTransition(() => {
      router.refresh();
      setLastCheckedAt(new Date());
    });
  };

  useEffect(() => {
    if (!canCheckStatus) return;

    const interval = setInterval(() => {
      if (isPending) return;

      startTransition(() => {
        router.refresh();
        setLastCheckedAt(new Date());
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [canCheckStatus, isPending, router, startTransition]);

  return (
    <section className="mx-auto w-full max-w-5xl animate-in fade-in duration-300 px-4 py-10 sm:px-6 lg:px-8">
      
      {/* ============================================================================
          HERO
      ============================================================================ */}

      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 shadow-sm">
        
        {/* Background Glow */}
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-64 w-64 translate-x-1/4 -translate-y-1/4 rounded-full bg-blue-100 blur-3xl opacity-60"
        />

        <div className="relative z-10 flex flex-col gap-10 px-6 py-8 sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:justify-between">
          
          {/* Left */}
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700 backdrop-blur">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              Deterministic onboarding
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {isAwaitingEvents
                ? "Integration detected successfully"
                : "Welcome to Arcli"}
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
              {isAwaitingEvents
                ? "Your API integration is active. Arcli is now waiting for your first Stripe or product events before enabling automated churn detection and recovery workflows."
                : "Connect your billing and product events to begin detecting churn risk, recovering revenue, and automating lifecycle intervention flows."}
            </p>

            {/* Live Status Panel */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    hasApiKey
                      ? "bg-emerald-500"
                      : "bg-blue-500 animate-pulse"
                  }`}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    API Key
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {hasApiKey ? "Connected" : "Pending"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    hasReceivedData
                      ? "bg-emerald-500"
                      : "bg-amber-500 animate-pulse"
                  }`}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Event Stream
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {hasReceivedData ? "Receiving Data" : "Awaiting Events"}
                  </p>
                </div>
              </div>

              {canCheckStatus && (
                <div className="flex w-full flex-col items-start gap-1 sm:ml-auto sm:w-auto sm:items-end">
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isPending}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={`h-4 w-4 ${
                        isPending
                          ? "animate-spin text-blue-500"
                          : "text-slate-400"
                      }`}
                    />
                    {isPending ? "Checking..." : "Check Status"}
                  </button>

                  {lastCheckedLabel && (
                    <span className="text-xs text-slate-500">
                      {lastCheckedLabel}
                    </span>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Right Visual */}
          <div className="relative flex items-center justify-center">
            <div className="flex h-44 w-44 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-xl">
              <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Radar aria-hidden="true" className="h-14 w-14" />
              </div>
            </div>

            {/* Floating Indicators */}
            <div className="absolute -left-2 top-5 rounded-xl border border-emerald-200 bg-white px-3 py-2 shadow-lg">
              <div className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-700">
                  Recovery Engine Ready
                </span>
              </div>
            </div>

            <div className="absolute -bottom-2 right-0 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
              <div className="flex items-center gap-2">
                <Activity aria-hidden="true" className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold text-slate-700">
                  Real-time Pipeline
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================================
          PROGRESS BAR
      ============================================================================ */}

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Onboarding Progress
            </h2>

            <p className="mt-1 text-lg font-semibold text-slate-900">
              {hasReceivedData
                ? "Setup complete"
                : hasApiKey
                  ? "Waiting for incoming events"
                  : "Connect your integration"}
            </p>
          </div>

          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {hasReceivedData ? "100%" : hasApiKey ? "65%" : "25%"}
            </p>
            <p className="text-xs text-slate-500">
              System readiness
            </p>
          </div>
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              hasReceivedData
                ? "w-full bg-emerald-500"
                : hasApiKey
                  ? "w-[65%] bg-blue-500"
                  : "w-[25%] bg-blue-400"
            }`}
          />
        </div>
      </div>

      {/* ============================================================================
          STEPS
      ============================================================================ */}

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Setup Checklist
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Complete the following steps to activate deterministic churn scoring,
            automated recovery campaigns, and revenue attribution.
          </p>
        </div>

        <ol className="space-y-6">
          
          {/* Step 1 */}
          <StepCard
            step={1}
            title="Connect your data pipeline"
            description="Generate a secure API key and begin streaming Stripe webhooks and product events into Arcli."
            status={hasApiKey ? "complete" : "active"}
            icon={<Key aria-hidden="true" className="h-5 w-5" />}
            helperText={
              hasApiKey
                ? "Integration credentials generated successfully."
                : "Usually takes less than 2 minutes to complete."
            }
            action={
              !hasApiKey ? (
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.98]"
                >
                  Generate API Key
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              ) : undefined
            }
          />

          {/* Step 2 */}
          <StepCard
            step={2}
            title="Validate incoming event traffic"
            description="Arcli will automatically verify webhook ingestion, normalize event payloads, and activate scoring pipelines."
            status={
              hasReceivedData
                ? "complete"
                : hasApiKey
                  ? "active"
                  : "locked"
            }
            icon={<Send aria-hidden="true" className="h-5 w-5" />}
            helperText={
              hasApiKey && !hasReceivedData
                ? "Waiting for your first production or test event."
                : hasReceivedData
                  ? "Live events detected successfully."
                  : "Complete Step 1 before event validation begins."
            }
          />

          {/* Step 3 */}
          <StepCard
            step={3}
            title="Activate recovery automation"
            description="Monitor churn-risk accounts, trigger automated recovery sequences, and measure recovered MRR attribution."
            status={
              hasReceivedData
                ? "active"
                : "locked"
            }
            icon={<ShieldCheck aria-hidden="true" className="h-5 w-5" />}
            helperText={
              hasReceivedData
                ? "Your recovery queue is now operational."
                : "This unlocks automatically once events begin flowing."
            }
          />
        </ol>
      </div>

      {/* ============================================================================
          HELP SECTION
      ============================================================================ */}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
              <Activity aria-hidden="true" className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Real-time ingestion monitoring
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Arcli continuously validates incoming events, prevents duplicate
                processing, and maintains deterministic recovery attribution.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Enterprise-grade recovery workflows
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Cooldowns, idempotency protection, attribution tracking, and
                deterministic orchestration are enabled automatically.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* ============================================================================
          FOOTER
      ============================================================================ */}

      <footer className="mt-10 flex flex-col items-center justify-center gap-3 border-t border-slate-200 pt-6 text-center">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />
          Need help integrating Arcli?
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Developer Documentation
          </Link>

          <Link
            href="/support"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Contact Support
          </Link>
        </div>
      </footer>
    </section>
  );
}