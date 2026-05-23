"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, CreditCard, RefreshCw, Send, ShieldAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { formatKeyLastUpdated } from "@/lib/settings/format";
import type { SettingsIntegrations } from "@/lib/settings/types";

interface IntegrationsTabProps {
  integrations: SettingsIntegrations;
}

const buildMaskedKey = (last4: string | null) => (last4 ? `arcli_live_****${last4}` : "");

const extractKeyLast4 = (apiKey: string) => {
  const parts = apiKey.split("_");
  const secret = parts[parts.length - 1] || "";
  return secret.slice(-4);
};

export default function IntegrationsTab({ integrations }: IntegrationsTabProps) {
  const [apiKeyLast4, setApiKeyLast4] = useState(integrations.apiKeyLast4);
  const [hasApiKey, setHasApiKey] = useState(integrations.hasApiKey);
  const [keyLastUpdated, setKeyLastUpdated] = useState(integrations.keyLastUpdated);
  const [fullApiKey, setFullApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const canReveal = Boolean(fullApiKey);
  const displayKey = showApiKey && fullApiKey ? fullApiKey : buildMaskedKey(apiKeyLast4);
  const keyLastUpdatedLabel = formatKeyLastUpdated(keyLastUpdated);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleRegenerateApiKey = async () => {
    setIsRegeneratingKey(true);
    try {
      const res = await fetch("/api/settings/developer/regenerate", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to regenerate key");
      }
      const data = await res.json();
      setFullApiKey(data.apiKey);
      setApiKeyLast4(extractKeyLast4(data.apiKey));
      setHasApiKey(true);
      setKeyLastUpdated(new Date().toISOString());
      setShowApiKey(true);
      toast({ title: "Key Regenerated", description: "Your new API token is ready to use." });
    } catch (error: any) {
      toast({ title: "Security Action Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const copyToClipboard = () => {
    if (!fullApiKey) {
      toast({
        title: "Key not available",
        description: "API keys are only shown once. Regenerate to copy a new key.",
        variant: "destructive",
      });
      return;
    }
    navigator.clipboard.writeText(fullApiKey);
    setHasCopiedKey(true);
    toast({ title: "Token Copied", description: "Securely copied to clipboard." });
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => setHasCopiedKey(false), 2000);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="px-8 lg:px-12 py-8 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <h2 className="text-xl font-semibold text-[#0A192F]">Data & Integrations</h2>
        <p className="text-sm text-slate-500 mt-1">Connect the core systems required for Detect and Recover pipelines.</p>
      </div>

      <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-10">
        <div className="space-y-4 max-w-4xl">
          <Label className="text-xs font-bold tracking-wide text-slate-500 uppercase">Core Infrastructure</Label>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="p-6 border border-slate-200 bg-white rounded-xl shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        integrations.stripeConnected ? "bg-[#635BFF]/10 text-[#635BFF]" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Stripe Billing</h3>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider border flex items-center gap-1.5 ${
                      integrations.stripeConnected
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        integrations.stripeConnected ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    {integrations.stripeConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  Required to detect lifecycle events, failed payments, and MRR metrics securely.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  variant={integrations.stripeConnected ? "outline" : "default"}
                  className={`w-full ${
                    !integrations.stripeConnected && "bg-[#635BFF] hover:bg-[#5249ea] text-white"
                  }`}
                >
                  {integrations.stripeConnected ? "Manage Connection" : "Connect Stripe"}
                </Button>
              </div>
            </div>

            <div className="p-6 border border-slate-200 bg-white rounded-xl shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        integrations.emailProviderStatus ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <Send className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Email Delivery</h3>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider border flex items-center gap-1.5 ${
                      integrations.emailProviderStatus
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        integrations.emailProviderStatus ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    {integrations.emailProviderStatus ? "Authenticated" : "Required"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  Authenticate your domain via Resend/Sendgrid to enable outbound recovery queues.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  variant={integrations.emailProviderStatus ? "outline" : "default"}
                  className={`w-full ${
                    !integrations.emailProviderStatus && "bg-[#0A192F] hover:bg-slate-800 text-white"
                  }`}
                >
                  {integrations.emailProviderStatus ? "DNS Settings" : "Configure Domain"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 max-w-4xl">
          <div className="flex justify-between items-center">
            <Label className="text-xs font-bold tracking-wide text-slate-500 uppercase">Custom Event Ingestion (API)</Label>
            <div
              className={`flex items-center gap-2 px-3 py-1 text-[10px] font-bold tracking-wide uppercase rounded-full border shadow-sm ${
                !hasApiKey
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${!hasApiKey ? "bg-amber-500" : "bg-emerald-500"}`} />
              {!hasApiKey ? "Disabled" : "Active"}
            </div>
          </div>

          <div className="p-6 border border-slate-200 bg-slate-50/80 rounded-xl space-y-5 shadow-inner">
            <p className="text-sm text-slate-600 mb-2">
              Use this bearer token to push custom usage metrics and in-app activity to the churn scoring engine.
            </p>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Input
                  readOnly
                  value={displayKey}
                  placeholder="No active key"
                  type={showApiKey ? "text" : "password"}
                  className="font-mono text-sm tracking-widest bg-white border-slate-200 text-[#0A192F] h-12 shadow-sm pr-16 w-full"
                />
                <button
                  type="button"
                  aria-label={showApiKey ? "Hide API key" : "Reveal API key"}
                  onClick={() => setShowApiKey(!showApiKey)}
                  disabled={!canReveal}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 rounded uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {showApiKey ? "Hide" : "Reveal"}
                </button>
              </div>
              <Button
                variant="outline"
                onClick={copyToClipboard}
                disabled={!fullApiKey}
                aria-label="Copy API key"
                className={`h-12 px-5 border-slate-200 shadow-sm transition-all duration-300 ${
                  hasCopiedKey ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                }`}
              >
                {hasCopiedKey ? <Check className="h-5 w-5 mr-2" /> : <Copy className="h-5 w-5 mr-2" />}
                {hasCopiedKey ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="flex items-center justify-between text-xs font-medium border-t border-slate-200 pt-4">
              <span className="text-slate-500 flex items-center gap-2">
                Last Generated:{" "}
                <span className="text-[#0A192F] font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded">
                  {keyLastUpdatedLabel}
                </span>
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRegeneratingKey}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs font-semibold px-3 h-8 transition-colors"
                  >
                    {isRegeneratingKey ? <RefreshCw className="h-3 w-3 mr-2 animate-spin" /> : <ShieldAlert className="h-3 w-3 mr-2" />}
                    Roll Key
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regenerate API key?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Regenerating this key will instantly break any existing Custom API integrations. Proceed only if you can update
                      downstream systems.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRegenerateApiKey} disabled={isRegeneratingKey}>
                      {isRegeneratingKey ? "Regenerating..." : "Regenerate Key"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
