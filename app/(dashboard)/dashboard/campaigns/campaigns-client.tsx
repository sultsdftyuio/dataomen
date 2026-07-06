"use client";

import React, { useMemo } from "react";
import {
  Send,
  Mail,
  AlertCircle,
  Save,
  RefreshCw,
  Lock,
} from "lucide-react";
import { CreateTemplateModal } from "./create-template-modal";
import { useCampaigns } from "@/hooks/use-campaigns";
import { useTemplatePreview } from "@/app/(dashboard)/dashboard/campaigns/templates/use-template-preview";
import { type TemplateDefinition } from "@/app/(dashboard)/dashboard/campaigns/templates/security";
import { type CampaignsClientProps } from "@/lib/types";
import { CampaignsWorkspace } from "@/app/(dashboard)/dashboard/campaigns/campaigns-workspace";
import { C } from "@/lib/tokens";
import UpgradeButton from "@/components/ui/UpgradeButton";

export default function CampaignsClient({
  atRiskUsers,
  emailTemplates,
  initialSenderEmail,
  initialCompanyName,
  initialFullName,
  isProTier: initialIsProTier,
  planTier,
  subscriptionStatus,
  restrictionMessage: initialRestrictionMessage,
}: CampaignsClientProps) {
  const {
    senderEmail,
    selectedTemplate,
    selectedUsers,
    isSending,
    senderInput,
    isSavingSender,
    sortedAtRiskUsers,
    allSelected,
    activeTemplate,
    setSelectedTemplate,
    setSenderInput,
    handleSaveSenderEmail,
    onNewTemplateCreated,
    toggleUser,
    toggleAll,
    handleSendCampaign,
    isProTier,
    restrictionMessage,
  } = useCampaigns({
    atRiskUsers,
    emailTemplates,
    initialSenderEmail,
    isProTier: initialIsProTier,
    planTier,
    subscriptionStatus,
    restrictionMessage: initialRestrictionMessage,
  });

  // ── Map EmailTemplate -> TemplateDefinition for the preview hook ──
  const previewTemplate = useMemo<TemplateDefinition | undefined>(() => {
    if (!activeTemplate) return undefined;
    const t = activeTemplate as any;
    return {
      name: activeTemplate.name,
      subject: activeTemplate.subject,
      rawHtml: t.html ?? t.bodyHtml ?? t.body_html ?? "",
      trigger: t.trigger ?? "manual",
      cooldownDays: t.cooldownDays ?? 0,
      campaignType: t.campaign_type ?? t.type ?? "recovery",
    };
  }, [activeTemplate]);

  // ── Template Preview Integration ──
  const {
    sanitizedHtml,
    hydratedSubject,
    missingVariables,
    renderError,
    currentTemplate,
    fromEmail,
    recipientEmail,
    recipientName,
    unsupportedVariables,
  } = useTemplatePreview({
    selectedTemplateKey: selectedTemplate || "",
    settings: {
      companyName: initialCompanyName,
      fullName: initialFullName,
      defaultSenderEmail: senderEmail,
    },
    customTemplate: previewTemplate,
  });

  // Unified styling constants matching the Arcli design system
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  return (
    <div
      style={{
        fontFamily: sans,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        maxWidth: 1240,
        margin: "0 auto",
        gap: 24,
        paddingBottom: 48,
        animation: "fadeIn 0.3s ease-in",
      }}
    >
      {/* ── Page Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1
            className="pfd"
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: C.navy,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Campaign Dispatch
          </h1>
        </div>

        {/* Guardrail: Only allow template creation for Pro workspaces with a sender email */}
        {isProTier && senderEmail ? (
          <CreateTemplateModal
            onTemplateCreated={onNewTemplateCreated}
            settings={{
              companyName: initialCompanyName,
              fullName: initialFullName,
              defaultSenderEmail: senderEmail,
            }}
          />
        ) : (
          <button
            disabled
            style={{
              height: 36,
              padding: "0 16px",
              background: C.offWhite,
              color: C.muted,
              border: surfaceBorder,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "not-allowed",
              opacity: 0.6,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isProTier ? <Mail size={14} /> : <Lock size={14} />}
            Create Template
          </button>
        )}
      </div>

      {/* ── Campaign Blocker Alert ── */}
      {!isProTier ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            padding: "16px 20px",
            background: C.bluePale,
            border: `1px solid rgba(27, 110, 191, 0.25)`,
            borderRadius: 8,
            boxShadow: surfaceShadow,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: C.blueMid }}>
              <Lock size={16} color={C.blue} />
              Pro Plan Required
            </div>
            <p style={{ fontSize: 13, color: C.navySoft, margin: 0 }}>
              {restrictionMessage}
            </p>
          </div>
          <UpgradeButton className="h-9 px-4 rounded-md bg-[#0B1120] hover:bg-slate-800" />
        </div>
      ) : !senderEmail && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            padding: "16px 20px",
            background: C.amberPale,
            border: `1px solid rgba(245, 158, 11, 0.3)`,
            borderRadius: 8,
            boxShadow: surfaceShadow,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#92400E" }}>
              <AlertCircle size={16} color={C.amber} />
              Sender Configuration Required
            </div>
            <p style={{ fontSize: 13, color: "#92400E", margin: 0 }}>
              Configure a verified sender email address to unlock campaign creation and dispatch.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="email"
              placeholder="e.g., recovery@yourdomain.com"
              value={senderInput}
              onChange={(e) => setSenderInput(e.target.value)}
              style={{
                height: 36,
                padding: "0 14px",
                borderRadius: 6,
                border: `1px solid rgba(245, 158, 11, 0.4)`,
                background: C.white,
                fontSize: 13,
                color: C.navy,
                outline: "none",
                minWidth: 260,
                boxShadow: surfaceShadow,
              }}
            />
            <button
              onClick={handleSaveSenderEmail}
              disabled={
                isSavingSender ||
                !senderInput.trim() ||
                senderInput.trim() === senderEmail
              }
              style={{
                height: 36,
                padding: "0 16px",
                background: C.amber,
                color: C.white,
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: isSavingSender ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: !senderInput.trim() || senderInput.trim() === senderEmail ? 0.6 : 1,
              }}
            >
              {isSavingSender ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {isSavingSender ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* ── Main Workspace Grid ── */}
      <CampaignsWorkspace
        emailTemplates={emailTemplates}
        selectedTemplate={selectedTemplate}
        senderEmail={senderEmail}
        setSelectedTemplate={setSelectedTemplate}
        currentTemplate={currentTemplate}
        sanitizedHtml={sanitizedHtml}
        hydratedSubject={hydratedSubject}
        missingVariables={missingVariables}
        renderError={renderError}
        fromEmail={fromEmail}
        recipientEmail={recipientEmail}
        recipientName={recipientName}
        unsupportedVariables={unsupportedVariables}
        sortedAtRiskUsers={sortedAtRiskUsers}
        selectedUsers={selectedUsers}
        allSelected={allSelected}
        toggleUser={toggleUser}
        toggleAll={toggleAll}
        isProTier={isProTier}
        restrictionMessage={restrictionMessage}
        surfaceBorder={surfaceBorder}
        surfaceShadow={surfaceShadow}
      />

      {/* ── Action Footer ── */}
      <div
        style={{
          marginTop: 8,
          position: "sticky",
          bottom: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(8px)",
          borderRadius: 8,
          border: surfaceBorder,
          boxShadow: surfaceShadow,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.navySoft, display: "flex", alignItems: "center", gap: 10 }}>
          {!isProTier ? (
            <>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue }} />
              <span style={{ color: C.blueMid }}>Upgrade to Pro to execute recovery campaigns.</span>
            </>
          ) : !senderEmail ? (
            <>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.amber }} />
              <span style={{ color: "#92400E" }}>Action Required: Set up sender email to unlock dispatch.</span>
            </>
          ) : activeTemplate ? (
            <>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
              <span>
                Queueing <strong style={{ color: C.navy }}>{activeTemplate.name}</strong> for{" "}
                <strong style={{ color: C.navy }}>{selectedUsers.size}</strong> operators.
              </span>
            </>
          ) : (
            <>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.ruleDark }} />
              <span style={{ color: C.muted }}>Awaiting template selection.</span>
            </>
          )}
        </div>

        <button
          disabled={!isProTier || !senderEmail || !selectedTemplate || selectedUsers.size === 0 || isSending}
          onClick={handleSendCampaign}
          style={{
            height: 36,
            padding: "0 20px",
            background:
              !isProTier || !senderEmail || selectedUsers.size === 0 || !selectedTemplate
                ? C.offWhite
                : C.navy,
            color:
              !isProTier || !senderEmail || selectedUsers.size === 0 || !selectedTemplate
                ? C.faint
                : C.white,
            border:
              !isProTier || !senderEmail || selectedUsers.size === 0 || !selectedTemplate
                ? surfaceBorder
                : "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor:
              !isProTier || !senderEmail || !selectedTemplate || selectedUsers.size === 0 || isSending
                ? "not-allowed"
                : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow:
              !isProTier || !senderEmail || selectedUsers.size === 0 || !selectedTemplate
                ? "none"
                : surfaceShadow,
          }}
        >
          {isSending ? (
            <>
              <RefreshCw size={14} className="animate-spin" /> Orchestrating...
            </>
          ) : (
            <>
              <Send size={14} /> Execute Campaign
            </>
          )}
        </button>
      </div>
    </div>
  );
}
