"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner"; // Assuming sonner for shadcn/ui toasts
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, EyeOff } from "lucide-react";

// In a real implementation, this is imported from your server actions file
// e.g., import { updateWebhookEndpoint } from "@/app/actions/webhooks";

export function DataSourcesTab({ 
  initialWebhookUrl = "", 
  webhookSecret = "whsec_..." 
}: { 
  initialWebhookUrl?: string;
  webhookSecret?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl);
  const [showSecret, setShowSecret] = useState(false);

  // Rule 18: Prefer Server Actions
  const handleSaveEndpoint = () => {
    if (!webhookUrl.startsWith("https://")) {
      toast.error("Invalid URL: Webhook endpoints must use HTTPS.");
      return;
    }

    startTransition(async () => {
      try {
        // ACTION: updateWebhookEndpoint(webhookUrl)
        // Rule 6: The server action MUST securely derive tenant_id from the 
        // Supabase session, never trusting a client-provided ID.
        
        // Simulating network request
        await new Promise((resolve) => setTimeout(resolve, 1000)); 
        toast.success("Webhook endpoint updated successfully.");
      } catch (error) {
        // Rule 17: Log for operators, clear messages for users
        toast.error("Failed to update webhook. Please try again.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Billing Data Source (Stripe) */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Data Source</CardTitle>
          <CardDescription>
            Connect your Stripe account to automatically ingest billing events, subscription changes, and churn signals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">Stripe Connection</p>
              <p className="text-sm text-muted-foreground">
                Currently connected to <span className="font-semibold text-foreground">acme_inc_stripe</span>
              </p>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              Connected
            </Badge>
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button variant="outline">Manage Connection</Button>
        </CardFooter>
      </Card>

      {/* Webhooks Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Endpoints</CardTitle>
          <CardDescription>
            Configure webhook endpoints to receive real-time alerts for recovered subscriptions and at-risk users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input
              id="webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://api.yourdomain.com/webhooks/arcli"
              disabled={isPending}
            />
            <p className="text-[0.8rem] text-muted-foreground">
              Endpoint must return a 2xx status code within 3 seconds.
            </p>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label htmlFor="webhook-secret">Signing Secret</Label>
            <div className="flex space-x-2">
              <Input
                id="webhook-secret"
                type={showSecret ? "text" : "password"}
                value={webhookSecret}
                readOnly
                className="font-mono text-sm"
              />
              <Button 
                variant="secondary" 
                size="icon"
                onClick={() => setShowSecret(!showSecret)}
                aria-label={showSecret ? "Hide secret" : "Show secret"}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Use this secret to verify the webhook payload signature. Protect it like a password.
            </p>
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4 justify-between">
          <Button variant="ghost" disabled={!webhookUrl || isPending}>
            Test Endpoint
          </Button>
          <Button onClick={handleSaveEndpoint} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Endpoint
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}