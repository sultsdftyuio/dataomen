"use client";

import React from "react";
import { Building2, Mail, Globe, User, Lock } from "lucide-react";
import { C } from "@/lib/tokens";

interface WorkspaceSettingsFormProps {
  fullName: string;
  setFullName: React.Dispatch<React.SetStateAction<string>>;
  companyName: string;
  setCompanyName: React.Dispatch<React.SetStateAction<string>>;
  supportEmail: string;
  setSupportEmail: React.Dispatch<React.SetStateAction<string>>;
  websiteUrl: string;
  setWebsiteUrl: React.Dispatch<React.SetStateAction<string>>;
  authEmail: string;
  isPending: boolean;
  handleInputChange: (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => void;
}

export default function WorkspaceSettingsForm({
  fullName,
  setFullName,
  companyName,
  setCompanyName,
  supportEmail,
  setSupportEmail,
  websiteUrl,
  setWebsiteUrl,
  authEmail,
  isPending,
  handleInputChange,
}: WorkspaceSettingsFormProps) {
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  return (
    <>
      {/* Section 1: Workspace Identity */}
      <section
        style={{
          background: C.white,
          borderRadius: 8,
          border: surfaceBorder,
          boxShadow: surfaceShadow,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: `1px solid ${C.rule}`,
            paddingBottom: 10,
          }}
        >
          <Building2 size={16} color={C.blue} />
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
            Workspace Identity
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 4 }}>
              Company Name
            </label>
            <div style={{ position: "relative" }}>
              <Building2 size={14} color={C.muted} style={{ position: "absolute", left: 10, top: 9 }} />
              <input
                type="text"
                required
                placeholder="e.g. Acme SaaS"
                value={companyName}
                disabled={isPending}
                onChange={(e) => handleInputChange(setCompanyName, e.target.value)}
                style={{
                  width: "100%",
                  height: 32,
                  padding: "0 12px 0 32px",
                  borderRadius: 6,
                  border: surfaceBorder,
                  background: C.white,
                  fontSize: 13,
                  color: C.navy,
                  outline: "none",
                  boxShadow: surfaceShadow,
                  opacity: isPending ? 0.6 : 1,
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 4 }}>
                Support / Reply-To Email
              </label>
              <div style={{ position: "relative" }}>
                <Mail size={14} color={C.muted} style={{ position: "absolute", left: 10, top: 9 }} />
                <input
                  type="email"
                  required
                  placeholder="support@acme.com"
                  value={supportEmail}
                  disabled={isPending}
                  onChange={(e) => handleInputChange(setSupportEmail, e.target.value)}
                  style={{
                    width: "100%",
                    height: 32,
                    padding: "0 12px 0 32px",
                    borderRadius: 6,
                    border: surfaceBorder,
                    background: C.white,
                    fontSize: 13,
                    color: C.navy,
                    outline: "none",
                    boxShadow: surfaceShadow,
                    opacity: isPending ? 0.6 : 1,
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 4 }}>
                Website URL
              </label>
              <div style={{ position: "relative" }}>
                <Globe size={14} color={C.muted} style={{ position: "absolute", left: 10, top: 9 }} />
                <input
                  type="url"
                  placeholder="https://acme.com"
                  value={websiteUrl}
                  disabled={isPending}
                  onChange={(e) => handleInputChange(setWebsiteUrl, e.target.value)}
                  style={{
                    width: "100%",
                    height: 32,
                    padding: "0 12px 0 32px",
                    borderRadius: 6,
                    border: surfaceBorder,
                    background: C.white,
                    fontSize: 13,
                    color: C.navy,
                    outline: "none",
                    boxShadow: surfaceShadow,
                    opacity: isPending ? 0.6 : 1,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: User Profile */}
      <section
        style={{
          background: C.white,
          borderRadius: 8,
          border: surfaceBorder,
          boxShadow: surfaceShadow,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: `1px solid ${C.rule}`,
            paddingBottom: 10,
          }}
        >
          <User size={16} color={C.blue} />
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
            User Profile
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 4 }}>
              Full Name
            </label>
            <input
              type="text"
              required
              placeholder="Founder Name"
              value={fullName}
              disabled={isPending}
              onChange={(e) => handleInputChange(setFullName, e.target.value)}
              style={{
                width: "100%",
                height: 32,
                padding: "0 12px",
                borderRadius: 6,
                border: surfaceBorder,
                background: C.white,
                fontSize: 13,
                color: C.navy,
                outline: "none",
                boxShadow: surfaceShadow,
                opacity: isPending ? 0.6 : 1,
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 4 }}>
              Authentication Email
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="email"
                disabled
                value={authEmail}
                style={{
                  width: "100%",
                  height: 32,
                  padding: "0 32px 0 12px",
                  borderRadius: 6,
                  border: surfaceBorder,
                  background: C.offWhite,
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: C.muted,
                  cursor: "not-allowed",
                  userSelect: "none",
                }}
              />
              <Lock size={14} color={C.muted} style={{ position: "absolute", right: 10, top: 9 }} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
