"use client";

import Link from "next/link";
import { ArrowRight, FileSearch, Globe2, LockKeyhole } from "lucide-react";

import UpgradeButton from "@/components/ui/UpgradeButton";
import { C } from "@/lib/tokens";
import type { ServiceProfileView } from "./prospect-types";

type FreeProspectPreviewProps = {
  websiteUrl: string;
  serviceProfile: ServiceProfileView;
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
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: C.rule }}>
      <dt className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-6" style={{ color: C.navy }}>
        {value || "Add this to your matching brief."}
      </dd>
    </div>
  );
}

export default function FreeProspectPreview({
  websiteUrl,
  serviceProfile,
}: FreeProspectPreviewProps) {
  const fields = serviceProfile.fields;
  const domain = domainForDisplay(websiteUrl);

  return (
    <main className="flex h-full w-full flex-col gap-5 overflow-y-auto pr-1">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
          Free workspace
        </p>
        <h1 className="pfd mt-2 text-3xl leading-tight" style={{ color: C.navy }}>
          Your website brief is ready
        </h1>
        <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
          Arcli read {domain} to prepare the buyer and problem criteria below. Review them before
          starting public-conversation discovery on Pro.
        </p>
      </header>

      <section aria-labelledby="brief-heading" className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: C.rule }}>
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
        <dl className="mt-5 grid gap-3 md:grid-cols-3">
          <BriefField label="Audience" value={fields.target_audience.slice(0, 3).join(", ")} />
          <BriefField label="Problem" value={fields.core_problem} />
          <BriefField label="Value" value={fields.unique_value_prop} />
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/dashboard/brief" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white" style={{ backgroundColor: C.blue, textDecoration: "none" }}>
            Review matching brief <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/settings" className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold" style={{ borderColor: C.ruleDark, color: C.navy, textDecoration: "none" }}>
            Review website
          </Link>
        </div>
      </section>

      <section aria-labelledby="discovery-heading" className="rounded-xl border p-5" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
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
              <span className="text-xs font-semibold" style={{ color: C.muted }}>$35/month · cancel any time</span>
            </div>
          </div>
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs leading-5" style={{ color: C.muted }}>
        <FileSearch className="size-4 shrink-0" aria-hidden="true" />
        A prepared brief is not evidence that buyer conversations exist.
      </p>
    </main>
  );
}
