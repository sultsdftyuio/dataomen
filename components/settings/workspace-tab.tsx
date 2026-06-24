"use client";

import React, { useState, useTransition } from "react";
import { toast } from "@/components/ui/use-toast";
import { 
  Building2, 
  Mail, 
  Globe, 
  User, 
  CreditCard, 
  CheckCircle2, 
  TrendingUp, 
  RefreshCw, 
  Save, 
  Code, 
  Info 
} from "lucide-react";

// Centralized design tokens
import { C } from "@/lib/tokens";

interface WorkspaceSettingsProps {
  initialName?: string;
  initialUserEmail?: string;
  initialCompanyName?: string;
  initialSupportEmail?: string;
  initialWebsite?: string;
  planName?: string;
  planStatus?: "active" | "past_due" | "canceled";
  monitoredMrr?: number;
  mrrLimit?: number;
}

export default function WorkspaceSettingsPage({
  initialName = "Justin Mason",
  initialUserEmail = "justin@example.com",
  initialCompanyName = "",
  initialSupportEmail = "",
  initialWebsite = "",
  planName = "Growth Tier",
  planStatus = "active",
  monitoredMrr = 42500,
  mrrLimit = 100000,
}: WorkspaceSettingsProps) {
  const [isPending, startTransition] = useTransition();
  
  // User State
  const [userName, setUserName] = useState(initialName);
  const [userEmail, setUserEmail] = useState(initialUserEmail);
  
  // Workspace State
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [supportEmail, setSupportEmail] = useState(initialSupportEmail);
  const [website, setWebsite] = useState(initialWebsite);

  // Unified styling constants
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  // Derived metrics
  const mrrPercentage = Math.min((monitoredMrr / mrrLimit) * 100, 100);
  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const handleSave = () => {
    startTransition(async () => {
      try {
        // Simulate Supabase RPC transaction (Arcli Rule 1 & 6)
        await new Promise((resolve) => setTimeout(resolve, 800));
        toast({
          title: "Configuration Saved",
          description: "Workspace identity and user details have been updated."
        });
      } catch (error) {
        toast({
          title: "Update Failed",
          description: "A system error prevented saving your configuration.",
          variant: "destructive"
        });
      }
    });
  };

  const handleManageBilling = () => {
    startTransition(async () => {
      // Simulate Stripe Customer Portal redirect (Arcli Rule 2)
      await new Promise((resolve) => setTimeout(resolve, 600));
      toast({
        title: "Redirecting to Stripe",
        description: "Opening your secure billing portal..."
      });
    });
  };

  return (
    <div style={{ fontFamily: sans, maxWidth: 1100, margin: "0 auto", padding: "32px 24px", animation: "fadeIn 0.3s ease-in" }}>
      
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 className="pfd" style={{ fontSize: 24, fontWeight: 600, color: C.navy, margin: "0 0 8px 0" }}>
          Workspace Settings
        </h2>
        <p style={{ fontSize: 14, color: C.muted, margin: 0, lineHeight: 1.5, maxWidth: 600 }}>
          Manage your user profile, global workspace identity, and review your active recovery capacity.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 32, alignItems: "start" }}>
        
        {/* ── Main Column: Forms & Data ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          
          {/* 1. Workspace Identity */}
          <section style={{ background: C.white, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, overflow: "hidden" }}>
            <div style={{ padding: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <Building2 size={20} color={C.navySoft} />
                <h3 className="pfd" style={{ fontSize: 18, fontWeight: 600, color: C.navy, margin: 0 }}>Workspace Identity</h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label htmlFor="companyName" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.navySoft, marginBottom: 8 }}>
                    Company Name
                  </label>
                  <div style={{ position: "relative" }}>
                    <Building2 size={16} color={C.muted} style={{ position: "absolute", left: 14, top: 12 }} />
                    <input
                      id="companyName"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={isPending}
                      placeholder="e.g. Acme Corp"
                      style={{ width: "100%", padding: "10px 14px 10px 40px", borderRadius: 6, border: surfaceBorder, fontSize: 14, color: C.navy, outline: "none", boxShadow: surfaceShadow }}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="supportEmail" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.navySoft, marginBottom: 8 }}>
                    Support / Reply-To Email
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail size={16} color={C.muted} style={{ position: "absolute", left: 14, top: 12 }} />
                    <input
                      id="supportEmail"
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      disabled={isPending}
                      placeholder="e.g. support@acmecorp.com"
                      style={{ width: "100%", padding: "10px 14px 10px 40px", borderRadius: 6, border: surfaceBorder, fontSize: 14, color: C.navy, outline: "none", boxShadow: surfaceShadow }}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="website" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.navySoft, marginBottom: 8 }}>
                    Website URL
                  </label>
                  <div style={{ position: "relative" }}>
                    <Globe size={16} color={C.muted} style={{ position: "absolute", left: 14, top: 12 }} />
                    <input
                      id="website"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      disabled={isPending}
                      placeholder="https://acmecorp.com"
                      style={{ width: "100%", padding: "10px 14px 10px 40px", borderRadius: 6, border: surfaceBorder, fontSize: 14, color: C.navy, outline: "none", boxShadow: surfaceShadow }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 2. User Profile */}
          <section style={{ background: C.white, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, overflow: "hidden" }}>
            <div style={{ padding: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <User size={20} color={C.navySoft} />
                <h3 className="pfd" style={{ fontSize: 18, fontWeight: 600, color: C.navy, margin: 0 }}>User Profile</h3>
              </div>
              
              <div style={{ display: "flex", gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="userName" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.navySoft, marginBottom: 8 }}>
                    Full Name
                  </label>
                  <input
                    id="userName"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    disabled={isPending}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: surfaceBorder, fontSize: 14, color: C.navy, outline: "none", boxShadow: surfaceShadow }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="userEmail" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.navySoft, marginBottom: 8 }}>
                    Authentication Email
                  </label>
                  <input
                    id="userEmail"
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    disabled={isPending}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: surfaceBorder, fontSize: 14, color: C.navy, outline: "none", boxShadow: surfaceShadow, background: C.offWhite, cursor: "not-allowed" }}
                    readOnly
                  />
                </div>
              </div>
            </div>
            <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "16px 32px", borderTop: surfaceBorder, display: "flex", justifyContent: "flex-end" }}>
              <button 
                onClick={handleSave} 
                disabled={isPending}
                style={{ height: 36, padding: "0 20px", background: C.navy, color: C.white, borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: isPending ? 0.8 : 1 }}
              >
                {isPending && <RefreshCw size={14} className="animate-spin" />}
                <Save size={16} /> Save Changes
              </button>
            </div>
          </section>

          {/* 3. Workspace Plan */}
          <section style={{ background: C.white, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, overflow: "hidden" }}>
            <div style={{ padding: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <CreditCard size={20} color={C.navySoft} />
                  <div>
                    <h3 className="pfd" style={{ fontSize: 18, fontWeight: 600, color: C.navy, margin: 0 }}>Active Plan</h3>
                  </div>
                </div>
                {planStatus === "active" && (
                  <span style={{ background: C.greenPale, color: C.green, border: `1px solid rgba(16,185,129,0.2)`, padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4, boxShadow: surfaceShadow }}>
                    <CheckCircle2 size={14} /> Active
                  </span>
                )}
              </div>

              <div style={{ padding: 24, borderRadius: 8, border: surfaceBorder, background: C.offWhite }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft, margin: "0 0 4px 0" }}>Current Tier</p>
                    <p className="pfd" style={{ fontSize: 24, fontWeight: 600, color: C.navy, margin: 0 }}>{planName}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: C.muted, margin: "0 0 4px 0" }}>Monitored MRR</p>
                    <p style={{ fontSize: 16, fontWeight: 600, color: C.navy, margin: 0 }}>
                      {formatCurrency(monitoredMrr)} <span style={{ color: C.muted, fontSize: 14, fontWeight: 400 }}>/ {formatCurrency(mrrLimit)}</span>
                    </p>
                  </div>
                </div>

                <div style={{ width: "100%", height: 8, background: C.rule, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ 
                    width: `${mrrPercentage}%`, 
                    height: "100%", 
                    background: mrrPercentage > 90 ? "#ef4444" : C.blue, 
                    transition: "width 0.5s ease-in-out"
                  }} />
                </div>
                <p style={{ fontSize: 13, color: C.muted, marginTop: 12, margin: "12px 0 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={16} color={C.navySoft} />
                  Using <strong>{mrrPercentage.toFixed(1)}%</strong> of recovery monitoring capacity.
                </p>
              </div>
            </div>
            
            <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "16px 32px", borderTop: surfaceBorder, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                Need higher throughput? Contact support.
              </p>
              <button 
                onClick={handleManageBilling}
                disabled={isPending}
                style={{ height: 36, padding: "0 16px", background: C.white, border: surfaceBorder, borderRadius: 6, color: C.navySoft, fontSize: 13, fontWeight: 500, cursor: isPending ? "not-allowed" : "pointer", boxShadow: surfaceShadow, display: "flex", alignItems: "center", gap: 8 }}
              >
                {isPending ? <RefreshCw size={14} className="animate-spin" /> : <CreditCard size={14} />}
                Manage Billing
              </button>
            </div>
          </section>

        </div>

        {/* ── Sidebar Column: Context & Metadata ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "sticky", top: 32 }}>
          
          <div style={{ background: "rgba(239, 246, 255, 0.4)", border: "1px solid #DBEAFE", borderRadius: 8, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Code size={18} color={C.blue} />
              <h4 style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: 0 }}>Dynamic Injection</h4>
            </div>
            <p style={{ fontSize: 13, color: C.navySoft, lineHeight: 1.5, margin: "0 0 16px 0" }}>
              These global variables are injected dynamically into your outbound recovery emails.
            </p>
            <div style={{ background: C.white, border: surfaceBorder, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: C.blue, background: "#EFF6FF", padding: "2px 6px", borderRadius: 4 }}>
                  {"{{ company.name }}"}
                </span>
                <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
                  {companyName || "Not set"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: C.blue, background: "#EFF6FF", padding: "2px 6px", borderRadius: 4 }}>
                  {"{{ company.url }}"}
                </span>
                <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
                  {website || "Not set"}
                </span>
              </div>
            </div>
          </div>

          <div style={{ background: C.offWhite, border: surfaceBorder, borderRadius: 8, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Info size={18} color={C.muted} />
              <h4 style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: 0 }}>Reply-To Routing</h4>
            </div>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
              When recovered users reply directly to your automated campaign emails, their responses will automatically route to the <strong style={{ color: C.navy, fontWeight: 600 }}>Support Email</strong> configured in your Workspace Identity.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}