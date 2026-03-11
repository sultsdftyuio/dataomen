"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Zap, HardDrive, Activity, Loader2, Clock, ShieldAlert, TerminalSquare } from "lucide-react";

// --- TypeScript Interfaces ---
interface UsageMetrics {
  subscription_tier: "FREE" | "PRO" | "ENTERPRISE";
  current_storage_mb: number;
  max_storage_mb: number;
  current_month_queries: number;
  monthly_query_limit: number;
}

interface AuditLog {
  id: string;
  created_at: string;
  prompt: string;
  sql_used: string;
  execution_ms: number;
  status: "SUCCESS" | "ERROR";
}

export default function BillingPage() {
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    fetchUsageMetrics();
    fetchAuditLogs();
  }, []);

  const fetchUsageMetrics = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Simulated fetch to match Python backend models for organization usage
      const response = await fetch("/api/organizations/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
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

  const fetchAuditLogs = async () => {
    setIsLogsLoading(true);
    try {
      // In production, this targets your secure backend route or heavily RLS-protected Supabase table
      const { data, error } = await supabase
        .from("query_history")
        .select("id, created_at, prompt, sql_used, execution_ms, status")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setIsLogsLoading(false);
    }
  };

  const handleUpgrade = async (priceId: string) => {
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
        body: JSON.stringify({ priceId }),
      });

      const { url, error } = await response.json();
      if (error) throw new Error(error);

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

  const storagePercent = usage ? Math.min((usage.current_storage_mb / usage.max_storage_mb) * 100, 100) : 0;
  const queryPercent = usage ? Math.min((usage.current_month_queries / usage.monthly_query_limit) * 100, 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Security Audit</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription, monitor compute consumption, and audit workspace activity.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
          <TabsTrigger value="overview">Overview & Plans</TabsTrigger>
          <TabsTrigger value="audit">Query Audit Logs</TabsTrigger>
        </TabsList>

        {/* --- TAB 1: OVERVIEW & BILLING --- */}
        <TabsContent value="overview" className="space-y-8 animate-in fade-in-50">
          {/* Usage Guardrails */}
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

          {/* Subscription Tiers */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-6">Subscription Plans</h2>
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
        </TabsContent>

        {/* --- TAB 2: AUDIT LOGS --- */}
        <TabsContent value="audit" className="animate-in fade-in-50">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TerminalSquare className="h-5 w-5 text-primary" />
                Query Execution Logs
              </CardTitle>
              <CardDescription>
                A comprehensive audit trail of all natural language prompts, generated SQL, and compute latency across your workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLogsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                  <ShieldAlert className="h-10 w-10 mb-3 opacity-20" />
                  <p>No queries have been executed yet.</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead className="w-[30%]">User Prompt</TableHead>
                        <TableHead className="w-[40%]">Generated SQL</TableHead>
                        <TableHead className="text-right">Latency</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-medium text-sm truncate max-w-[200px]" title={log.prompt}>
                            {log.prompt}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[300px]" title={log.sql_used}>
                            {log.sql_used || "N/A (General Chat)"}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1 text-xs font-medium">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {log.execution_ms ? `${log.execution_ms.toLocaleString()}ms` : "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={log.status === "SUCCESS" ? "default" : "destructive"} className="text-[10px] h-5">
                              {log.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}