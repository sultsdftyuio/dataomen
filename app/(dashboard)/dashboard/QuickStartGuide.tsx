// app/(dashboard)/dashboard/QuickStartGuide.tsx
//
// ⚠️  REQUIRED: The parent route must export:
//       export const dynamic = "force-dynamic";
//     Without it, router.refresh() may serve a cached response and
//     never reflect freshly-ingested events.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Key,
  Lock,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

// FIX #2 (new): Added "complete" variant so the hero heading can express
//               the fully-onboarded state instead of getting stuck on
//               "awaiting_first_event" after setup finishes.
type SetupState =
  | "missing_api_key"
  | "awaiting_first_event"
  | "complete";

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
  const isActive   = status === "active";

  // FIX #5 (new): Status-aware helper icon — clock implies "waiting",
  //               not "done". Use CheckCircle2 on complete, Lock on locked.
  const HelperIcon = isComplete ? CheckCircle2 : isActive ? Clock3 : Lock;
  const helperIconColor = isComplete
    ? "text-emerald-500"
    : isActive
      ? "text-blue-400"
      : "text-slate-400";

  return (
    // FIX #8 (new): aria-current="step" gives screen readers a programmatic
    //               signal for which step is active (mirrors the visual blue border).
    // FIX #1 (new): Added `group` so the connector line can use `group-last:hidden`
    //               (see the div below). The original `last:hidden` targeted this
    //               div's own last-child status inside <li>, which was never true.
    <li
      aria-current={isActive ? "step" : undefined}
      className={`group relative flex gap-5 rounded-2xl border p-5 transition-all duration-200 ${
        isComplete
          ? "border-emerald-200 bg-emerald-50/50"
          : isActive
            ? "border-blue-200 bg-blue-50/40 shadow-sm"
            : "border-slate-200 bg-white opacity-70"
      }`}
    >
      {/* Step connector line
          FIX #1 (new): `group-last:hidden` correctly hides the line when
          this <li> is the last child of <ol>, not when this div is the
          last child of <li> (which was never the case). */}
      <div
        aria-hidden="true"
        className="absolute left-[2.15rem] top-[4.8rem] bottom-[-2.5rem] w-px bg-slate-200 group-last:hidden"
      />

      {/* Step icon */}
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
            {isComplete ? "Complete" : isActive ? "In Progress" : "Locked"}
          </span>
        </div>

        {/* FIX #3 (new): Changed h2 → h3. Step titles were siblings of the
                          "Setup Checklist" h2 that contains them, flattening
                          the document outline for screen readers. */}
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
          {title}
        </h3>

        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          {description}
        </p>

        {helperText && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500">
            <HelperIcon
              aria-hidden="true"
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${helperIconColor}`}
            />
            <span>{helperText}</span>
          </div>
        )}

        {action && <div className="mt-5">{action}</div>}
      </div>
    </li>
  );
}

// FIX #6 (existing): Accepts `now` from a 1-second ticker so the label
//                    stays live between refreshes, instead of freezing.
function formatLastChecked(timestamp: Date, now: number): string {
  const seconds = Math.round((now - timestamp.getTime()) / 1000);
  if (seconds < 5)  return "Checked just now";
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
  // FIX #6 (existing): 1-second ticker makes formatLastChecked() live.
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  // ─── Detect transition completion ───────────────────────────────────────
  // FIX #2 (existing): lastCheckedAt now updates only after the transition
  //                    settles (isPending flips true → false), not optimistically
  //                    before the server response arrives.
  // FIX #9 (existing): showRefreshFlash provides subtle success micro-feedback.
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
  // FIX #1 (existing): Moved isPending guard to a ref so refreshDashboard
  //                    itself stays referentially stable (router and
  //                    startTransition are both stable across renders).
  //
  // FIX #4 (new): isPending is no longer a useEffect dependency for the
  //               interval — meaning the interval no longer restarts after
  //               every completed refresh (which was extending the effective
  //               cadence by transition duration each time).
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
  // FIX #3 (existing): document.hidden guard stops background-tab refreshes.
  // FIX #4 (new):      isPending removed from deps, so the interval is not
  //                    torn down and recreated on every transition completion.
  useEffect(() => {
    if (!canCheckStatus) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      refreshDashboard();
    }, 10_000);

    return () => clearInterval(interval);
  }, [canCheckStatus, refreshDashboard]);

  // ─── Derived display values ───────────────────────────────────────────────
  const isComplete      = setupState === "complete";
  const isAwaitingEvents = setupState === "awaiting_first_event";

  const lastCheckedLabel = lastCheckedAt
    ? formatLastChecked(lastCheckedAt, now)
    : null;

  // FIX #5 (existing): Progress steps now reflect real thirds (33/66/100)
  //                    rather than the arbitrary 25/65/100 that users can
  //                    intuitively feel are fabricated.
  const progressPercent = hasReceivedData ? 100 : hasApiKey ? 66 : 33;
  const progressColor   = hasReceivedData ? "bg-emerald-500" : hasApiKey ? "bg-blue-500" : "bg-blue-400";

  return (
    // FIX #7 (new): aria-labelledby connects the <section> landmark to the
    //               visible h1 so screen readers announce it meaningfully.
    <section
      aria-labelledby="quickstart-heading"
      className="mx-auto w-full max-w-5xl animate-in fade-in duration-300 motion-reduce:animate-none px-4 py-10 sm:px-6 lg:px-8"
    >

      {/* ================================================================
          HERO
      ================================================================ */}

      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 shadow-sm">

        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-64 w-64 translate-x-1/4 -translate-y-1/4 rounded-full bg-blue-100 blur-3xl opacity-60"
        />

        <div className="relative z-10 flex flex-col gap-10 px-6 py-8 sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:justify-between">

          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700 backdrop-blur">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              Deterministic onboarding
            </div>

            {/* FIX #7 (new): id matches the section's aria-labelledby. */}
            {/* FIX #2 (new): isComplete branch gives the hero a correct title
                              once onboarding finishes, instead of showing the
                              "awaiting_first_event" message indefinitely. */}
            <h1
              id="quickstart-heading"
              className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            >
              {isComplete
                ? "You're live and monitoring"
                : isAwaitingEvents
                  ? "Integration detected successfully"
                  : "Welcome to Arcli"}
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
              {isComplete
                ? "Churn scoring, automated recovery workflows, and revenue attribution are fully operational. Your pipeline is processing live events."
                : isAwaitingEvents
                  ? "Your API integration is active. Arcli is now waiting for your first Stripe or product events before enabling automated churn detection and recovery workflows."
                  : "Connect your billing and product events to begin detecting churn risk, recovering revenue, and automating lifecycle intervention flows."}
            </p>

            {/* Live Status Panel */}
            <div className="mt-6 flex flex-wrap items-center gap-3">

              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                {/* FIX #7 (existing): motion-reduce:animate-none on all pulse indicators. */}
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    hasApiKey
                      ? "bg-emerald-500"
                      : "bg-blue-500 animate-pulse motion-reduce:animate-none"
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
                      : "bg-amber-500 animate-pulse motion-reduce:animate-none"
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
                  {/* FIX #1 (existing): onClick uses the stable refreshDashboard callback. */}
                  <button
                    type="button"
                    onClick={refreshDashboard}
                    disabled={isPending}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
                  >
                    {/* FIX #7 (existing): motion-reduce:animate-none on spin. */}
                    <RefreshCw
                      aria-hidden="true"
                      className={`h-4 w-4 ${
                        isPending
                          ? "animate-spin motion-reduce:animate-none text-blue-500"
                          : "text-slate-400"
                      }`}
                    />
                    {isPending ? "Checking…" : "Check Status"}
                  </button>

                  {/* FIX #9 (existing): Brief "Updated" flash after transition
                                        settles, then falls back to timestamp.
                      FIX #2 (existing): Timestamp only shown after server
                                         responds, not at call-time. */}
                  <div className="flex min-h-[1.25rem] items-center gap-2">
                    {showRefreshFlash ? (
                      <span className="flex items-center gap-1.5 animate-in fade-in duration-200 motion-reduce:animate-none text-xs font-medium text-emerald-600">
                        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                        Updated
                      </span>
                    ) : lastCheckedLabel ? (
                      <span className="text-xs text-slate-500">
                        {lastCheckedLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Right visual */}
          <div className="relative flex items-center justify-center">
            <div className="flex h-44 w-44 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-xl">
              <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Radar aria-hidden="true" className="h-14 w-14" />
              </div>
            </div>

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

      {/* ================================================================
          PROGRESS BAR
      ================================================================ */}

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

          {/* FIX #5 (existing): Honest thirds (33/66/100) vs fabricated 25/65. */}
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {progressPercent}%
            </p>
            <p className="text-xs text-slate-500">System readiness</p>
          </div>
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          {/* FIX #7 (existing): motion-reduce:transition-none on the bar animation. */}
          <div
            className={`h-full rounded-full transition-all duration-700 motion-reduce:transition-none ${progressColor}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ================================================================
          STEPS
      ================================================================ */}

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

          <StepCard
            step={2}
            title="Validate incoming event traffic"
            description="Arcli will automatically verify webhook ingestion, normalize event payloads, and activate scoring pipelines."
            status={
              hasReceivedData ? "complete" : hasApiKey ? "active" : "locked"
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

          {/* FIX #4 (existing): Step 3 is "complete" once data flows — not
                                 perpetually "active" with no completion state.
                                 The onboarding flow was visually stuck before. */}
          <StepCard
            step={3}
            title="Activate recovery automation"
            description="Monitor churn-risk accounts, trigger automated recovery sequences, and measure recovered MRR attribution."
            status={hasReceivedData ? "complete" : "locked"}
            icon={<ShieldCheck aria-hidden="true" className="h-5 w-5" />}
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

      {/* ================================================================
          FOOTER
      ================================================================ */}

      <footer className="mt-10 flex flex-col items-center justify-center gap-3 border-t border-slate-200 pt-6 text-center">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {/* FIX #6 (new): Replaced CheckCircle2 (success) with HelpCircle
                            (neutral). A green success checkmark next to a
                            "Need help?" prompt sends the wrong signal. */}
          <HelpCircle aria-hidden="true" className="h-4 w-4 text-slate-500" />
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