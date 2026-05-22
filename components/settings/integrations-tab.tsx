"use client";

import React, { useEffect, useRef, useState } from "react";
import { type User } from "@supabase/supabase-js";
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

interface IntegrationsTabProps {
  user: User;
  initialSettings: {
    integrations: {
      stripeConnected: boolean;
      emailProviderStatus: boolean;
      apiKey: string;
      keyLastUpdated: string;
    };
  };
}

export default function IntegrationsTab({ initialSettings }: IntegrationsTabProps) {
  const [apiKey, setApiKey] = useState(initialSettings.integrations.apiKey);
  const [keyLastUpdated, setKeyLastUpdated] = useState<string | null>(initialSettings.integrations.keyLastUpdated);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);

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
      setApiKey(data.apiKey);
      setKeyLastUpdated("Just now");
      setShowApiKey(true);
      toast({ title: "Key Regenerated", description: "Your new API token is ready to use." });
    } catch (error: any) {
      toast({ title: "Security Action Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text || text === "No active key") return;
    navigator.clipboard.writeText(text);
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
                        initialSettings.integrations.stripeConnected ? "bg-[#635BFF]/10 text-[#635BFF]" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Stripe Billing</h3>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider border flex items-center gap-1.5 ${
                      initialSettings.integrations.stripeConnected
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        initialSettings.integrations.stripeConnected ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    {initialSettings.integrations.stripeConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  Required to detect lifecycle events, failed payments, and MRR metrics securely.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  variant={initialSettings.integrations.stripeConnected ? "outline" : "default"}
                  className={`w-full ${
                    !initialSettings.integrations.stripeConnected && "bg-[#635BFF] hover:bg-[#5249ea] text-white"
                  }`}
                >
                  {initialSettings.integrations.stripeConnected ? "Manage Connection" : "Connect Stripe"}
                </Button>
              </div>
            </div>

            <div className="p-6 border border-slate-200 bg-white rounded-xl shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        initialSettings.integrations.emailProviderStatus ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <Send className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Email Delivery</h3>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider border flex items-center gap-1.5 ${
                      initialSettings.integrations.emailProviderStatus
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        initialSettings.integrations.emailProviderStatus ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    {initialSettings.integrations.emailProviderStatus ? "Authenticated" : "Required"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  Authenticate your domain via Resend/Sendgrid to enable outbound recovery queues.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  variant={initialSettings.integrations.emailProviderStatus ? "outline" : "default"}
                  className={`w-full ${
                    !initialSettings.integrations.emailProviderStatus && "bg-[#0A192F] hover:bg-slate-800 text-white"
                  }`}
                >
                  {initialSettings.integrations.emailProviderStatus ? "DNS Settings" : "Configure Domain"}
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
                apiKey === "No active key"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${apiKey === "No active key" ? "bg-amber-500" : "bg-emerald-500"}`} />
              {apiKey === "No active key" ? "Disabled" : "Active"}
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
                  value={apiKey}
                  type={showApiKey ? "text" : "password"}
                  className="font-mono text-sm tracking-widest bg-white border-slate-200 text-[#0A192F] h-12 shadow-sm pr-16 w-full"
                />
                <button
                  type="button"
                  aria-label={showApiKey ? "Hide API key" : "Reveal API key"}
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 rounded uppercase tracking-wider transition-colors"
                >
                  {showApiKey ? "Hide" : "Reveal"}
                </button>
              </div>
              <Button
                variant="outline"
                onClick={() => copyToClipboard(apiKey)}
                disabled={apiKey === "No active key"}
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
                Last Generated: <span className="text-[#0A192F] font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded">{keyLastUpdated}</span>
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
