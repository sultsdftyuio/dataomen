"use client";

import { type FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Globe2, Loader2, Send } from "lucide-react";

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
  return (
    <main
      className="flex min-h-screen items-center justify-center p-6"
      style={{ backgroundColor: C.offWhite, color: C.text }}
    >
      <Card className="w-full max-w-xl rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
        <CardHeader className="space-y-3">
          <div
            className="flex size-10 items-center justify-center rounded-md"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <Globe2 className="size-5" />
          </div>
          <div>
            <CardTitle className="text-xl" style={{ color: C.navy }}>
              Connect your website
            </CardTitle>
            <CardDescription className="mt-2" style={{ color: C.muted }}>
              Arcli will crawl it and extract the service profile used by the prospect engine.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onWebsiteSubmit}>
            <div className="space-y-2">
              <Label htmlFor="website_url" style={{ color: C.navy }}>
                Website URL
              </Label>
              <Input
                id="website_url"
                name="website_url"
                type="url"
                placeholder="https://company.com"
                value={websiteUrl}
                disabled={isWebsitePending}
                onChange={(event) => onWebsiteUrlChange(event.target.value)}
                style={{ borderColor: C.rule, color: C.navy }}
              />
            </div>
            <Button
              type="submit"
              disabled={isWebsitePending || !websiteUrl.trim()}
              className="w-full"
              style={{ backgroundColor: C.navy, color: C.white }}
            >
              {isWebsitePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {isWebsitePending ? "Starting crawl..." : "Start website crawl"}
            </Button>
            <ResultText result={websiteResult} />
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
