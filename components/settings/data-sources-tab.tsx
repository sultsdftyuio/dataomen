"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/use-toast";
import { Eye, EyeOff, Database, Plug, Webhook, RefreshCw } from "lucide-react";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";
import { IntegrationGuide } from "@/components/settings/integration-guide";

// Import your centralized design tokens
import { C } from "@/lib/tokens";

export function DataSourcesTab({ 
  initialWebhookUrl = "", 
  webhookSecret = "whsec_arcli_..." 
}: { 
  initialWebhookUrl?: string;
  webhookSecret?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl);
  const [showSecret, setShowSecret] = useState(false);

  // Unified styling constants matching your design system
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  const handleSaveEndpoint = () => {
    if (webhookUrl && !webhookUrl.startsWith("https://")) {
      toast({ 
        title: "Security Exception", 
        description: "Webhook endpoints must use HTTPS to enforce secure delivery payloads.", 
        variant: "destructive" 
      });
      return;
    }

    startTransition(async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 800)); 
        toast({ 
          title: "Configuration Saved", 
          description: "Webhook endpoint definitions have been successfully updated." 
        });
      } catch (error) {
        toast({ 
          title: "Operation Failed", 
          description: "A system error prevented updating the webhook configuration.", 
          variant: "destructive" 
        });
      }
    });
  };

  return (
    <div style={{ fontFamily: sans, display: "flex", flexDirection: "column", height: "100%", animation: "fadeIn 0.3s ease-in" }}>
      
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 className="pfd" style={{ fontSize: 20, fontWeight: 600, color: C.navy, display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px 0" }}>
          <Database size={20} color={C.blue} /> System Integrations & API
        </h2>
        <p style={{ fontSize: 14, color: C.navySoft, margin: 0, lineHeight: 1.5 }}>
          Manage upstream billing connections, configure webhook endpoints, and provision API keys.
        </p>
      </div>

      <div style={{ maxWidth: 896, paddingBottom: 96, display: "flex", flexDirection: "column", gap: 32 }}>
        
        {/* 1. Stripe Connection Container */}
        <div style={{ background: C.white, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, overflow: "hidden" }}>
          <div style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ padding: 10, background: C.offWhite, borderRadius: 8, border: surfaceBorder, display: "flex" }}>
                <Plug size={16} color={C.navySoft} />
              </div>
              <div>
                <h3 className="pfd" style={{ fontSize: 16, fontWeight: 600, color: C.navy, margin: "0 0 4px 0" }}>Billing Data Source</h3>
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Connect your Stripe account to ingest billing events and deterministic churn signals.</p>
              </div>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "space-between", padding: 20, borderRadius: 8, border: surfaceBorder, background: C.offWhite }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, margin: "0 0 4px 0" }}>Stripe Synchronizer</p>
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Automated ingestion is active and listening for Stripe Event Webhooks.</p>
              </div>
              <span style={{ background: C.greenPale, color: C.green, border: `1px solid rgba(16,185,129,0.2)`, padding: "4px 12px", borderRadius: 16, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", boxShadow: surfaceShadow }}>
                Connected
              </span>
            </div>
          </div>
          <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "16px 32px", borderTop: surfaceBorder, display: "flex", justifyContent: "flex-end" }}>
            <button style={{ height: 36, padding: "0 16px", background: C.white, border: surfaceBorder, borderRadius: 6, color: C.navySoft, fontSize: 13, fontWeight: 500, cursor: "pointer", boxShadow: surfaceShadow }}>
              Manage Connection
            </button>
          </div>
        </div>

        {/* 2. Webhooks Configuration Container */}
        <div style={{ background: C.white, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow, overflow: "hidden" }}>
          <div style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
              <div style={{ padding: 10, background: C.offWhite, borderRadius: 8, border: surfaceBorder, display: "flex" }}>
                <Webhook size={16} color={C.navySoft} />
              </div>
              <div>
                <h3 className="pfd" style={{ fontSize: 16, fontWeight: 600, color: C.navy, margin: "0 0 4px 0" }}>Webhook Endpoints</h3>
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Receive real-time programmatic alerts for recovered subscriptions and scoring thresholds.</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <label htmlFor="webhook-url" style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft, marginBottom: 8 }}>
                  Endpoint URL
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.example.com/webhooks/arcli"
                  disabled={isPending}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: surfaceBorder, fontSize: 14, fontFamily: "monospace", color: C.navy, outline: "none", boxShadow: surfaceShadow }}
                />
              </div>
              
              <div>
                <label htmlFor="webhook-secret" style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft, marginBottom: 8 }}>
                  Signing Secret
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    id="webhook-secret"
                    type={showSecret ? "text" : "password"}
                    value={webhookSecret}
                    readOnly
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: surfaceBorder, background: C.offWhite, fontSize: 14, fontFamily: "monospace", color: C.navySoft, outline: "none", boxShadow: surfaceShadow }}
                  />
                  <button 
                    onClick={() => setShowSecret(!showSecret)}
                    style={{ width: 40, height: 40, flexShrink: 0, background: C.white, border: surfaceBorder, borderRadius: 6, color: C.navySoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: surfaceShadow }}
                  >
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 6, margin: "6px 0 0 0" }}>
                  Use this cryptographic secret to verify the webhook payload signature originating from Arcli.
                </p>
              </div>
            </div>
          </div>
          
          <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "16px 32px", borderTop: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button disabled={!webhookUrl || isPending} style={{ background: "transparent", border: "none", color: (!webhookUrl || isPending) ? C.faint : C.navySoft, fontSize: 13, fontWeight: 500, cursor: (!webhookUrl || isPending) ? "not-allowed" : "pointer" }}>
              Test Payload
            </button>
            <button 
              onClick={handleSaveEndpoint} 
              disabled={isPending}
              style={{ height: 36, padding: "0 20px", background: C.navy, color: C.white, borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: isPending ? 0.8 : 1 }}
            >
              {isPending && <RefreshCw size={14} className="animate-spin" />}
              Save Configuration
            </button>
          </div>
        </div>

        {/* 3. API Keys Native Embed */}
        <ApiKeysManager />

        {/* 4. The New Integration Guide */}
        <IntegrationGuide />

      </div>
    </div>
  );
}