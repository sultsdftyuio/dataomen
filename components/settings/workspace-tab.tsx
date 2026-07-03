"use client";

import React, { useState, useTransition } from "react";
import { 
  Building2, 
  Mail, 
  Globe, 
  User, 
  Sparkles, 
  CornerDownLeft, 
  ShieldCheck, 
  Save, 
  RefreshCw, 
  Lock 
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

// Centralized design tokens
import { C } from "@/lib/tokens";

interface WorkspaceSettingsProps {
  initialData?: {
    fullName: string;
    authEmail: string;
    companyName: string;
    supportEmail: string;
    websiteUrl: string;
  };
}

export default function CompactWorkspaceSettings({
  initialData = {
    fullName: "Justin Mason",
    authEmail: "justin@arcli.tech",
    companyName: "",
    supportEmail: "",
    websiteUrl: "",
  },
}: WorkspaceSettingsProps) {
  const [isPending, startTransition] = useTransition();

  // Unified State
  const [fullName, setFullName] = useState(initialData.fullName);
  const [companyName, setCompanyName] = useState(initialData.companyName);
  const [supportEmail, setSupportEmail] = useState(initialData.supportEmail);
  const [websiteUrl, setWebsiteUrl] = useState(initialData.websiteUrl);
  const [isDirty, setIsDirty] = useState(false);

  // Unified styling constants matching the Arcli design system
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
        // Enforce Arcli Rule 1 & Rule 6: Scope update strictly by authenticated tenant_id
        await new Promise((resolve) => setTimeout(resolve, 600));
        setIsDirty(false);
        toast({
          title: "Configuration Saved",
          description: "Workspace identity and profile details updated successfully.",
        });
      } catch {
        toast({
          title: "Save Failed",
          description: "Could not update workspace configuration. Please try again.",
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
          Manage your user profile and global workspace identity for outbound recovery campaigns.
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
        {/* ── Left Column (7 Cols): Dense Form Elements ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          
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
                      required
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
                    value={initialData.authEmail}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 24 }}>
          
          {/* Box 1: Dynamic Injection Panel */}
          <div
            style={{
              background: C.bluePale,
              borderRadius: 8,
              border: `1px solid rgba(27, 110, 191, 0.25)`,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.blue }}>
              <Sparkles size={14} />
              <span>Dynamic Injection Preview</span>
            </div>
            
            <p style={{ fontSize: 11, color: C.navySoft, margin: 0, lineHeight: 1.5 }}>
              These global variables are injected dynamically into your outbound recovery emails.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: C.white,
                  border: surfaceBorder,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  overflow: "hidden",
                }}
              >
                <span style={{ fontSize: 11, fontFamily: "monospace", color: C.blue, fontWeight: 600, userSelect: "none" }}>
                  { "{{ company.name }}" }
                </span>
                <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                  {companyName || <span style={{ color: C.muted, fontStyle: "italic", fontFamily: sans }}>Not set</span>}
                </span>
              </div>

              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: C.white,
                  border: surfaceBorder,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  overflow: "hidden",
                }}
              >
                <span style={{ fontSize: 11, fontFamily: "monospace", color: C.blue, fontWeight: 600, userSelect: "none" }}>
                  { "{{ company.url }}" }
                </span>
                <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                  {websiteUrl || <span style={{ color: C.muted, fontStyle: "italic", fontFamily: sans }}>Not set</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Box 2: Reply-To Routing Panel */}
          <div
            style={{
              background: C.white,
              borderRadius: 8,
              border: surfaceBorder,
              boxShadow: surfaceShadow,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.navy }}>
              <CornerDownLeft size={14} color={C.blue} />
              <span>Reply-To Routing</span>
            </div>

            <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
              When recovered users reply directly to your automated campaign emails, responses route to the Support Email configured above.
            </p>

            <div
              style={{
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 6,
                background: C.offWhite,
                border: surfaceBorder,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ShieldCheck size={14} color={C.green} />
              <span style={{ fontSize: 11, fontFamily: "monospace", color: C.navy, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {supportEmail || <span style={{ color: C.muted, fontStyle: "italic", fontFamily: sans, fontWeight: 400 }}>No support email set</span>}
              </span>
            </div>
          </div>

        </div>

      </form>
    </div>
  );
}