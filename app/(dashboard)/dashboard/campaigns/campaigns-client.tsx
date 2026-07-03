"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Mail,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Save,
} from "lucide-react";
import { CreateTemplateModal } from "./create-template-modal";
import { TargetUsersTable } from "./target-users-table";
import { useCampaigns } from "@/hooks/use-campaigns";
import { type CampaignsClientProps } from "@/lib/types";

// Centralized design tokens
import { C } from "@/lib/tokens";

export default function CampaignsClient({
  atRiskUsers,
  emailTemplates,
  initialSenderEmail,
}: CampaignsClientProps) {
  const router = useRouter();
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
  } = useCampaigns({
    atRiskUsers,
    emailTemplates,
    initialSenderEmail,
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

        {/* Guardrail: Only allow template creation if a sender email exists */}
        {senderEmail ? (
          <CreateTemplateModal onTemplateCreated={onNewTemplateCreated} />
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
            <Mail size={14} />
            Create Template
          </button>
        )}
      </div>

      {/* ── Campaign Blocker Alert ── */}
      {!senderEmail && (
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
        
        {/* Left Column: Email Templates */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: C.navySoft,
              margin: 0,
            }}
          >
            1. Select Template
          </h2>

          {emailTemplates.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                background: C.offWhite,
                border: `1px dashed ${C.ruleDark}`,
                borderRadius: 8,
                fontSize: 13,
                color: C.muted,
              }}
            >
              No templates found.
              <br />
              {senderEmail ? (
                <span
                  style={{ color: C.blue, fontWeight: 600, cursor: "pointer", display: "block", marginTop: 4 }}
                >
                  Create one now
                </span>
              ) : (
                <span style={{ color: C.faint, display: "block", marginTop: 4 }}>
                  Configure sender to unlock.
                </span>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 500, overflowY: "auto" }}>
              {emailTemplates.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id;
                const isDisabled = !senderEmail;

                return (
                  <div
                    key={tpl.id}
                    role={isDisabled ? "presentation" : "button"}
                    tabIndex={isDisabled ? -1 : 0}
                    onKeyDown={(e) => {
                      if (isDisabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedTemplate(tpl.id);
                      }
                    }}
                    onClick={() => {
                      if (!isDisabled) setSelectedTemplate(tpl.id);
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: isSelected && !isDisabled ? `1px solid ${C.blue}` : surfaceBorder,
                      background: isSelected && !isDisabled ? C.bluePale : C.white,
                      boxShadow: surfaceShadow,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      opacity: isDisabled ? 0.5 : 1,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            padding: 6,
                            borderRadius: 6,
                            background: isSelected ? "rgba(27, 110, 191, 0.12)" : C.offWhite,
                            border: surfaceBorder,
                            display: "flex",
                          }}
                        >
                          <Mail size={14} color={isSelected ? C.blue : C.muted} />
                        </div>
                        <h3
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: isSelected ? C.blueMid : C.navy,
                            margin: 0,
                          }}
                        >
                          {tpl.name}
                        </h3>
                      </div>
                      {isSelected && !isDisabled && <CheckCircle2 size={16} color={C.blue} />}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: C.muted,
                        background: C.offWhite,
                        padding: "6px 8px",
                        borderRadius: 4,
                        border: surfaceBorder,
                        marginTop: 10,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {tpl.subject}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Target Users Table */}
        <TargetUsersTable
          sortedAtRiskUsers={sortedAtRiskUsers}
          selectedUsers={selectedUsers}
          allSelected={allSelected}
          senderEmail={senderEmail}
          toggleUser={toggleUser}
          toggleAll={toggleAll}
        />
      </div>

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
          {!senderEmail ? (
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
          disabled={!senderEmail || !selectedTemplate || selectedUsers.size === 0 || isSending}
          onClick={handleSendCampaign}
          style={{
            height: 36,
            padding: "0 20px",
            background:
              !senderEmail || selectedUsers.size === 0 || !selectedTemplate
                ? C.offWhite
                : C.navy,
            color:
              !senderEmail || selectedUsers.size === 0 || !selectedTemplate
                ? C.faint
                : C.white,
            border:
              !senderEmail || selectedUsers.size === 0 || !selectedTemplate
                ? surfaceBorder
                : "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor:
              !senderEmail || !selectedTemplate || selectedUsers.size === 0 || isSending
                ? "not-allowed"
                : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow:
              !senderEmail || selectedUsers.size === 0 || !selectedTemplate
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