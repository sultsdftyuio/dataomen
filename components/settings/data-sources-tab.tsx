"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Database, Plug, Webhook, RefreshCw, Key } from "lucide-react";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

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
        // Simulated Server Action for Webhook Endpoint updating
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
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
          <Database className="h-5 w-5 text-[#1B6EBF]" /> System Integrations & API
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          Manage upstream billing connections, configure webhook endpoints, and provision API keys.
        </p>
      </div>

      <div className="space-y-8 max-w-4xl pb-24">
        
        {/* 1. Stripe Connection Container */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <Plug className="h-4 w-4 text-slate-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 tracking-tight">Billing Data Source</h3>
                <p className="text-sm text-slate-500 mt-0.5">Connect your Stripe account to ingest billing events and deterministic churn signals.</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-lg border border-slate-100 bg-slate-50/50 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Stripe Synchronizer</p>
                <p className="text-xs text-slate-500">
                  Automated ingestion is active and listening for Stripe Event Webhooks.
                </p>
              </div>
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm font-bold tracking-wide uppercase text-[10px] px-3 py-1">
                Connected
              </Badge>
            </div>
          </div>
          <div className="bg-slate-50/80 px-6 sm:px-8 py-4 border-t border-slate-100 flex justify-end">
            <Button variant="outline" className="h-9 text-sm shadow-sm bg-white font-medium text-slate-700 border-slate-200 hover:bg-slate-50">
              Manage Connection
            </Button>
          </div>
        </section>

        {/* 2. Webhooks Configuration Container */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <Webhook className="h-4 w-4 text-slate-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 tracking-tight">Webhook Endpoints</h3>
                <p className="text-sm text-slate-500 mt-0.5">Receive real-time programmatic alerts for recovered subscriptions and scoring thresholds.</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2.5">
                <Label htmlFor="webhook-url" className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Endpoint URL
                </Label>
                <Input
                  id="webhook-url"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.example.com/webhooks/arcli"
                  disabled={isPending}
                  className="font-mono text-sm bg-white border-slate-200 shadow-sm focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
                />
              </div>
              
              <div className="space-y-2.5">
                <Label htmlFor="webhook-secret" className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Signing Secret
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook-secret"
                    type={showSecret ? "text" : "password"}
                    value={webhookSecret}
                    readOnly
                    className="font-mono text-sm bg-slate-50/50 text-slate-600 border-slate-200 shadow-sm"
                  />
                  <Button 
                    variant="outline" 
                    className="w-10 px-0 shrink-0 bg-white border-slate-200 shadow-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    onClick={() => setShowSecret(!showSecret)}
                    aria-label={showSecret ? "Hide secret" : "Show secret"}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Use this cryptographic secret to verify the webhook payload signature originating from Arcli.
                </p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50/80 px-6 sm:px-8 py-4 border-t border-slate-100 flex items-center justify-between">
            <Button variant="ghost" disabled={!webhookUrl || isPending} className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Test Payload
            </Button>
            <Button 
              onClick={handleSaveEndpoint} 
              disabled={isPending}
              className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm h-9 px-5 text-sm font-medium transition-all active:scale-[0.98]"
            >
              {isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Configuration
            </Button>
          </div>
        </section>

        {/* 3. API Keys Native Embed */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 sm:p-8 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <Key className="h-4 w-4 text-slate-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 tracking-tight">API Keys</h3>
                <p className="text-sm text-slate-500 mt-0.5">Manage and rotate API keys for authenticating headless requests.</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 sm:p-8 bg-slate-50/30">
            {/* The ApiKeysManager renders naturally padded within its own container styling */}
            <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm">
              <ApiKeysManager />
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}