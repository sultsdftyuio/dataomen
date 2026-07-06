"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import BillingTestSwitcher from "./billing-test-switcher";
import WorkspaceBillingCard, { WorkspaceBillingCardProps } from "./workspace-billing-card";
import WorkspaceSettingsForm from "./workspace-settings-form";
import WorkspaceSettingsPreview from "./workspace-settings-preview";
import { C } from "@/lib/tokens";
import { WorkspaceSettingsSchema } from "@/lib/settings/schemas";

interface WorkspaceSettingsProps extends WorkspaceBillingCardProps {
  initialData?: {
    fullName: string;
    authEmail: string;
    companyName: string;
    supportEmail: string;
    websiteUrl: string;
  };
  billingTestControlsEnabled?: boolean;
}

type WorkspaceUpdateResponse = {
  error?: string;
  code?: string;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
  settings?: Partial<{
    fullName: string;
    companyName: string;
    replyToEmail: string;
    websiteUrl: string;
  }>;
};

function formatFieldErrors(
  fieldErrors: Record<string, string[] | undefined> | undefined
) {
  if (!fieldErrors) return null;

  const messages = Object.entries(fieldErrors)
    .flatMap(([field, errors]) =>
      (errors ?? []).map((message) => `${field}: ${message}`)
    )
    .filter(Boolean);

  return messages.length > 0 ? messages.join(" ") : null;
}

async function readSettingsError(response: Response): Promise<string> {
  const payload = (await response
    .json()
    .catch(() => ({}))) as WorkspaceUpdateResponse;

  const fieldMessage = formatFieldErrors(payload.details?.fieldErrors);
  return fieldMessage || payload.error || "Failed to update workspace configuration.";
}

export default function CompactWorkspaceSettings({
  initialData = {
    fullName: "Justin Mason",
    authEmail: "justin@arcli.tech",
    companyName: "",
    supportEmail: "",
    websiteUrl: "",
  },
  planData,
  billingTestControlsEnabled = false,
}: WorkspaceSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(initialData.fullName);
  const [companyName, setCompanyName] = useState(initialData.companyName);
  const [supportEmail, setSupportEmail] = useState(initialData.supportEmail);
  const [websiteUrl, setWebsiteUrl] = useState(initialData.websiteUrl);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setFullName(initialData.fullName || "");
      setCompanyName(initialData.companyName || "");
      setSupportEmail(initialData.supportEmail || "");
      setWebsiteUrl(initialData.websiteUrl || "");
    }
  }, [initialData, isDirty]);

  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setter(value);
    setIsDirty(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          companyName,
          replyToEmail: supportEmail,
          fullName,
          websiteUrl,
        };

        const validation = WorkspaceSettingsSchema.safeParse(payload);
        if (!validation.success) {
          throw new Error(
            formatFieldErrors(validation.error.flatten().fieldErrors) ||
              "Invalid workspace configuration."
          );
        }

        const res = await fetch("/api/settings/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validation.data),
        });

        if (!res.ok) {
          throw new Error(await readSettingsError(res));
        }

        const data = (await res.json().catch(() => ({}))) as WorkspaceUpdateResponse;

        if (typeof data.settings?.fullName === "string") {
          setFullName(data.settings.fullName);
        }
        if (typeof data.settings?.companyName === "string") {
          setCompanyName(data.settings.companyName);
        }
        if (typeof data.settings?.replyToEmail === "string") {
          setSupportEmail(data.settings.replyToEmail);
        }
        if (typeof data.settings?.websiteUrl === "string") {
          setWebsiteUrl(data.settings.websiteUrl);
        }

        setIsDirty(false);
        router.refresh();

        toast({
          title: "Configuration Saved",
          description: "Workspace identity and profile details updated successfully.",
        });
      } catch (error: any) {
        toast({
          title: "Save Failed",
          description: error.message || "Could not update workspace configuration. Please try again.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div
      style={{
        fontFamily: sans,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        maxWidth: 896,
        margin: "0 auto",
        padding: "24px 16px",
        gap: 20,
        animation: "fadeIn 0.2s ease-in",
      }}
    >
      {/* ── Page Header (Dense & Clean) ── */}
      <div style={{ borderBottom: surfaceBorder, paddingBottom: 12 }}>
        <h1
          className="pfd"
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: C.navy,
            margin: "0 0 4px 0",
            letterSpacing: "-0.01em",
          }}
        >
          Workspace Settings
        </h1>
        <p style={{ fontSize: 13, color: C.navySoft, margin: 0, lineHeight: 1.5 }}>
          Manage your global workspace identity, user profile details, and subscription recovery capacity.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* ── Left Column (7 Cols): Dense Form & Billing Cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <WorkspaceSettingsForm
            fullName={fullName}
            setFullName={setFullName}
            companyName={companyName}
            setCompanyName={setCompanyName}
            supportEmail={supportEmail}
            setSupportEmail={setSupportEmail}
            websiteUrl={websiteUrl}
            setWebsiteUrl={setWebsiteUrl}
            authEmail={initialData.authEmail}
            isPending={isPending}
            handleInputChange={handleInputChange}
          />
          <WorkspaceBillingCard planData={planData} />
          {billingTestControlsEnabled && (
            <BillingTestSwitcher currentStatus={planData?.planStatus} />
          )}

          {/* Submit Action Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
            <span style={{ fontSize: 11, color: isDirty ? C.amber : C.muted, fontWeight: isDirty ? 600 : 400 }}>
              {isDirty ? "● Unsaved changes" : "All changes saved"}
            </span>
            <button
              type="submit"
              disabled={isPending || !isDirty}
              style={{
                height: 32,
                padding: "0 16px",
                background: isPending || !isDirty ? C.offWhite : C.navy,
                color: isPending || !isDirty ? C.faint : C.white,
                border: isPending || !isDirty ? surfaceBorder : "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: isPending || !isDirty ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: isPending || !isDirty ? "none" : surfaceShadow,
                transition: "all 0.15s ease",
              }}
            >
              {isPending ? (
                <>
                  <RefreshCw size={13} className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save size={13} /> Save Changes
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Right Column (5 Cols): Dynamic Context & Previews ── */}
        <WorkspaceSettingsPreview
          companyName={companyName}
          websiteUrl={websiteUrl}
          supportEmail={supportEmail}
        />
      </form>
    </div>
  );
}
