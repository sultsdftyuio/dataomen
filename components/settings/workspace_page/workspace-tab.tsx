"use client";

import Link from "next/link";
import { Globe2, Radar, Target } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import BillingTestSwitcher from "./billing-test-switcher";
import WorkspaceBillingCard, {
  type WorkspaceBillingCardProps,
} from "./workspace-billing-card";
import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";

type WorkspaceInitialData = {
  websiteUrl?: string;
};

interface WorkspaceTabProps {
  initialData?: WorkspaceInitialData;
  initialProfile?: ServiceProfileView | null;
  serviceProfile?: ServiceProfileView | null;
  planData?: WorkspaceBillingCardProps["planData"];
  billingTestControlsEnabled?: boolean;
  [legacyProp: string]: unknown;
}

function websiteDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

export default function WorkspaceTab({
  initialData,
  initialProfile = null,
  serviceProfile = null,
  planData,
  billingTestControlsEnabled = false,
}: WorkspaceTabProps) {
  const profile = initialProfile ?? serviceProfile;
  const websiteUrl = profile?.websiteUrl ?? initialData?.websiteUrl ?? "";
  const isBriefActive = profile?.embeddingStatus === "completed";

  return (
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-4 pb-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="bg-white shadow-sm" style={{ borderColor: C.rule }}>
        <CardHeader className="border-b p-4" style={{ borderColor: C.rule }}>
          <CardTitle className="text-base font-semibold" style={{ color: C.navy }}>
            Discovery setup
          </CardTitle>
          <CardDescription className="text-xs leading-5">
            Keep your website and matching brief current. These two inputs shape every prospect scan.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {profile ? (
            <div className="divide-y rounded-lg border" style={{ borderColor: C.rule }}>
              <div className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: C.bluePale, color: C.blue }}
                  >
                    <Globe2 className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
                      Discovery source
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold" style={{ color: C.navy }} title={websiteUrl}>
                      {websiteUrl ? websiteDomain(websiteUrl) : "Website needed"}
                    </p>
                    <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                      Change the website from the matching brief when your source context changes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: C.bluePale, color: C.blue }}
                  >
                    <Target className="size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
                      Matching brief
                    </p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>
                      {isBriefActive ? "Active and shaping scans" : "Updating in the background"}
                    </p>
                    <p className="mt-1 max-w-xl text-xs leading-5" style={{ color: C.muted }}>
                      Define the buyers, problems, and language that make a conversation worth reviewing.
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0" style={{ borderColor: C.blueLight, color: C.blue }}>
                  <Link href="/dashboard/brief">Edit matching brief</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <div className="flex items-start gap-3">
                <Radar className="mt-0.5 size-4" style={{ color: C.blue }} aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: C.navy }}>Finish discovery setup</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                    Connect a website to create the matching brief behind your prospect scans.
                  </p>
                </div>
              </div>
              <Button asChild size="sm" style={{ backgroundColor: C.blue, color: C.white }}>
                <Link href="/onboarding/workspace">Set up workspace</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-3 lg:self-start">
        <WorkspaceBillingCard planData={planData} />
        {billingTestControlsEnabled ? (
          <BillingTestSwitcher currentStatus={planData?.planStatus} />
        ) : null}
      </aside>
    </div>
  );
}
