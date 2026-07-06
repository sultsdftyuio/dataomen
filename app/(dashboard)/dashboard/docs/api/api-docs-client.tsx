"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  FileCode2,
  KeyRound,
  LockKeyhole,
  Play,
  Rocket,
  RotateCcw,
  Server,
  ShieldAlert,
  Terminal,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { C } from "@/lib/tokens";

type StepId = "security" | "env" | "backend" | "signal" | "confirm";
type SnippetTab = "node" | "curl" | "python";
type RevenueSignal =
  | "invoice_payment_failed"
  | "cancellation_intent_detected"
  | "subscription_restored";

const API_KEY_PLACEHOLDER = "arcli_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const INGEST_URL = "https://api.arcli.tech/v1/track";
const surfaceBorder = `1px solid ${C.rule}`;
const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.08)";
const softShadow = "0 10px 28px rgba(10, 22, 40, 0.06)";

const steps: Array<{
  id: StepId;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: "security",
    eyebrow: "Step 0",
    title: "Keep the key on your server",
    description:
      "The key is a server-to-server write-only ingestion tool. Treat it like a password.",
  },
  {
    id: "env",
    eyebrow: "Step 1",
    title: "Add your environment variables",
    description: "Paste the key into your backend environment, not into browser code.",
  },
  {
    id: "backend",
    eyebrow: "Step 2",
    title: "Create a tiny backend sender",
    description:
      "Your app calls your server, and your server manually sends billing and churn events to Arcli.",
  },
  {
    id: "signal",
    eyebrow: "Step 3",
    title: "Send the first manual event",
    description:
      "Start with the event that means revenue is at risk right now and include the metadata yourself.",
  },
  {
    id: "confirm",
    eyebrow: "Step 4",
    title: "Confirm Arcli accepted it",
    description: "A 202 response means the event was queued for scoring.",
  },
];

const revenueSignals: Array<{
  value: RevenueSignal;
  label: string;
  plainMeaning: string;
  properties: Record<string, string | number | Record<string, string | number>>;
}> = [
  {
    value: "invoice_payment_failed",
    label: "Payment failed",
    plainMeaning: "A charge failed, so revenue may be lost unless you recover it.",
    properties: {
      amount: 4900,
      currency: "USD",
      user_id: "customer_123",
      metadata: {
        invoice_id: "in_demo_123",
        failure_reason: "card_declined",
      },
    },
  },
  {
    value: "cancellation_intent_detected",
    label: "Cancellation intent detected",
    plainMeaning:
      "A customer signaled they may cancel, so the backend should record it right away.",
    properties: {
      amount: 9900,
      currency: "USD",
      user_id: "customer_123",
      metadata: {
        cancel_reason: "too_expensive",
        requested_at: "2026-07-06T08:00:00.000Z",
      },
    },
  },
  {
    value: "subscription_restored",
    label: "Subscription restored",
    plainMeaning:
      "A customer came back, reactivated, or recovered revenue after a churn risk.",
    properties: {
      amount: 4900,
      currency: "USD",
      user_id: "customer_123",
      metadata: {
        restore_reason: "card_retry",
        restored_at: "2026-07-06T08:00:00.000Z",
      },
    },
  },
];

const completedCopy = "Copied";

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getSignalByValue(value: RevenueSignal) {
  return revenueSignals.find((signal) => signal.value === value) ?? revenueSignals[0];
}

function buildPayload(signal: RevenueSignal) {
  const selectedSignal = getSignalByValue(signal);

  return {
    event_name: selectedSignal.value,
    user_id: "customer_123",
    idempotency_key: "evt_550e8400_e29b_41d4_a716_446655440000",
    timestamp: "2026-07-06T08:00:00.000Z",
    properties: selectedSignal.properties,
  };
}

function buildSnippet(tab: SnippetTab, signal: RevenueSignal) {
  const payload = buildPayload(signal);
  const payloadJson = formatJson(payload);

  if (tab === "curl") {
    return `curl -X POST "$ARCLI_INGEST_URL" \\
  -H "Authorization: Bearer $ARCLI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson}'`;
  }

  if (tab === "python") {
    return `import os
import uuid
from datetime import datetime, timezone

import requests

response = requests.post(
    os.environ["ARCLI_INGEST_URL"],
    headers={
        "Authorization": f"Bearer {os.environ['ARCLI_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "event_name": "${payload.event_name}",
        "user_id": "customer_123",
        "idempotency_key": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "properties": ${formatJson(payload.properties)
          .split("\n")
          .map((line, index) => (index === 0 ? line : `        ${line}`))
          .join("\n")},
    },
    timeout=5,
)

response.raise_for_status()
print(response.json())`;
  }

  return `// app/api/arcli/revenue-signal/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const response = await fetch(process.env.ARCLI_INGEST_URL!, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.ARCLI_API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_name: "${payload.event_name}",
      user_id: "customer_123",
      idempotency_key: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      properties: ${formatJson(payload.properties)
        .split("\n")
        .map((line, index) => (index === 0 ? line : `      ${line}`))
        .join("\n")},
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Arcli did not accept the event" },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}`;
}

const envSnippet = `ARCLI_API_KEY="${API_KEY_PLACEHOLDER}"
ARCLI_INGEST_URL="${INGEST_URL}"`;

const responseExample = `{
  "status": "accepted",
  "idempotency_key": "evt_550e8400_e29b_41d4_a716_446655440000",
  "anomalies": []
}`;

function CodeBlock({
  value,
  copied,
  onCopy,
  label,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
  label: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <div className="flex min-h-10 items-center justify-between border-b border-white/10 bg-white/[0.03] px-4">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <Terminal className="h-3.5 w-3.5 text-slate-400" />
          {label}
        </div>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          onClick={onCopy}
          className="h-7 bg-white/10 px-2.5 text-xs text-white hover:bg-white/20"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-300" />
          ) : (
            <Clipboard className="h-3.5 w-3.5" />
          )}
          {copied ? completedCopy : "Copy"}
        </Button>
      </div>
      <pre className="max-h-[520px] overflow-x-auto p-4 text-[12px] leading-6 text-slate-200 sm:text-[13px]">
        <code>{value}</code>
      </pre>
    </div>
  );
}

function StepShell({
  id,
  activeStep,
  completed,
  children,
}: {
  id: StepId;
  activeStep: StepId;
  completed: boolean;
  children: React.ReactNode;
}) {
  const step = steps.find((item) => item.id === id) ?? steps[0];
  const isActive = activeStep === id;

  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-lg transition-all"
      style={{ border: surfaceBorder, boxShadow: isActive ? softShadow : surfaceShadow }}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <div className="flex min-w-0 gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
              completed
                ? ""
                : ""
            }`}
            style={completed ? { borderColor: C.greenPale, background: C.greenPale, color: C.green } : { borderColor: C.rule, background: C.offWhite, color: C.navySoft }}
          >
            {completed ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase" style={{ color: C.muted }}>
              {step.eyebrow}
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-normal" style={{ color: C.navy }}>
              {step.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6" style={{ color: C.navySoft }}>
              {step.description}
            </p>
          </div>
        </div>
        {completed ? (
          <Badge
            variant="outline"
            className="border-0"
            style={{ background: C.greenPale, color: C.green, boxShadow: `inset 0 0 0 1px ${C.greenPale}` }}
          >
            <Check className="h-3 w-3" />
            Done
          </Badge>
        ) : null}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

export function ApiDocsClient() {
  const [activeStep, setActiveStep] = useState<StepId>("security");
  const [activeTab, setActiveTab] = useState<SnippetTab>("node");
  const [selectedSignal, setSelectedSignal] =
    useState<RevenueSignal>("invoice_payment_failed");
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(
    () => new Set(["security"]),
  );
  const [copied, setCopied] = useState<string | null>(null);

  const selectedSignalDetails = getSignalByValue(selectedSignal);
  const requestSnippet = useMemo(
    () => buildSnippet(activeTab, selectedSignal),
    [activeTab, selectedSignal],
  );
  const payloadSnippet = useMemo(
    () => formatJson(buildPayload(selectedSignal)),
    [selectedSignal],
  );
  const progressValue = Math.round((completedSteps.size / steps.length) * 100);

  const completeStep = (stepId: StepId) => {
    setCompletedSteps((previous) => {
      const next = new Set(previous);
      next.add(stepId);
      return next;
    });
  };

  const copy = async (value: string, copyId: string, stepId?: StepId) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(copyId);
      if (stepId) {
        completeStep(stepId);
      }
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const markStepAndMove = (stepId: StepId, nextStepId?: StepId) => {
    completeStep(stepId);
    if (nextStepId) {
      setActiveStep(nextStepId);
      document.getElementById(nextStepId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
      <div
        className="overflow-hidden rounded-lg bg-white"
        style={{ border: surfaceBorder, boxShadow: surfaceShadow }}
      >
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-6 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-0 text-blue-700"
                style={{ background: C.blueTint, color: C.blue, boxShadow: `inset 0 0 0 1px ${C.bluePale}` }}
              >
                Developer Quickstart
              </Badge>
              <Badge
                variant="outline"
                className="border-0 text-blue-700"
                style={{ background: C.bluePale, color: C.navySoft, boxShadow: `inset 0 0 0 1px ${C.rule}` }}
              >
                Manual billing and churn ingestion
              </Badge>
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-normal sm:text-4xl" style={{ color: C.navy }}>
              Manually integrate your billing and churn events in under 5 minutes
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 sm:text-base" style={{ color: C.navySoft }}>
              This walkthrough helps you wire your backend to Arcli using an API key.
              No external billing sync is required: keep the key on your server, send
              one meaningful event, and confirm Arcli accepted it.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Auth method", value: "Bearer token", icon: KeyRound },
                { label: "Call from", value: "Backend only", icon: Server },
                { label: "Result", value: "202 accepted", icon: CheckCircle2 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="rounded-lg p-4"
                    style={{ background: C.offWhite, border: surfaceBorder, boxShadow: "0 1px 2px rgba(10,22,40,0.04)" }}
                  >
                    <div
                      className="mb-3 flex h-8 w-8 items-center justify-center rounded-md"
                      style={{ background: C.blueTint, color: C.blue, border: `1px solid ${C.bluePale}` }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="text-xs font-medium" style={{ color: C.muted }}>{item.label}</div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>{item.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="border-t p-6 text-white lg:border-l lg:border-t-0" style={{ background: C.navy, borderColor: C.ruleDark }}>
            <div className="flex items-start gap-3">
              <div className="rounded-md border p-2" style={{ borderColor: C.bluePale, background: "rgba(255,255,255,0.08)" }}>
                <Rocket className="h-4 w-4" style={{ color: C.blueLight }} />
              </div>
              <div>
                <div className="text-sm font-semibold">Manual integration progress</div>
                <p className="mt-1 text-xs leading-5" style={{ color: "rgba(246,250,254,0.78)" }}>
                  Copying snippets marks the setup steps complete. You can also use the
                  buttons below to keep your place.
                </p>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "rgba(246,250,254,0.78)" }}>
                <span>{completedSteps.size} of {steps.length} steps</span>
                <span>{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-2 bg-white/10 [&>div]:bg-blue-400" />
            </div>
            <div className="mt-5 space-y-2">
              {steps.map((step) => {
                const done = completedSteps.has(step.id);
                const active = activeStep === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setActiveStep(step.id);
                      document
                        .getElementById(step.id)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-xs transition"
                    style={active ? { borderColor: C.bluePale, background: "rgba(255,255,255,0.14)", color: "#FFFFFF" } : { borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "rgba(240,247,255,0.82)" }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                      style={done ? { borderColor: C.bluePale, background: C.bluePale, color: C.navy } : { borderColor: "rgba(255,255,255,0.20)", color: "rgba(240,247,255,0.55)" }}
                    >
                      {done ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{step.eyebrow}</span>
                      <span className="block truncate" style={{ color: active ? "#FFFFFF" : C.bluePale }}>{step.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:sticky lg:top-24 lg:block">
          <Card className="rounded-lg py-0">
            <CardHeader className="border-b p-5">
              <CardTitle className="text-sm" style={{ color: C.navy }}>Setup map</CardTitle>
              <CardDescription className="text-xs">
                Follow the steps in order for the fastest path.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              {steps.map((step) => {
                const done = completedSteps.has(step.id);
                const active = activeStep === step.id;

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setActiveStep(step.id);
                      document
                        .getElementById(step.id)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="flex w-full items-start gap-3 rounded-md p-3 text-left transition"
                    style={active ? { background: C.blueTint, boxShadow: `inset 0 0 0 1px ${C.bluePale}`, color: C.navy } : { color: C.navySoft }}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        done
                          ? "text-emerald-700"
                          : ""
                      }`}
                      style={done ? { borderColor: C.greenPale, background: C.greenPale, color: C.green } : undefined}
                    >
                      {done ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold uppercase" style={{ color: C.muted }}>
                        {step.eyebrow}
                      </span>
                      <span className="mt-0.5 block text-sm font-medium leading-5" style={{ color: active ? C.navy : C.navySoft }}>
                        {step.title}
                      </span>
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-6">
          <StepShell
            id="security"
            activeStep={activeStep}
            completed={completedSteps.has("security")}
          >
            <Alert className="rounded-lg text-red-950" style={{ background: C.redPale, borderColor: C.redPale }}>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Never expose your Arcli API key in client-side browser code</AlertTitle>
              <AlertDescription className="leading-6">
                The API key is ingestion only. Use it from backend code, workers, or API
                routes to write events into Arcli. Do not place it in React, Vue, mobile
                apps, analytics tags, or any browser runtime.
              </AlertDescription>
            </Alert>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg p-4" style={{ background: C.blueTint, border: surfaceBorder }}>
                <LockKeyhole className="mb-3 h-5 w-5" style={{ color: C.blue }} />
                <h3 className="text-sm font-semibold" style={{ color: C.navy }}>What the key does</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  It authenticates server-to-server writes into your Arcli workspace.
                  Anyone with the key can ingest events for that workspace.
                </p>
              </div>
              <div className="rounded-lg p-4" style={{ background: C.offWhite, border: surfaceBorder }}>
                <Server className="mb-3 h-5 w-5" style={{ color: C.navySoft }} />
                <h3 className="text-sm font-semibold" style={{ color: C.navy }}>Where it belongs</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  Put it in server environment variables, API routes, workers, cron jobs,
                  or backend services.
                </p>
              </div>
              <div className="rounded-lg p-4" style={{ background: C.amberPale, border: `1px solid ${C.ruleDark}` }}>
                <AlertTriangle className="mb-3 h-5 w-5" style={{ color: C.amber }} />
                <h3 className="text-sm font-semibold" style={{ color: C.navy }}>What to avoid</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  Do not paste it into React components, mobile apps, analytics tags,
                  browser local storage, or public GitHub files.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm" style={{ color: C.navySoft }}>
                Ingestion header:
                <code className="ml-2 rounded px-2 py-1 text-xs text-slate-950" style={{ background: C.bluePale }}>
                  Authorization: Bearer &lt;ARCLI_API_KEY&gt;
                </code>
              </div>
              <Button
                type="button"
                onClick={() => markStepAndMove("security", "env")}
                className="bg-slate-950 text-white hover:bg-slate-800"
              >
                I understand
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </StepShell>

          <StepShell id="env" activeStep={activeStep} completed={completedSteps.has("env")}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <p className="mb-4 text-sm leading-6" style={{ color: C.navySoft }}>
                  In your project, create or open <code className="rounded px-1.5 py-0.5 text-xs text-slate-950" style={{ background: C.bluePale }}>.env.local</code>.
                  Paste this in, then replace the x&apos;s with the API key you generated in
                  Arcli settings. Your backend will read these values and send the
                  events manually.
                </p>
                <CodeBlock
                  label=".env.local"
                  value={envSnippet}
                  copied={copied === "env"}
                  onCopy={() => copy(envSnippet, "env", "env")}
                />
              </div>
              <div className="rounded-lg p-4" style={{ background: C.blueTint, border: surfaceBorder }}>
                <KeyRound className="mb-3 h-5 w-5" style={{ color: C.blue }} />
                <h3 className="text-sm font-semibold" style={{ color: C.navy }}>Plain-language check</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  The first line is your secret. The second line is the ingestion address
                  your server will send events to.
                </p>
                <Separator className="my-4" style={{ backgroundColor: C.rule }} />
                <p className="text-xs leading-5" style={{ color: C.muted }}>
                  Restart your local dev server after changing environment variables.
                </p>
              </div>
            </div>
          </StepShell>

          <StepShell
            id="backend"
            activeStep={activeStep}
            completed={completedSteps.has("backend")}
          >
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SnippetTab)}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm leading-6" style={{ color: C.navySoft }}>
                    Choose the backend you use. The important part is the same in every
                    language: your server adds the bearer token header and sends the
                    required metadata manually.
                  </p>
                </div>
                <TabsList className="grid w-full grid-cols-3 sm:w-auto">
                  <TabsTrigger value="node">
                    <FileCode2 className="h-4 w-4" />
                    Next.js
                  </TabsTrigger>
                  <TabsTrigger value="curl">
                    <Terminal className="h-4 w-4" />
                    cURL
                  </TabsTrigger>
                  <TabsTrigger value="python">
                    <Code2 className="h-4 w-4" />
                    Python
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="mt-4">
                <TabsContent value="node" className="mt-0">
                  <CodeBlock
                    label="Backend API route"
                    value={requestSnippet}
                    copied={copied === "backend-node"}
                    onCopy={() => copy(requestSnippet, "backend-node", "backend")}
                  />
                </TabsContent>
                <TabsContent value="curl" className="mt-0">
                  <CodeBlock
                    label="Terminal request"
                    value={requestSnippet}
                    copied={copied === "backend-curl"}
                    onCopy={() => copy(requestSnippet, "backend-curl", "backend")}
                  />
                </TabsContent>
                <TabsContent value="python" className="mt-0">
                  <CodeBlock
                    label="Python backend request"
                    value={requestSnippet}
                    copied={copied === "backend-python"}
                    onCopy={() => copy(requestSnippet, "backend-python", "backend")}
                  />
                </TabsContent>
              </div>
            </Tabs>

            <Alert className="mt-5 rounded-lg text-amber-950" style={{ background: C.amberPale, borderColor: C.ruleDark }}>
              <RotateCcw className="h-4 w-4" />
              <AlertTitle>Retry-safe by design</AlertTitle>
              <AlertDescription className="leading-6">
                Use a stable <code className="rounded bg-amber-100 px-1">idempotency_key</code> for
                the same customer action. If a timeout happens, retry with the same key so
                Arcli does not count the same event twice.
              </AlertDescription>
            </Alert>
          </StepShell>

          <StepShell
            id="signal"
            activeStep={activeStep}
            completed={completedSteps.has("signal")}
          >
            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: C.navy }}>Pick a first event</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  Start with one event that is directly tied to churn risk or recovered
                  revenue. Avoid generic product analytics like page views or button clicks.
                </p>
                <div className="mt-4 space-y-2">
                  {revenueSignals.map((signal) => {
                    const active = selectedSignal === signal.value;

                    return (
                      <button
                        key={signal.value}
                        type="button"
                        onClick={() => {
                          setSelectedSignal(signal.value);
                          completeStep("signal");
                        }}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          active
                            ? "text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        style={active ? { background: C.navy, borderColor: C.navySoft, boxShadow: softShadow } : { borderColor: C.rule, boxShadow: surfaceShadow }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold">{signal.label}</span>
                          {active ? <Check className="h-4 w-4" style={{ color: C.blueLight }} /> : null}
                        </div>
                        <code
                          className={`mt-2 block text-xs ${
                            active ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {signal.value}
                        </code>
                        <p
                          className={`mt-2 text-xs leading-5 ${
                            active ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {signal.plainMeaning}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg p-4" style={{ background: C.offWhite, border: surfaceBorder }}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <Play className="h-4 w-4" style={{ color: C.blue }} />
                    First payload
                  </div>
                  <p className="text-sm leading-6" style={{ color: C.navySoft }}>
                    This is the actual JSON shape Arcli expects for{" "}
                    <code className="rounded px-1.5 py-0.5 text-xs text-slate-950" style={{ background: C.bluePale }}>
                      {selectedSignalDetails.value}
                    </code>
                    . Include the required metadata yourself from your billing system.
                  </p>
                </div>
                <CodeBlock
                  label="Event payload"
                  value={payloadSnippet}
                  copied={copied === "payload"}
                  onCopy={() => copy(payloadSnippet, "payload", "signal")}
                />
              </div>
            </div>
          </StepShell>

          <StepShell
            id="confirm"
            activeStep={activeStep}
            completed={completedSteps.has("confirm")}
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <p className="mb-4 text-sm leading-6" style={{ color: C.navySoft }}>
                  When Arcli accepts the event, your backend receives a response like this.
                  Accepted means queued for scoring, not that a campaign has already run.
                </p>
                <CodeBlock
                  label="202 response"
                  value={responseExample}
                  copied={copied === "response"}
                  onCopy={() => copy(responseExample, "response", "confirm")}
                />
              </div>
              <div className="rounded-lg p-4" style={{ background: C.greenPale, border: surfaceBorder }}>
                <CheckCircle2 className="mb-3 h-5 w-5" style={{ color: C.green }} />
                <h3 className="text-sm font-semibold" style={{ color: C.navy }}>You are live when...</h3>
                <div className="mt-3 space-y-3 text-sm leading-6" style={{ color: C.navy }}>
                  {[
                    "The request is sent from your backend.",
                    "The Authorization header starts with Bearer.",
                    "The event name is one of the manual billing or churn signals.",
                    "The response status is 202.",
                  ].map((item) => (
                    <div key={item} className="flex gap-2">
                      <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: C.green }} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <Alert className="mt-5 rounded-lg text-slate-950" style={{ background: C.bluePale, borderColor: C.rule }}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Dashboard access stays in the browser</AlertTitle>
                  <AlertDescription className="leading-6">
                    The API key is for ingestion only. To inspect analytics, see
                    churned users, or review ROI, sign in to the Arcli Dashboard in
                    your browser with an authenticated session. Those reads are not
                    available through the API key. If you need any help, email
                    support@arcli.tech.
                  </AlertDescription>
                </Alert>
                <Button
                  type="button"
                  onClick={() => markStepAndMove("confirm")}
                  className="mt-5 w-full bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  Mark quickstart complete
                </Button>
              </div>
            </div>
          </StepShell>
        </div>
      </div>
    </div>
  );
}
