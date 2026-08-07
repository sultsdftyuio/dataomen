"use client";

import { type FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Globe2,
  Loader2,
  Send,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncProvisioning } from "@/hooks/useAsyncProvisioning";
import { C } from "@/lib/tokens";
import type { ProspectActionResult } from "@/app/(dashboard)/dashboard/prospect-types";

export function ResultText({ result }: { result: ProspectActionResult | null }) {
  if (!result) return null;

  return (
    <div
      className="rounded-md border px-3 py-2 text-xs font-medium"
      style={{
        borderColor: result.ok ? C.green : C.red,
        backgroundColor: result.ok ? C.greenPale : C.redPale,
        color: result.ok ? C.green : C.red,
      }}
    >
      {result.message}
    </div>
  );
}

export function WorkspacePendingState() {
  const router = useRouter();
  const { status, message } = useAsyncProvisioning();
  const isFailed = status === "FAILED";

  useEffect(() => {
    if (status === "READY") {
      router.refresh();
    }
  }, [router, status]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        {isFailed ? (
          <>
            <div
              className="mb-4 flex size-12 items-center justify-center rounded-full"
              style={{ backgroundColor: C.redPale }}
            >
              <AlertCircle className="size-6" style={{ color: C.red }} />
            </div>
            <h1 className="text-lg font-semibold" style={{ color: C.navy }}>
              Setup took too long
            </h1>
            <p className="mt-2 text-sm leading-6" style={{ color: C.muted }}>
              We could not confirm the workspace mapping in time. Your account data is safe.
            </p>
            <Button
              type="button"
              className="mt-6"
              onClick={() => window.location.reload()}
              style={{ backgroundColor: C.navy, color: C.white }}
            >
              Retry connection
            </Button>
          </>
        ) : (
          <>
            <div className="mb-7 flex items-center gap-2">
              <div
                className="size-3 animate-[bounce_1s_infinite_-0.3s] rounded-full"
                style={{ backgroundColor: C.blue }}
              />
              <div
                className="size-3 animate-[bounce_1s_infinite_-0.15s] rounded-full"
                style={{ backgroundColor: C.blue }}
              />
              <div
                className="size-3 animate-[bounce_1s_infinite] rounded-full"
                style={{ backgroundColor: C.blue }}
              />
            </div>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: C.navy }}>
              Securing your workspace
            </h1>
            <p className="mt-3 text-sm font-medium" style={{ color: C.muted }}>
              {message || "Preparing your environment"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

type WebsiteConnectStateProps = {
  websiteUrl: string;
  websiteResult: ProspectActionResult | null;
  isWebsitePending: boolean;
  onWebsiteUrlChange: (value: string) => void;
  onWebsiteSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function WebsiteConnectState({
  websiteUrl,
  websiteResult,
  isWebsitePending,
  onWebsiteUrlChange,
  onWebsiteSubmit,
}: WebsiteConnectStateProps) {
  const websitePreview = (() => {
    const value = websiteUrl.trim();
    if (!value) return null;

    try {
      const parsed = new URL(
        /^https?:\/\//i.test(value) ? value : `https://${value}`,
      );
      return parsed.hostname.replace(/^www\./i, "");
    } catch {
      return null;
    }
  })();

  return (
    <main
      className="flex min-h-screen items-center justify-center overflow-hidden p-6"
      style={{ backgroundColor: C.offWhite, color: C.text }}
    >
      <div className="relative grid w-full max-w-5xl gap-8 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
        <section className="max-w-xl">
          <div
            className="mb-6 inline-flex size-12 items-center justify-center rounded-xl border shadow-sm"
            style={{ borderColor: C.blueLight, backgroundColor: C.bluePale, color: C.blue }}
          >
            <Globe2 className="size-6" aria-hidden="true" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blue }}>
            Build your discovery source
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.02] tracking-tight sm:text-5xl" style={{ color: C.navy }}>
            Your website starts every good lead.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7" style={{ color: C.muted }}>
            We use the pages that explain your business to build the buyer
            brief behind every search, match, and recommendation.
          </p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: FileSearch, label: "Read key pages", detail: "Home, product, pricing" },
              { icon: Target, label: "Build your brief", detail: "Buyers, pains, outcomes" },
              { icon: Send, label: "Scan conversations", detail: "Find relevant signals" },
            ].map(({ icon: Icon, label, detail }, index) => (
              <li
                key={label}
                className="rounded-xl border bg-white p-3 shadow-sm"
                style={{ borderColor: C.rule }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ backgroundColor: C.bluePale, color: C.blue }}
                  >
                    {index + 1}
                  </span>
                  <Icon className="size-4" style={{ color: C.navySoft }} aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold" style={{ color: C.navy }}>{label}</p>
                <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <Card className="relative overflow-hidden rounded-2xl bg-white shadow-lg" style={{ borderColor: C.rule }}>
          <div className="h-1.5" style={{ backgroundColor: C.blue }} />
          <CardHeader className="space-y-3 pb-3 sm:p-7 sm:pb-3">
            <div className="flex items-center justify-between gap-3">
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ backgroundColor: C.bluePale, color: C.blue }}
              >
                Step 1 of 3
              </span>
              <span className="text-xs font-medium" style={{ color: C.muted }}>Takes about a minute</span>
            </div>
            <div>
              <CardTitle className="text-2xl tracking-tight" style={{ color: C.navy }}>
                What website should we learn from?
              </CardTitle>
              <CardDescription className="mt-2 text-sm leading-6" style={{ color: C.muted }}>
                Paste your main company website. A domain is enough—we add the rest.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="sm:px-7 sm:pb-7">
            <form className="space-y-4" onSubmit={onWebsiteSubmit}>
              <div className="space-y-2">
                <Label htmlFor="website_url" className="text-sm font-semibold" style={{ color: C.navy }}>
                  Company website
                </Label>
                <div className="relative">
                  <Globe2
                    className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2"
                    style={{ color: C.muted }}
                    aria-hidden="true"
                  />
                  <Input
                    id="website_url"
                    name="website_url"
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    spellCheck={false}
                    placeholder="yourcompany.com"
                    value={websiteUrl}
                    disabled={isWebsitePending}
                    onChange={(event) => onWebsiteUrlChange(event.target.value)}
                    className="h-14 rounded-xl pl-12 pr-4 text-base shadow-sm"
                    style={{ borderColor: websitePreview ? C.blueLight : C.rule, color: C.navy }}
                  />
                </div>
                {websitePreview ? (
                  <div
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
                    style={{ borderColor: C.green, backgroundColor: C.greenPale, color: C.green }}
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Ready to analyze <span className="font-semibold">{websitePreview}</span>
                  </div>
                ) : (
                  <p className="text-xs leading-5" style={{ color: C.muted }}>
                    Use the site with your clearest product, audience, and pricing information.
                  </p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isWebsitePending || !websiteUrl.trim()}
                className="h-12 w-full rounded-xl text-sm font-semibold"
                style={{ backgroundColor: C.navy, color: C.white }}
              >
                {isWebsitePending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                {isWebsitePending
                  ? "Starting your discovery..."
                  : websitePreview
                    ? `Analyze ${websitePreview}`
                    : "Analyze website"}
              </Button>
              <p className="text-center text-xs leading-5" style={{ color: C.faint }}>
                This creates a separate discovery profile for this website. It will not mix with another site.
              </p>
              <ResultText result={websiteResult} />
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
