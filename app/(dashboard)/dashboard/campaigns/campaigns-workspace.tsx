"use client";

import React from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { TargetUsersTable } from "./target-users-table";
import { C } from "@/lib/tokens";

interface CampaignsWorkspaceProps {
  emailTemplates: any[];
  selectedTemplate: string | null;
  senderEmail: string | null;
  setSelectedTemplate: (id: string) => void;
  currentTemplate: any;
  sanitizedHtml: string;
  hydratedSubject: string;
  missingVariables: string[];
  renderError: string | null;
  fromEmail: string;
  recipientEmail: string;
  recipientName: string;
  unsupportedVariables: string[];
  sortedAtRiskUsers: any[];
  selectedUsers: Set<string>;
  allSelected: boolean;
  toggleUser: (id: string) => void;
  toggleAll: () => void;
  isProTier: boolean;
  restrictionMessage: string;
  surfaceBorder: string;
  surfaceShadow: string;
}

export function CampaignsWorkspace({
  emailTemplates,
  selectedTemplate,
  senderEmail,
  setSelectedTemplate,
  currentTemplate,
  sanitizedHtml,
  hydratedSubject,
  missingVariables,
  renderError,
  fromEmail,
  recipientEmail,
  recipientName,
  unsupportedVariables,
  sortedAtRiskUsers,
  selectedUsers,
  allSelected,
  toggleUser,
  toggleAll,
  isProTier,
  restrictionMessage,
  surfaceBorder,
  surfaceShadow,
}: CampaignsWorkspaceProps) {
  return (
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
            {isProTier && senderEmail ? (
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
              const isDisabled = !isProTier || !senderEmail;

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

      {/* Right Column: Preview + Target Users */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        
        {/* ── Template Preview ── */}
        {currentTemplate && (
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
              2. Preview
            </h2>

            {renderError && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#FEE2E2",
                  border: "1px solid #FCA5A5",
                  borderRadius: 6,
                  color: "#991B1B",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <strong>Render Error:</strong> {renderError}
              </div>
            )}

            {missingVariables.length > 0 && (
              <div
                style={{
                  padding: "12px 16px",
                  background: C.amberPale,
                  border: `1px solid rgba(245, 158, 11, 0.3)`,
                  borderRadius: 6,
                  color: "#92400E",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <strong>Missing variables:</strong> {missingVariables.join(", ")}
              </div>
            )}

            {unsupportedVariables.length > 0 && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#FEE2E2",
                  border: "1px solid #FCA5A5",
                  borderRadius: 6,
                  color: "#991B1B",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <strong>Unsupported variables:</strong> {unsupportedVariables.join(", ")}
              </div>
            )}

            <div
              style={{
                border: surfaceBorder,
                borderRadius: 8,
                overflow: "hidden",
                background: C.offWhite,
                minHeight: 200,
                boxShadow: surfaceShadow,
              }}
            >
              <div
                style={{
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 14px",
                  background: "#F1F5F9",
                  borderBottom: surfaceBorder,
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.navySoft,
                }}
              >
                <span>Inbox</span>
                <span style={{ color: C.muted, fontWeight: 600 }}>Preview</span>
              </div>

              <div style={{ padding: 14, background: C.white, borderBottom: surfaceBorder }}>
                <div style={{ display: "grid", gap: 6, fontSize: 12, color: C.navySoft }}>
                  <div>
                    <strong style={{ color: C.navy }}>From:</strong> {fromEmail}
                  </div>
                  <div>
                    <strong style={{ color: C.navy }}>To:</strong> {recipientName} &lt;{recipientEmail}&gt;
                  </div>
                  <div>
                    <strong style={{ color: C.navy }}>Subject:</strong> {hydratedSubject}
                  </div>
                </div>
              </div>

              <div style={{ padding: 18 }}>
                <div
                  style={{
                    margin: "0 auto",
                    maxWidth: 560,
                    minHeight: 220,
                    padding: 20,
                    background: C.white,
                    border: surfaceBorder,
                    borderRadius: 8,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: C.navy,
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              </div>
            </div>
          </div>
        )}

        <TargetUsersTable
          sortedAtRiskUsers={sortedAtRiskUsers}
          selectedUsers={selectedUsers}
          allSelected={allSelected}
          senderEmail={senderEmail}
          isProTier={isProTier}
          restrictionMessage={restrictionMessage}
          toggleUser={toggleUser}
          toggleAll={toggleAll}
        />
      </div>
    </div>
  );
}
