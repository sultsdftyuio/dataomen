"use client";

import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";

import { EMPTY_FIELDS } from "@/components/onboarding/workspace-provisioning-profile";
import type {
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";

interface WorkspaceSettingsPreviewProps {
  tenantId?: string | null;
  serviceProfile?: ServiceProfileView | null;
  fields?: ServiceProfileFields | null;
}

const PROFILE_FIELD_KEYS = [
  "target_audience",
  "core_problem",
  "unique_value_prop",
  "use_cases",
  "pain_points",
  "buying_triggers",
  "negative_keywords",
  "excluded_audiences",
] as const satisfies ReadonlyArray<keyof ServiceProfileFields>;

function tenantSafeProfileFields(
  fields: ServiceProfileFields | null | undefined,
) {
  const source = fields ?? EMPTY_FIELDS;

  return PROFILE_FIELD_KEYS.reduce<ServiceProfileFields>(
    (profile, key) => ({
      ...profile,
      [key]: source[key],
    }),
    { ...EMPTY_FIELDS },
  );
}

export default function WorkspaceSettingsPreview({
  fields = null,
  serviceProfile = null,
}: WorkspaceSettingsPreviewProps) {
  const previewFields = fields ?? serviceProfile?.fields;
  const formattedJson = useMemo(
    () =>
      JSON.stringify(
        tenantSafeProfileFields(previewFields),
        null,
        2,
      ),
    [previewFields],
  );

  return (
    <div className="flex flex-col gap-3">
      <pre
        tabIndex={0}
        aria-label="Tenant-safe structured service profile JSON"
        className="max-h-[560px] overflow-auto rounded-lg border bg-background p-4 text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <code>{formattedJson}</code>
      </pre>

      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        <ShieldCheck
          className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        <span>
          Only structured service profile fields are rendered here. Raw crawler
          metadata, worker diagnostics, and secrets are excluded.
        </span>
      </div>
    </div>
  );
}
