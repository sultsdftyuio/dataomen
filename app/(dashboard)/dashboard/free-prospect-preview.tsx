"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { FreeScanResult } from "@/components/prospects/free-scan-result";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { PRO_PRICE_NOTE } from "@/lib/entitlements";
import type { FreeScanPreview } from "./free-scan-preview";
import type { ServiceProfileView } from "./prospect-types";

type FreeProspectPreviewProps = {
  websiteUrl: string;
  serviceProfile: ServiceProfileView;
  /** Null when the first-scan preview is not deployed or not available. */
  freeScanPreview: FreeScanPreview | null;
};

function domainForDisplay(websiteUrl: string) {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./i, "");
  } catch {
    return websiteUrl;
  }
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 line-clamp-4 text-sm leading-6 text-foreground">
        {value || <span className="text-subtle">Not set yet. Add it to your brief.</span>}
      </dd>
    </div>
  );
}

export default function FreeProspectPreview({
  websiteUrl,
  serviceProfile,
  freeScanPreview,
}: FreeProspectPreviewProps) {
  const fields = serviceProfile.fields;
  const domain = domainForDisplay(websiteUrl);
  // Once the free first scan has started, real results replace the
  // "discovery is locked" explanation.
  const hasFirstScan = Boolean(freeScanPreview?.runStatus || freeScanPreview?.topLead);

  return (
    // Children keep their height: in a scrolling flex column they would
    // otherwise shrink and clip their own content.
    <div className="flex h-full w-full min-w-0 flex-col gap-5 overflow-y-auto [&>*]:shrink-0">
      <PageHeader
        title="Signals"
        description={`Arcli read ${domain} and drafted the targeting brief below. Correct anything that doesn't describe your best customer.`}
        showDescription
        meta={<StatusBadge tone="success" size="compact">Website read</StatusBadge>}
      />

      {hasFirstScan && freeScanPreview ? <FreeScanResult preview={freeScanPreview} /> : null}

      <section aria-labelledby="brief-heading" className="rounded-lg border border-border bg-card p-4 md:p-5">
        <h2 id="brief-heading" className="text-lg leading-7 font-semibold text-foreground">
          What Arcli learned from your site
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Website text is a starting point. You decide whether it describes your buyer.
        </p>
        <dl className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-3 md:gap-6">
          <BriefField label="Who you sell to" value={fields.target_audience.slice(0, 3).join(", ")} />
          <BriefField label="Problem you solve" value={fields.core_problem} />
          <BriefField label="Why you're different" value={fields.unique_value_prop} />
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/brief">Review brief</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/settings">Website settings</Link>
          </Button>
        </div>
      </section>

      {!hasFirstScan ? (
        <section aria-labelledby="discovery-heading" className="rounded-lg border border-border bg-blue-tint p-4 md:p-5">
          <div className="flex items-start gap-3">
            <span className="hidden size-9 shrink-0 items-center justify-center rounded-md bg-card text-primary ring-1 ring-inset ring-border sm:flex">
              <LockKeyhole className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="discovery-heading" className="text-lg leading-7 font-semibold text-foreground">
                Finding prospects starts on Pro
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-navy-soft">
                Free prepares your targeting brief. It doesn&apos;t search public conversations. On Pro,
                Arcli checks supported sources every day and shows each prospect with a link to the
                original post. How many it finds depends on your market and the sources.
              </p>
              <div className="mt-4 flex flex-col items-start gap-2">
                <UpgradeButton />
                <p className="text-xs text-subtle">{PRO_PRICE_NOTE}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
