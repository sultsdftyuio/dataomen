"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Zap, HardDrive, Activity, Loader2, Info } from "lucide-react";

// --- Modular Plan Configuration ---
const PLAN_CONFIG = {
  FREE: {
    name: "Starter",
    price: { monthly: 0, yearly: 0 },
    priceIds: { monthly: "price_free", yearly: "price_free" },
    features: ["1GB Storage Limit", "1,000 Queries / Month", "Standard Support"],
  },
  PRO: {
    name: "Pro",
    price: { monthly: 25, yearly: 240 }, // $240/yr = $20/mo
    priceIds: { monthly: "price_pro_monthly_25", yearly: "price_pro_yearly_240" },
    features: ["50GB R2 Storage", "50,000 Queries / Month", "Priority Compute Routing", "Advanced AI Analytics"],
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: { monthly: "Custom", yearly: "Custom" },
    features: ["Unlimited R2 Storage", "Bring Your Own Storage (BYOS)", "Unlimited Queries", "Dedicated Support"],
  }
};

interface UsageMetrics {
  subscription_tier: "FREE" | "PRO" | "ENTERPRISE";
  current_storage_mb: number;
  max_storage_mb: number;
  current_month_queries: number;
  monthly_query_limit: number;
}

export default function BillingPage() {
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
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

      const response = await fetch("/api/organizations/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch usage data");
      const data = await response.json();
      setUsage(data);
    } catch (error) {
      toast({
        title: "Sync Error",
        description: "Could not retrieve real-time usage metrics.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (priceId: string) => {
    if (priceId === "price_free") return;
    setIsCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthenticated");

      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ priceId, interval }),
      });

      const { url, error } = await response.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (error: any) {
      toast({
        title: "Checkout failed",
        description: error.message || "Stripe routing error. Try again.",
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

  const storagePercent = usage ? Math.min((usage.current_storage_mb / usage.max_storage_mb) * 100, 100) : 0;
  const queryPercent = usage ? Math.min((usage.current_month_queries / usage.monthly_query_limit) * 100, 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Entitlements</h1>
          <p className="text-muted-foreground mt-2">
            Multi-tenant compute consumption and subscription management.
          </p>
        </div>
        
        {/* Interval Toggle */}
        <div className="flex items-center gap-3 bg-muted p-1 rounded-lg">
          <Tabs value={interval} onValueChange={(v) => setInterval(v as any)}>
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
          {interval === "yearly" && (
            <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none">
              Save 20%
            </Badge>
          )}
        </div>
      </div>

      {/* --- Real-time Usage Metrics --- */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" /> Storage Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usage?.current_storage_mb.toFixed(1)} / {usage?.max_storage_mb} MB</div>
            <Progress value={storagePercent} className="h-1.5 mt-3" />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> Compute Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usage?.current_month_queries.toLocaleString()} / {usage?.monthly_query_limit.toLocaleString()}</div>
            <Progress value={queryPercent} className={`h-1.5 mt-3 ${queryPercent > 90 ? "bg-red-500" : ""}`} />
          </CardContent>
        </Card>
      </div>

      {/* --- Pricing Matrix --- */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Starter Plan */}
        <Card className={usage?.subscription_tier === "FREE" ? "border-primary ring-1 ring-primary" : ""}>
          <CardHeader>
            <CardTitle>{PLAN_CONFIG.FREE.name}</CardTitle>
            <CardDescription>Core analytical features.</CardDescription>
            <div className="text-3xl font-bold mt-4">$0</div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              {PLAN_CONFIG.FREE.features.map(f => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> {f}</li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline" disabled>
              {usage?.subscription_tier === "FREE" ? "Current Plan" : "Downgrade"}
            </Button>
          </CardFooter>
        </Card>

        {/* Pro Plan (Updated) */}
        <Card className={`relative border-2 ${usage?.subscription_tier === "PRO" ? "border-primary" : "border-blue-600 shadow-blue-50/50 shadow-xl"}`}>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-blue-600">Most Efficient</Badge>
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Pro <Zap className="h-4 w-4 fill-blue-600 text-blue-600" /></CardTitle>
            <CardDescription>High-performance scaling.</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">
                ${interval === "monthly" ? PLAN_CONFIG.PRO.price.monthly : PLAN_CONFIG.PRO.price.yearly / 12}
              </span>
              <span className="text-muted-foreground ml-1">/mo</span>
              {interval === "yearly" && (
                <div className="text-xs text-green-600 font-medium mt-1">
                  Billed as ${PLAN_CONFIG.PRO.price.yearly}/year (Save $60)
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              {PLAN_CONFIG.PRO.features.map(f => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" /> {f}</li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700" 
              onClick={() => handleUpgrade(PLAN_CONFIG.PRO.priceIds[interval])}
              disabled={isCheckoutLoading || usage?.subscription_tier === "PRO"}
            >
              {isCheckoutLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {usage?.subscription_tier === "PRO" ? "Current Plan" : "Upgrade Now"}
            </Button>
          </CardFooter>
        </Card>

        {/* Enterprise Plan */}
        <Card>
          <CardHeader>
            <CardTitle>{PLAN_CONFIG.ENTERPRISE.name}</CardTitle>
            <CardDescription>Full isolation & custom RAG.</CardDescription>
            <div className="text-3xl font-bold mt-4">Contact</div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              {PLAN_CONFIG.ENTERPRISE.features.map(f => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {f}</li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline">Contact Sales</Button>
          </CardFooter>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center bg-muted/30 p-4 rounded-lg">
        <Info className="h-3 w-3" />
        Payments are securely processed by Stripe. All plans include multi-tenant security by design.
      </div>
    </div>
  );
}