"use client";

import Link from "next/link";
import { ArrowRight, Check, FileSearch, Globe2, LockKeyhole } from "lucide-react";

import { FreeScanResult } from "@/components/prospects/free-scan-result";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { PRO_PRICE_NOTE } from "@/lib/entitlements";
import { C } from "@/lib/tokens";
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
    <div className="rounded-lg border bg-white p-3.5" style={{ borderColor: C.rule }}>
      <dt className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
        {label}
      </dt>
      <dd className="mt-1.5 line-clamp-4 text-sm leading-6" style={{ color: C.navy }}>
        {value || "Add this to your matching brief."}
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
    <div className="flex h-full w-full min-w-0 flex-col gap-4 overflow-y-auto pr-1">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
          Free workspace
        </p>
        <h1 className="pfd mt-2 text-2xl leading-tight sm:text-3xl" style={{ color: C.navy }}>
          Review your matching brief
        </h1>
        <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
          Arcli read {domain} and drafted the buyer criteria below. Correct anything that does not describe your best customer.
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: C.greenPale, color: C.green }}>
          <Check className="size-3.5" aria-hidden="true" /> Website read complete
        </span>
      </header>

      {hasFirstScan && freeScanPreview ? <FreeScanResult preview={freeScanPreview} /> : null}

      <section aria-labelledby="brief-heading" className="rounded-xl border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: C.rule }}>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: C.bluePale, color: C.blue }}>
            <Globe2 className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="brief-heading" className="pfd text-xl" style={{ color: C.navy }}>
              What Arcli learned from your site
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
              Website text is a starting point. You decide whether these criteria describe your buyer.
            </p>
          </div>
        </div>
        <dl className="mt-4 grid gap-2.5 md:grid-cols-3">
          <BriefField label="Audience" value={fields.target_audience.slice(0, 3).join(", ")} />
          <BriefField label="Problem" value={fields.core_problem} />
          <BriefField label="Value" value={fields.unique_value_prop} />
        </dl>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link href="/dashboard/brief" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white" style={{ backgroundColor: C.blue, textDecoration: "none" }}>
            Review and correct brief <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/settings" className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold" style={{ borderColor: C.ruleDark, color: C.navy, textDecoration: "none" }}>
            Website settings
          </Link>
        </div>
      </section>

      {!hasFirstScan ? (
      <section aria-labelledby="discovery-heading" className="rounded-xl border p-4 sm:p-5" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: C.white, color: C.blue }}>
            <LockKeyhole className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="discovery-heading" className="pfd text-xl" style={{ color: C.navy }}>
              Public discovery starts on Pro
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: C.navySoft }}>
              Free prepares your website brief; it does not search public conversations or produce
              a live match count. On Pro, Arcli checks supported sources and shows source-linked
              conversations for your review when it finds them. Results vary by market and source coverage.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <UpgradeButton />
              <span className="text-xs font-semibold" style={{ color: C.muted }}>{PRO_PRICE_NOTE}</span>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {!hasFirstScan ? (
        <p className="flex items-center gap-2 text-xs leading-5" style={{ color: C.muted }}>
          <FileSearch className="size-4 shrink-0" aria-hidden="true" />
          A prepared brief is not evidence that buyer conversations exist.
        </p>
      ) : null}
    </div>
  );
}
