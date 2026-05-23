"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, AlertTriangle } from "lucide-react";

interface DeveloperTabProps {
  initialApiKeyLast4: string | null;
  hasApiKey: boolean;
}

const buildMaskedKey = (last4: string | null) => (last4 ? `arcli_live_****${last4}` : "");

const extractKeyLast4 = (apiKey: string) => {
  const parts = apiKey.split("_");
  const secret = parts[parts.length - 1] || "";
  return secret.slice(-4);
};

export function DeveloperTab({ initialApiKeyLast4, hasApiKey: initialHasApiKey }: DeveloperTabProps) {
  const [apiKeyLast4, setApiKeyLast4] = useState(initialApiKeyLast4);
  const [hasApiKey, setHasApiKey] = useState(initialHasApiKey);
  const [fullApiKey, setFullApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const canReveal = Boolean(fullApiKey);
  const displayKey = showApiKey && fullApiKey ? fullApiKey : buildMaskedKey(apiKeyLast4);

  const handleRegenerate = async () => {
    if (hasApiKey && !confirm("Warning: Regenerating your API key will immediately break any active integrations. Proceed?")) {
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/settings/developer/regenerate", {
        method: "POST",
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to generate key");
      
      setFullApiKey(data.apiKey);
      setApiKeyLast4(extractKeyLast4(data.apiKey));
      setHasApiKey(true);
      setShowApiKey(true);
      toast({
        title: "API Key Generated",
        description: "Your new API key is ready to use.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
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
    toast({ title: "Copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Developer API</CardTitle>
        <CardDescription>
          Manage your Arcli API keys to send custom events and sync churn data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Active API Key</label>
          <div className="flex space-x-2">
            <Input 
              type={showApiKey ? "text" : "password"}
              readOnly 
              value={displayKey}
              placeholder="No API key generated yet"
              className="font-mono text-sm text-muted-foreground"
            />
            <Button 
              variant="outline" 
              onClick={copyToClipboard} 
              disabled={!fullApiKey}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowApiKey(!showApiKey)}
              disabled={!canReveal}
            >
              {showApiKey ? "Hide" : "Reveal"}
            </Button>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Roll API Key</p>
              <p className="text-sm text-muted-foreground flex items-center mt-1">
                <AlertTriangle className="h-4 w-4 mr-1 text-amber-500" />
                Invalidates your current key immediately.
              </p>
            </div>
            <Button 
              variant={hasApiKey ? "destructive" : "default"} 
              onClick={handleRegenerate} 
              disabled={isGenerating}
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {hasApiKey ? "Regenerate Key" : "Generate Key"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}