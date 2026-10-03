"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAsyncProvisioning } from "@/hooks/useAsyncProvisioning";
import { C } from "@/lib/tokens";
import type { ProspectActionResult } from "@/app/(dashboard)/dashboard/prospect-types";

export function ResultText({ result }: { result: ProspectActionResult | null }) {
  if (!result) return null;
  return <p role="status" className="rounded-md border px-3 py-2 text-xs font-medium" style={{ borderColor: result.ok ? C.green : C.red, backgroundColor: result.ok ? C.greenPale : C.redPale, color: result.ok ? C.green : C.red }}>{result.message}</p>;
}

export function WorkspacePendingState() {
  const router = useRouter();
  const { status, message } = useAsyncProvisioning();
  const isFailed = status === "FAILED";

  useEffect(() => {
    if (status === "READY") router.refresh();
  }, [router, status]);

  return <div className="flex min-h-screen items-center justify-center bg-[#F8FBFE] p-6"><div className="flex w-full max-w-md flex-col items-center text-center">
    {isFailed ? <>
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-[#FEE2E2]"><AlertCircle className="size-6" style={{ color: C.red }} /></span>
      <h1 className="pfd text-2xl" style={{ color: C.navy }}>Setup took too long.</h1>
      <p className="mt-2 text-sm leading-6" style={{ color: C.muted }}>We could not confirm the workspace mapping in time. Your account data is safe.</p>
      <Button type="button" className="mt-6" onClick={() => window.location.reload()} style={{ backgroundColor: C.blue, color: C.white }}>Retry connection</Button>
    </> : <>
      <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-[#EBF4FD] text-[#1B6EBF]"><Loader2 className="size-5 animate-spin" /></span>
      <h1 className="pfd text-2xl" style={{ color: C.navy }}>Securing your workspace.</h1>
      <p className="mt-3 text-sm" style={{ color: C.muted }}>{message || "Preparing your environment"}</p>
    </>}
  </div></div>;
}
