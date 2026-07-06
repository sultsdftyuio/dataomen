"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  Server,
  ShieldAlert,
  Terminal,
  XCircle,
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SnippetTab = "curl" | "node" | "python";

const endpointRows = [
  { label: "Method", value: "POST" },
  { label: "URL", value: "https://api.arcli.tech/api/v1/track" },
  { label: "Authorization", value: "Bearer arcli_live_<YOUR_API_KEY>" },
  { label: "Content-Type", value: "application/json" },
];

const goodSignals = [
  "payment_failed",
  "subscription_cancelled",
  "trial_expired",
  "downgrade_requested",
  "cancellation_intent_detected",
];

const snippets: Record<SnippetTab, string> = {
  curl: `curl -X POST https://api.arcli.tech/api/v1/track \\
  -H "Authorization: Bearer arcli_live_<YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_name": "payment_failed",
    "user_id": "usr_98765",
    "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-07-06T08:00:00.000Z",
    "properties": {
      "plan_tier": "pro_monthly",
      "amount": 4900,
      "currency": "USD",
      "invoice_id": "in_123"
    }
  }'`,
  node: `// Node.js 18+ native fetch. Run this from your backend only.
const response = await fetch("https://api.arcli.tech/api/v1/track", {
  method: "POST",
  headers: {
    "Authorization": "Bearer arcli_live_<YOUR_API_KEY>",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    event_name: "payment_failed",
    user_id: "usr_98765",
    idempotency_key: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    properties: {
      plan_tier: "pro_monthly",
      amount: 4900,
      currency: "USD",
      invoice_id: "in_123",
    },
  }),
});

if (!response.ok) {
  throw new Error(\`Arcli ingest failed: \${response.status}\`);
}

const result = await response.json();`,
  python: `import uuid
from datetime import datetime, timezone

import requests

response = requests.post(
    "https://api.arcli.tech/api/v1/track",
    headers={
        "Authorization": "Bearer arcli_live_<YOUR_API_KEY>",
        "Content-Type": "application/json",
    },
    json={
        "event_name": "payment_failed",
        "user_id": "usr_98765",
        "idempotency_key": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "properties": {
            "plan_tier": "pro_monthly",
            "amount": 4900,
            "currency": "USD",
            "invoice_id": "in_123",
        },
    },
    timeout=5,
)

response.raise_for_status()
result = response.json()`,
};

const responseExample = `{
  "status": "accepted",
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
  "anomalies": []
}`;

function CodeBlock({
  value,
  copied,
  onCopy,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onCopy}
        className="absolute right-3 top-3 h-8 bg-white/10 px-3 text-xs text-white hover:bg-white/20"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-300" />
        ) : (
          <Clipboard className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
      <pre className="max-h-[460px] overflow-x-auto p-5 pr-28 text-[13px] leading-6 text-slate-200">
        <code>{value}</code>
      </pre>
    </div>
  );
}

export function ApiDocsClient() {
  const [activeTab, setActiveTab] = useState<SnippetTab>("curl");
  const [copiedTab, setCopiedTab] = useState<SnippetTab | "response" | null>(null);

  const copy = async (value: string, tab: SnippetTab | "response") => {
    await navigator.clipboard.writeText(value);
    setCopiedTab(tab);
    window.setTimeout(() => setCopiedTab(null), 1800);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              Developer Docs
            </Badge>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Server Ingestion
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            Arcli API Key Ingestion
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Authenticate backend services and send high-intent churn or recovery
            attribution events to the Arcli tracking endpoint.
          </p>
        </div>
      </div>

      <Alert className="rounded-lg border-red-200 bg-red-50 text-red-950">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Server-Side Execution Only</AlertTitle>
        <AlertDescription>
          NEVER embed API keys in client-side applications, including React,
          Vue, iOS, or Android. Arcli API keys have write access to the tenant
          workspace and must only be called from secure backend infrastructure
          such as Node.js, Python, Ruby, Go, or cURL running in a trusted server
          environment.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-lg py-0">
          <CardHeader className="border-b px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <Server className="h-4 w-4 text-slate-700" />
              </div>
              <div>
                <CardTitle className="text-base">Endpoint Specification</CardTitle>
                <CardDescription>
                  Use bearer authentication and JSON payloads for all requests.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40 px-6 text-xs uppercase tracking-wide text-slate-500">
                    Field
                  </TableHead>
                  <TableHead className="px-6 text-xs uppercase tracking-wide text-slate-500">
                    Value
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpointRows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="px-6 font-medium text-slate-700">
                      {row.label}
                    </TableCell>
                    <TableCell className="px-6">
                      <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs text-slate-900">
                        {row.value}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-lg py-0">
          <CardHeader className="border-b px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                <KeyRound className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <CardTitle className="text-base">Header Contract</CardTitle>
                <CardDescription>Reject requests that omit the bearer prefix.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Authorization
              </div>
              <code className="block break-all rounded-md border bg-slate-50 p-3 text-xs text-slate-900">
                Authorization: Bearer arcli_live_&lt;YOUR_API_KEY&gt;
              </code>
            </div>
            <Separator />
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              Rotate keys from workspace settings if a secret is exposed.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg py-0">
        <CardHeader className="border-b px-6 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
                <Code2 className="h-4 w-4 text-blue-700" />
              </div>
              <div>
                <CardTitle className="text-base">Copyable Request Examples</CardTitle>
                <CardDescription>
                  These examples mirror the settings integration guide and are
                  safe for server-side execution.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="border-slate-200 text-slate-600">
              POST /api/v1/track
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SnippetTab)}>
            <TabsList className="mb-3 rounded-lg">
              <TabsTrigger value="curl">
                <Terminal className="h-4 w-4" />
                cURL
              </TabsTrigger>
              <TabsTrigger value="node">
                <Server className="h-4 w-4" />
                Node.js 18+
              </TabsTrigger>
              <TabsTrigger value="python">
                <Code2 className="h-4 w-4" />
                Python
              </TabsTrigger>
            </TabsList>
            <TabsContent value="curl">
              <CodeBlock
                value={snippets.curl}
                copied={copiedTab === "curl"}
                onCopy={() => copy(snippets.curl, "curl")}
              />
            </TabsContent>
            <TabsContent value="node">
              <CodeBlock
                value={snippets.node}
                copied={copiedTab === "node"}
                onCopy={() => copy(snippets.node, "node")}
              />
            </TabsContent>
            <TabsContent value="python">
              <CodeBlock
                value={snippets.python}
                copied={copiedTab === "python"}
                onCopy={() => copy(snippets.python, "python")}
              />
            </TabsContent>
          </Tabs>
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              202 Accepted
            </div>
            <CodeBlock
              value={responseExample}
              copied={copiedTab === "response"}
              onCopy={() => copy(responseExample, "response")}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-lg py-0">
          <CardHeader className="border-b px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              </div>
              <div>
                <CardTitle className="text-base">Signal-Only Directive (Rules 8 &amp; 21)</CardTitle>
                <CardDescription>
                  Keep ingestion tied to churn risk and recovery attribution.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <blockquote className="rounded-lg border-l-4 border-slate-900 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-900">
              If an event does not directly contribute to a Churn Signal or Recovery Attribution, do not track it.
            </blockquote>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-900">
                  <XCircle className="h-4 w-4" />
                  Anti-Pattern
                </div>
                <div className="space-y-2">
                  {["button_clicked", "page_view", "modal_opened"].map((event) => (
                    <code
                      key={event}
                      className="block rounded border border-red-100 bg-white px-2 py-1.5 text-xs text-red-900"
                    >
                      {event}
                    </code>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-950">
                  <CheckCircle2 className="h-4 w-4" />
                  Best Practice
                </div>
                <div className="space-y-2">
                  {goodSignals.map((event) => (
                    <code
                      key={event}
                      className="block rounded border border-emerald-100 bg-white px-2 py-1.5 text-xs text-emerald-950"
                    >
                      {event}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg py-0">
          <CardHeader className="border-b px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-violet-200 bg-violet-50 p-2">
                <RotateCcw className="h-4 w-4 text-violet-700" />
              </div>
              <div>
                <CardTitle className="text-base">Idempotency & Retry Safety</CardTitle>
                <CardDescription>
                  Retries must never duplicate risk scores or campaigns.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-6 text-sm leading-6 text-slate-600">
            <p>
              Always pass an <code className="rounded bg-slate-100 px-1">idempotency_key</code>,
              preferably a UUID generated for the source event. Reuse the same
              key when retrying after a timeout, 500, or 503.
            </p>
            <p>
              Arcli uses the key to deduplicate ingestion so network retries do
              not create duplicate churn risk scores or trigger duplicate
              recovery campaigns.
            </p>
            <Alert className="rounded-lg border-amber-200 bg-amber-50 text-amber-950">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Retry Rule</AlertTitle>
              <AlertDescription>
                New customer action, new idempotency key. Same customer action,
                same idempotency key across retries.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
