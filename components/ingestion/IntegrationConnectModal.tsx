// components/integrations/IntegrationConnectModal.tsx

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plug, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Represents the available integrations in your platform
const AVAILABLE_INTEGRATIONS = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Sync payments, subscriptions, and MRR data in real-time.",
    icon: "💳",
    color: "bg-indigo-500",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Analyze orders, customer LTV, and inventory levels.",
    icon: "🛍️",
    color: "bg-emerald-500",
  }
];

export function IntegrationConnectModal() {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleConnect = async (integrationId: string) => {
    setIsLoading(integrationId);
    
    try {
      // 1. Ask the backend for the secure, tenant-specific OAuth URL
      const response = await fetch(`/api/integrations/${integrationId}/oauth-url`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          // Note: In production, include your auth headers (e.g., Bearer token or rely on Next.js session cookies)
        },
      });

      if (!response.ok) {
        throw new Error("Failed to generate secure connection link.");
      }

      const data = await response.json();
      
      // 2. Redirect the user to the SaaS provider's OAuth consent screen
      if (data.oauth_url) {
        window.location.href = data.oauth_url;
      } else {
        throw new Error("Invalid redirect URL received.");
      }
      
    } catch (error: any) {
      setIsLoading(null);
      toast({
        title: "Connection Error",
        description: error.message || "Could not connect to the provider. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plug className="w-4 h-4" /> Connect Data Source
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Connect an Integration</DialogTitle>
          <DialogDescription>
            Securely authenticate your SaaS platforms to enable Zero-ETL analytics.
            We request read-only access and strictly encrypt all credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {AVAILABLE_INTEGRATIONS.map((integration) => (
            <div 
              key={integration.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 flex items-center justify-center rounded-md text-xl text-white ${integration.color}`}>
                  {integration.icon}
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{integration.name}</h4>
                  <p className="text-xs text-slate-500">{integration.description}</p>
                </div>
              </div>

              <Button 
                variant={isLoading === integration.id ? "secondary" : "default"}
                size="sm"
                onClick={() => handleConnect(integration.id)}
                disabled={isLoading !== null}
              >
                {isLoading === integration.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </div>
          ))}
        </div>
        
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mt-2">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> AES-256 Encryption
          <AlertCircle className="w-3 h-3 ml-2 text-indigo-500" /> Read-Only Access
        </div>
      </DialogContent>
    </Dialog>
  );
}