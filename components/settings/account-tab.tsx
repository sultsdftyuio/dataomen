"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/use-toast";
import { User, CreditCard, Shield, RefreshCw, Mail, CheckCircle2, TrendingUp } from "lucide-react";

// Centralized design tokens
import { C } from "@/lib/tokens";

interface UserPlanProps {
  initialName?: string;
  initialEmail?: string;
  planName?: string;
  planStatus?: "active" | "past_due" | "canceled";
  monitoredMrr?: number;
  mrrLimit?: number;
}

export function AccountPlanTab({
  initialName = "Justin Mason",
  initialEmail = "justin@example.com",
  planName = "Growth Tier",
  planStatus = "active",
  monitoredMrr = 42500,
  mrrLimit = 100000,
}: UserPlanProps) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);

  // Unified styling constants matching the Arcli design system
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  // Derived metrics for UI
  const mrrPercentage = Math.min((monitoredMrr / mrrLimit) * 100, 100);
  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const handleUpdateProfile = () => {
    if (!name || !email) {
      toast({
        title: "Validation Error",
        description: "Name and email address are required fields.",
        variant: "destructive"
      });
      return;
    }

    startTransition(async () => {
      try {
        // Simulate async Server Action (Rule 1: Core Identity Boundary)
        await new Promise((resolve) => setTimeout(resolve, 800));
        toast({
          title: "Profile Updated",
          description: "Your workspace identity details have been saved."
        });
      } catch (error) {
        toast({
          title: "Update Failed",
          description: "A system error prevented updating your profile.",
          variant: "destructive"
        });
      }
    });
  };

  const handleManageBilling = () => {
    startTransition(async () => {
      // Simulate Stripe Customer Portal redirect (Rule 2: Async Enrichment Boundary)
      await new Promise((resolve) => setTimeout(resolve, 600));
      toast({
        title: "Redirecting to Stripe",
        description: "Opening your secure billing portal..."
      });
    });
  };

  return (
    <div style={{ fontFamily: sans, display: "flex", flexDirection: "column", height: "100%", animation: "fadeIn 0.3s ease-in" }}>
      
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 className="pfd" style={{ fontSize: 20, fontWeight: 600, color: C.navy, display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px 0" }}>
          <User size={20} color={C.blue} /> Account & Workspace
        </h2>
        <p style={{ fontSize: 14, color: C.navySoft, margin: 0, lineHeight: 1.5 }}>
          Manage your personal identity, workspace security, and subscription billing limits.
        </p>
      </div>

      <div style={{ maxWidth: 896, paddingBottom: 96, display: "flex", flexDirection: "column", gap: 32 }}>
        
        {/* 1. User Profile Container */}
        <div style={{ background: C.white, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, overflow: "hidden" }}>
          <div style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ padding: 10, background: C.offWhite, borderRadius: 8, border: surfaceBorder, display: "flex" }}>
                <User size={16} color={C.navySoft} />
              </div>
              <div>
                <h3 className="pfd" style={{ fontSize: 16, fontWeight: 600, color: C.navy, margin: "0 0 4px 0" }}>Profile Details</h3>
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Update the primary contact information for this workspace.</p>
              </div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="user-name" style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft, marginBottom: 8 }}>
                    Full Name
                  </label>
                  <input
                    id="user-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isPending}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: surfaceBorder, fontSize: 14, color: C.navy, outline: "none", boxShadow: surfaceShadow }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="user-email" style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft, marginBottom: 8 }}>
                    Email Address
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail size={16} color={C.muted} style={{ position: "absolute", left: 14, top: 12 }} />
                    <input
                      id="user-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isPending}
                      style={{ width: "100%", padding: "10px 14px 10px 40px", borderRadius: 6, border: surfaceBorder, fontSize: 14, color: C.navy, outline: "none", boxShadow: surfaceShadow }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "16px 32px", borderTop: surfaceBorder, display: "flex", justifyContent: "flex-end" }}>
            <button 
              onClick={handleUpdateProfile} 
              disabled={isPending}
              style={{ height: 36, padding: "0 20px", background: C.navy, color: C.white, borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: isPending ? 0.8 : 1 }}
            >
              {isPending && <RefreshCw size={14} className="animate-spin" />}
              Save Profile
            </button>
          </div>
        </div>

        {/* 2. Workspace Plan Container */}
        <div style={{ background: C.white, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, overflow: "hidden" }}>
          <div style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ padding: 10, background: C.offWhite, borderRadius: 8, border: surfaceBorder, display: "flex" }}>
                  <CreditCard size={16} color={C.navySoft} />
                </div>
                <div>
                  <h3 className="pfd" style={{ fontSize: 16, fontWeight: 600, color: C.navy, margin: "0 0 4px 0" }}>Workspace Plan</h3>
                  <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Review your recovery capacity and active monitoring limits.</p>
                </div>
              </div>
              {planStatus === "active" && (
                <span style={{ background: C.greenPale, color: C.green, border: `1px solid rgba(16,185,129,0.2)`, padding: "4px 12px", borderRadius: 16, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4, boxShadow: surfaceShadow }}>
                  <CheckCircle2 size={12} /> Active
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24, borderRadius: 8, border: surfaceBorder, background: C.offWhite }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft, margin: "0 0 8px 0" }}>Current Tier</p>
                  <p className="pfd" style={{ fontSize: 24, fontWeight: 600, color: C.navy, margin: 0 }}>{planName}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 13, color: C.muted, margin: "0 0 4px 0" }}>Monitored MRR</p>
                  <p style={{ fontSize: 16, fontWeight: 600, color: C.navy, margin: 0 }}>
                    {formatCurrency(monitoredMrr)} <span style={{ color: C.muted, fontSize: 14, fontWeight: 400 }}>/ {formatCurrency(mrrLimit)}</span>
                  </p>
                </div>
              </div>

              {/* Progress Bar indicating usage */}
              <div>
                <div style={{ width: "100%", height: 8, background: C.rule, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ 
                    width: `${mrrPercentage}%`, 
                    height: "100%", 
                    background: mrrPercentage > 90 ? "#ef4444" : C.blue, 
                    borderRadius: 4,
                    transition: "width 0.5s ease-in-out"
                  }} />
                </div>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 10, margin: "10px 0 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={14} color={C.navySoft} />
                  You are currently using <strong>{mrrPercentage.toFixed(1)}%</strong> of your plan's recovery monitoring capacity.
                </p>
              </div>
            </div>
          </div>
          
          <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "16px 32px", borderTop: surfaceBorder, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              Need higher throughput? Contact support for custom enterprise limits.
            </p>
            <button 
              onClick={handleManageBilling}
              disabled={isPending}
              style={{ height: 36, padding: "0 16px", background: C.white, border: surfaceBorder, borderRadius: 6, color: C.navySoft, fontSize: 13, fontWeight: 500, cursor: isPending ? "not-allowed" : "pointer", boxShadow: surfaceShadow, display: "flex", alignItems: "center", gap: 8 }}
            >
              {isPending && <RefreshCw size={14} className="animate-spin" />}
              Manage Billing
            </button>
          </div>
        </div>

        {/* 3. Security Quick Settings (Adhering to Constitution Rule 6: Tenant Isolation/Security) */}
        <div style={{ background: C.white, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, overflow: "hidden" }}>
          <div style={{ padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ padding: 10, background: C.offWhite, borderRadius: 8, border: surfaceBorder, display: "flex" }}>
                <Shield size={16} color={C.navySoft} />
              </div>
              <div>
                <h3 className="pfd" style={{ fontSize: 16, fontWeight: 600, color: C.navy, margin: "0 0 4px 0" }}>Security & Authentication</h3>
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Configure Two-Factor Authentication (2FA) and manage active sessions.</p>
              </div>
            </div>
            <button style={{ height: 36, padding: "0 16px", background: C.offWhite, border: surfaceBorder, borderRadius: 6, color: C.navySoft, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              Configure Security
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}