"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  Radar,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { useAsyncProvisioning } from "@/hooks/useAsyncProvisioning";

type TimelinePhase = {
  key: string;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
};

const TIMELINE: TimelinePhase[] = [
  {
    key: "workspace",
    title: "Secure the tenant boundary",
    description: "Lock in the workspace record, isolate the tenant, and prepare the account shell.",
    icon: ShieldCheck,
  },
  {
    key: "integration",
    title: "Bind Stripe and event streams",
    description: "Attach the billing connection so webhooks and billing data stay scoped to this tenant.",
    icon: Workflow,
  },
  {
    key: "backfill",
    title: "Build the baseline intelligence set",
    description: "Pull the rolling Stripe history window and score the first recovery opportunities.",
    icon: Database,
  },
];

const PHASE_ORDER = ["PROVISIONING", "INTEGRATION", "BACKFILLING", "READY"] as const;

function getPhaseIndex(phase: string) {
  const index = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);
  return index < 0 ? 0 : Math.min(index, TIMELINE.length - 1);
}

function formatElapsed(elapsedMs: number) {
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function WorkspaceProvisioningPanel() {
  const router = useRouter();
  const { status, phase, message } = useAsyncProvisioning();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (status === "READY") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const isReady = status === "READY";
  const isFailed = status === "FAILED";
  const activePhaseIndex = getPhaseIndex(phase);
  const activePhase = TIMELINE[activePhaseIndex];
  const phaseProgress = [18, 52, 84][activePhaseIndex];
  const timelineStatus = useMemo(
    () =>
      TIMELINE.map((phase, index) => {
        if (isFailed) {
          return { ...phase, state: "complete" as const };
        }

        if (isReady) {
          return { ...phase, state: "complete" as const };
        }

        if (index < activePhaseIndex) {
          return { ...phase, state: "complete" as const };
        }

        if (index === activePhaseIndex) {
          return { ...phase, state: "active" as const };
        }

        return { ...phase, state: "pending" as const };
      }),
    [activePhaseIndex, isFailed, isReady]
  );

  const currentMessage = isFailed
    ? "Provisioning timed out before the tenant became ready."
    : isReady
    ? "Workspace secured. Redirecting to the dashboard now."
    : message || activePhase.description;

  const headline = "Creating your recovery workspace";

  const subheadline = "Arcli is finalizing the tenant boundary, wiring the Stripe integration, and preparing the first risk baseline.";

  const handleRetry = () => {
    setElapsedMs(0);
    window.location.reload();
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#f4f7fb] text-slate-950">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_36%),radial-gradient(circle_at_80%_20%,rgba(15,23,42,0.08),transparent_28%),linear-gradient(180deg,#f9fbff_0%,#eef3f9_100%)]" />
      <div aria-hidden="true" className="loading-orb loading-orb-1 absolute -left-28 top-24 h-64 w-64 rounded-full bg-sky-300/30 blur-3xl" />
      <div aria-hidden="true" className="loading-orb loading-orb-2 absolute bottom-[-6rem] right-[-5rem] h-72 w-72 rounded-full bg-slate-400/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.25fr_0.85fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/78 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.7),rgba(255,255,255,0)),radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_30%)]" />

            <div className="relative flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_0_5px_rgba(14,165,233,0.14)]" />
                Workspace provisioning
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                Live for {formatElapsed(elapsedMs)}
              </span>
            </div>

            <div className="relative mt-6 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <h1 className="pfd text-4xl tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                  {headline}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                  {subheadline}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <Radar className="h-3.5 w-3.5 text-slate-500" />
                  Current phase
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {activePhase.title}
                </div>
              </div>
            </div>

            <div role="status" aria-live="polite" className="relative mt-8 rounded-[1.5rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
                    {isFailed ? (
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    ) : isReady ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
                    )}
                    {isFailed ? "Provisioning paused" : isReady ? "Workspace ready" : "Provisioning in progress"}
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                    {currentMessage}
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                  {phaseProgress}% complete
                </div>
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="loading-progress-bar h-full rounded-full"
                  style={{ width: `${phaseProgress}%` }}
                />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Tenant scope
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/90">
                    Locked and isolated
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Stripe sync window
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/90">
                    Rolling 7-day baseline
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Late-arrival reconciliation
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/90">
                    48-hour repair pass
                  </div>
                </div>
              </div>
            </div>

            {isFailed ? (
              <div className="relative mt-8 rounded-[1.5rem] border border-rose-200 bg-rose-50 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                  <div>
                    <h2 className="text-base font-semibold text-rose-950">
                      We could not confirm the workspace in time.
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-rose-700">
                      Your account is intact. Retry the handoff and the system will re-check the tenant mapping.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                  >
                    Retry setup
                  </button>
                  <a
                    href="mailto:support@arcli.com"
                    className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white px-5 py-3 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
                  >
                    Contact support
                  </a>
                </div>
              </div>
            ) : null}

            <div className="relative mt-8 grid gap-3 lg:grid-cols-3">
              {timelineStatus.map((phase, index) => {
                const PhaseIcon = phase.icon;
                const isActive = phase.state === "active";
                const isComplete = phase.state === "complete";

                return (
                  <div
                    key={phase.key}
                    className={`rounded-2xl border p-4 transition-all duration-300 ${
                      isActive
                        ? "border-sky-200 bg-sky-50 shadow-sm"
                        : isComplete
                          ? "border-emerald-200 bg-emerald-50/70"
                          : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <PhaseIcon className={`mt-0.5 h-5 w-5 shrink-0 ${isComplete ? "text-emerald-500" : isActive ? "text-sky-500" : "text-slate-400"}`} />
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{phase.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{phase.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="relative overflow-hidden rounded-[2rem] border border-slate-900/10 bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.26)] sm:p-8">
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent)]" />

            <div className="relative">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                <Sparkles className="h-4 w-4 text-sky-300" />
                Deterministic onboarding
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Detect first, recover fast, then measure the lift.
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                This screen is the visual bridge between account creation and the first usable dashboard. It keeps the user informed while the backend finishes the workspace handoff and prepares the Stripe baseline.
              </p>

              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    Tenant isolation
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    The account stays in a safe holding state until the workspace is ready.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    <Workflow className="h-4 w-4 text-sky-300" />
                    Integration gateway
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Stripe connection, webhooks, and tenant mappings are prepared before any recovery logic runs.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    <Database className="h-4 w-4 text-slate-300" />
                    Initial backfill depth
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    The connector currently keeps the first backfill intentionally tight: a rolling 7-day Stripe history window by default, then a 48-hour reconciliation pass for charges, subscriptions, and invoices so the dashboard gets useful fast without hammering Stripe.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Operator note
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  If you need a longer historical import, increase <span className="font-medium text-white">STRIPE_INCREMENTAL_WINDOW_SECS</span> for the initial pull and <span className="font-medium text-white">STRIPE_RECONCILIATION_LOOKBACK_HOURS</span> for the late-arrival repair pass.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-slate-100"
                >
                  Open dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-transparent px-5 py-3 text-sm font-medium text-slate-300">
                  Please keep this tab open
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
