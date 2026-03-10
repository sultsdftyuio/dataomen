"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Check, Zap, HardDrive, Activity, Loader2 } from "lucide-react";

// --- TypeScript Interfaces ---
interface UsageMetrics {
  subscription_tier: "FREE" | "PRO" | "ENTERPRISE";
  current_storage_mb: number;
  max_storage_mb: number;
  current_month_queries: number;
  monthly_query_limit: number;
}

export default function BillingPage() {
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    fetchUsageMetrics();
  }, []);

  const fetchUsageMetrics = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // In a real app, this would hit your new backend /api/organizations/me endpoint
      // For now, we simulate the fetch to match our new Python backend models
      const response = await fetch("/api/organizations/me", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch usage data");
      const data = await response.json();
      setUsage(data);
    } catch (error) {
      toast({
        title: "Error fetching billing data",
        description: "Please refresh the page or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (priceId: string) => {
    setIsCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthenticated");

      // Request a Stripe Checkout URL from our Next.js API route
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const { url, error } = await response.json();
      if (error) throw new Error(error);

      // Redirect user to Stripe's hosted checkout
      if (url) window.location.href = url;
    } catch (error: any) {
      toast({
        title: "Checkout failed",
        description: error.message || "Could not initiate checkout. Please try again.",
        variant: "destructive",
      });
      setIsCheckoutLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate percentages for the progress bars safely
  const storagePercent = usage ? Math.min((usage.current_storage_mb / usage.max_storage_mb) * 100, 100) : 0;
  const queryPercent = usage ? Math.min((usage.current_month_queries / usage.monthly_query_limit) * 100, 100) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Usage</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription and monitor your active compute consumption.
        </p>
      </div>

      {/* --- Usage Guardrails Section --- */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-blue-500" />
              Storage Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {usage?.current_storage_mb.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ {usage?.max_storage_mb} MB</span>
            </div>
            <Progress value={storagePercent} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground text-right">
              {storagePercent.toFixed(1)}% Used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              Compute (Queries)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {usage?.current_month_queries} <span className="text-sm font-normal text-muted-foreground">/ {usage?.monthly_query_limit} queries</span>
            </div>
            <Progress value={queryPercent} className={queryPercent > 90 ? "bg-red-500" : "h-2 mb-2"} />
            <p className="text-xs text-muted-foreground text-right">
              Resets on the 1st of next month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* --- SaaS Subscription Tiers --- */}
      <h2 className="text-2xl font-bold tracking-tight mt-12 mb-6">Subscription Plans</h2>
      <div className="grid gap-6 md:grid-cols-3">
        {/* Free Tier */}
        <Card className={usage?.subscription_tier === "FREE" ? "border-primary" : ""}>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Starter</CardTitle>
              {usage?.subscription_tier === "FREE" && <Badge>Current Plan</Badge>}
            </div>
            <CardDescription>Perfect for exploring the platform.</CardDescription>
            <div className="text-3xl font-bold mt-4">$0<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 1GB Storage Limit</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 1,000 Queries / Month</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Standard Support</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline" disabled>
              {usage?.subscription_tier === "FREE" ? "Active" : "Downgrade"}
            </Button>
          </CardFooter>
        </Card>

        {/* Pro Tier */}
        <Card className={`relative shadow-lg ${usage?.subscription_tier === "PRO" ? "border-primary" : "border-blue-500"}`}>
          {usage?.subscription_tier !== "PRO" && (
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4">
              <Badge className="bg-blue-500 hover:bg-blue-600">Recommended</Badge>
            </div>
          )}
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">Pro <Zap className="h-5 w-5 text-blue-500" /></CardTitle>
              {usage?.subscription_tier === "PRO" && <Badge>Current Plan</Badge>}
            </div>
            <CardDescription>For growing businesses and power users.</CardDescription>
            <div className="text-3xl font-bold mt-4">$49<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-500" /> 50GB R2 Storage</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-500" /> 50,000 Queries / Month</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-500" /> Priority Compute Routing</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-500" /> Advanced AI Analytics</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700" 
              onClick={() => handleUpgrade("price_pro_tier_id_here")}
              disabled={isCheckoutLoading || usage?.subscription_tier === "PRO"}
            >
              {isCheckoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {usage?.subscription_tier === "PRO" ? "Active" : "Upgrade to Pro"}
            </Button>
          </CardFooter>
        </Card>

        {/* Enterprise Tier */}
        <Card className={usage?.subscription_tier === "ENTERPRISE" ? "border-primary" : ""}>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Enterprise</CardTitle>
              {usage?.subscription_tier === "ENTERPRISE" && <Badge>Current Plan</Badge>}
            </div>
            <CardDescription>Custom infrastructure and BYOS.</CardDescription>
            <div className="text-3xl font-bold mt-4">Custom</div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited R2 Storage</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Bring Your Own Storage (BYOS)</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited Queries</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Dedicated Account Manager</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline">
              Contact Sales
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}