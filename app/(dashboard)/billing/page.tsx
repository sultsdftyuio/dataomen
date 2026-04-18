"use client";

import { useState, useEffect, useMemo } from "react";
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

// Structured alignment with models.py
interface AuditLog {
  id: string;
  created_at: string;
  natural_query: string;
  generated_sql: string | null;
  execution_time_ms: number | null;
  was_successful: boolean;
}

export default function BillingPage() {
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  
  const { toast } = useToast();
  
  // Singleton pattern extraction
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetchUsageMetrics();
    fetchAuditLogs();
  }, []);

  const fetchUsageMetrics = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/organizations/me", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(session && { "Authorization": `Bearer ${session.access_token}` }),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || "Failed to fetch usage metrics.");
      }

      const data = (await response.json()) as UsageMetrics;
      setUsage(data);
    } catch (error: any) {
      toast({
        title: "Telemetry Sync Failed",
        description: error.message || "Please refresh the page or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setIsLogsLoading(true);
    try {
      // Exact alignment with models.py schema to eradicate HTTP 400s
      const { data, error } = await supabase
        .from("query_history")
        .select("id, created_at, natural_query, generated_sql, execution_time_ms, was_successful")
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

  const handleUpgrade = async (variantId: string) => {
    setIsCheckoutLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("Authentication required. Please sign in again.");
      }

      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          variant_id: variantId,
          redirect_url: `${window.location.origin}/dashboard?upgrade=success`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || "Could not initialize checkout.");
      }

      const { checkout_url } = (await response.json()) as { checkout_url?: string };

      if (checkout_url) {
        window.location.href = checkout_url;
      } else {
        throw new Error("Checkout URL missing from billing server response.");
      }
    } catch (error: any) {
      toast({
        title: "Checkout Dispatch Failed",
        description: error.message || "Could not initiate checkout. Please try again.",
        variant: "destructive",
      });
      setIsCheckoutLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const storagePercent = usage ? Math.min((usage.current_storage_mb / usage.max_storage_mb) * 100, 100) : 0;
  const queryPercent = usage ? Math.min((usage.current_month_queries / usage.monthly_query_limit) * 100, 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Billing & Security Audit</h1>
        <p className="text-slate-500 mt-2 font-medium">
          Manage your subscription, monitor compute consumption, and audit workspace activity.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full md:w-[400px] grid-cols-2 p-1 bg-slate-100/80 rounded-xl border border-slate-200">
          <TabsTrigger value="overview" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Overview & Plans</TabsTrigger>
          <TabsTrigger value="audit" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Query Audit Logs</TabsTrigger>
        </TabsList>

        {/* --- TAB 1: OVERVIEW & BILLING --- */}
        <TabsContent value="overview" className="space-y-8">
          {/* Usage Guardrails */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-200/80 shadow-sm rounded-2xl overflow-hidden group">
              <CardHeader className="pb-2 bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 rounded-lg">
                    <HardDrive className="h-4 w-4 text-blue-600" />
                  </div>
                  Storage Capacity
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  {usage?.current_storage_mb.toFixed(1)} <span className="text-sm font-bold text-slate-400">/ {usage?.max_storage_mb} MB</span>
                </div>
                <Progress value={storagePercent} className="h-2 mb-3 bg-slate-100 [&>div]:bg-blue-600" />
                <p className="text-xs font-bold text-slate-400 text-right uppercase tracking-wider">
                  {storagePercent.toFixed(1)}% Consumed
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-sm rounded-2xl overflow-hidden group">
              <CardHeader className="pb-2 bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-50 rounded-lg">
                    <Activity className="h-4 w-4 text-emerald-600" />
                  </div>
                  Compute Quota
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  {usage?.current_month_queries.toLocaleString()} <span className="text-sm font-bold text-slate-400">/ {usage?.monthly_query_limit.toLocaleString()}</span>
                </div>
                <Progress value={queryPercent} className={`h-2 mb-3 bg-slate-100 ${queryPercent > 90 ? "[&>div]:bg-rose-500" : "[&>div]:bg-emerald-500"}`} />
                <p className="text-xs font-bold text-slate-400 text-right uppercase tracking-wider">
                  Resets on 1st
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Subscription Tiers */}
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 mb-6">Infrastructure Tiers</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {/* Free Tier */}
              <Card className={`rounded-2xl shadow-sm border-slate-200/80 ${usage?.subscription_tier === "FREE" ? "ring-2 ring-slate-900 border-transparent" : ""}`}>
                <CardHeader>
                  <div className="flex justify-between items-center mb-1">
                    <CardTitle className="text-lg font-extrabold">Starter</CardTitle>
                    {usage?.subscription_tier === "FREE" && <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px]">Current Protocol</Badge>}
                  </div>
                  <CardDescription className="text-slate-500 font-medium">Local exploratory sandbox.</CardDescription>
                  <div className="text-4xl font-extrabold text-slate-900 mt-4 tracking-tight">$0<span className="text-base font-bold text-slate-400">/mo</span></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-3 text-sm font-medium text-slate-700">
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> 1GB Storage Limit</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> 1,000 Queries / Month</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Standard Latency</li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className="w-full rounded-xl font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 shadow-none border border-slate-200" disabled>
                    {usage?.subscription_tier === "FREE" ? "Active" : "Downgrade"}
                  </Button>
                </CardFooter>
              </Card>

              {/* Pro Tier */}
              <Card className={`relative rounded-2xl shadow-md border-slate-200/80 overflow-hidden ${usage?.subscription_tier === "PRO" ? "ring-2 ring-blue-600 border-transparent" : "border-blue-200 bg-blue-50/10"}`}>
                {/* Subtle gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent pointer-events-none" />
                
                {usage?.subscription_tier !== "PRO" && (
                  <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4">
                    <Badge className="bg-blue-600 text-white border-none uppercase tracking-widest text-[10px] font-bold py-1 px-3 shadow-sm shadow-blue-500/20">Production Standard</Badge>
                  </div>
                )}
                
                <CardHeader className="relative z-10">
                  <div className="flex justify-between items-center mb-1">
                    <CardTitle className="text-lg font-extrabold flex items-center gap-2">
                      Professional <Zap className="h-4 w-4 fill-blue-600 text-blue-600" />
                    </CardTitle>
                    {usage?.subscription_tier === "PRO" && <Badge variant="secondary" className="bg-blue-100 text-blue-700 font-bold uppercase tracking-wider text-[10px] border-none">Current Protocol</Badge>}
                  </div>
                  <CardDescription className="text-slate-500 font-medium">For scaling autonomous operations.</CardDescription>
                  <div className="text-4xl font-extrabold text-slate-900 mt-4 tracking-tight">$49<span className="text-base font-bold text-slate-400">/mo</span></div>
                </CardHeader>
                <CardContent className="space-y-4 relative z-10">
                  <ul className="space-y-3 text-sm font-medium text-slate-700">
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-blue-600 shrink-0" /> 50GB R2 Edge Storage</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-blue-600 shrink-0" /> 50,000 Queries / Month</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-blue-600 shrink-0" /> Fast-Path Compute Routing</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-blue-600 shrink-0" /> Advanced Anomaly Engine</li>
                  </ul>
                </CardContent>
                <CardFooter className="relative z-10">
                  <Button 
                    className="w-full rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all" 
                    onClick={() => handleUpgrade("price_pro_tier_id_here")}
                    disabled={isCheckoutLoading || usage?.subscription_tier === "PRO"}
                  >
                    {isCheckoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {usage?.subscription_tier === "PRO" ? "Active" : "Deploy Pro Engine"}
                  </Button>
                </CardFooter>
              </Card>

              {/* Enterprise Tier */}
              <Card className={`rounded-2xl shadow-sm border-slate-200/80 ${usage?.subscription_tier === "ENTERPRISE" ? "ring-2 ring-slate-900 border-transparent" : ""}`}>
                <CardHeader>
                  <div className="flex justify-between items-center mb-1">
                    <CardTitle className="text-lg font-extrabold">Enterprise</CardTitle>
                    {usage?.subscription_tier === "ENTERPRISE" && <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px]">Current Protocol</Badge>}
                  </div>
                  <CardDescription className="text-slate-500 font-medium">Bespoke VPC architectures.</CardDescription>
                  <div className="text-4xl font-extrabold text-slate-900 mt-4 tracking-tight">Custom</div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-3 text-sm font-medium text-slate-700">
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-slate-400 shrink-0" /> Unlimited R2 Storage</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-slate-400 shrink-0" /> Bring Your Own Storage (BYOS)</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-slate-400 shrink-0" /> Unlimited Compute</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-slate-400 shrink-0" /> Dedicated Solutions Engineer</li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className="w-full rounded-xl font-bold bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm">
                    Contact Solutions
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* --- TAB 2: AUDIT LOGS --- */}
        <TabsContent value="audit">
          <Card className="border-slate-200/80 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="bg-slate-900 pb-5 pt-6 border-b border-slate-800">
              <CardTitle className="flex items-center gap-2 text-lg text-white font-bold">
                <TerminalSquare className="h-5 w-5 text-emerald-400" />
                Network Audit Log
              </CardTitle>
              <CardDescription className="text-slate-400 font-medium text-xs tracking-wider uppercase mt-1">
                Immutable record of generated SQL execution paths.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="p-0 bg-[#fafafa]">
              {isLogsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-16 text-slate-500 flex flex-col items-center">
                  <ShieldAlert className="h-10 w-10 mb-4 text-slate-300" />
                  <p className="font-semibold text-slate-700">No telemetry recorded yet.</p>
                  <p className="text-sm mt-1">Execute a query in the chat engine to generate an audit trail.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader className="bg-white border-b border-slate-200">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-bold text-slate-500 uppercase tracking-widest text-[10px] h-10 whitespace-nowrap">Time (UTC)</TableHead>
                        <TableHead className="font-bold text-slate-500 uppercase tracking-widest text-[10px] h-10 w-[30%]">Synthesized Intent</TableHead>
                        <TableHead className="font-bold text-slate-500 uppercase tracking-widest text-[10px] h-10 w-[40%]">Compiled Vector Trace</TableHead>
                        <TableHead className="font-bold text-slate-500 uppercase tracking-widest text-[10px] h-10 text-right">Latency</TableHead>
                        <TableHead className="font-bold text-slate-500 uppercase tracking-widest text-[10px] h-10 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <TableRow key={log.id} className="hover:bg-blue-50/30 transition-colors border-none">
                          
                          <TableCell className="whitespace-nowrap text-xs font-mono text-slate-500">
                            {new Date(log.created_at).toLocaleString('en-US', { hour12: false })}
                          </TableCell>
                          
                          <TableCell className="font-medium text-[13px] text-slate-800 truncate max-w-[200px]" title={log.natural_query}>
                            {log.natural_query}
                          </TableCell>
                          
                          <TableCell className="truncate max-w-[300px]">
                            {log.generated_sql ? (
                              <code className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 border border-emerald-100/50" title={log.generated_sql}>
                                {log.generated_sql}
                              </code>
                            ) : (
                              <span className="text-xs text-slate-400 italic">RAG / LLM General Call</span>
                            )}
                          </TableCell>
                          
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5 text-xs font-mono font-semibold text-slate-600">
                              <Clock className="h-3 w-3 text-slate-400" />
                              {log.execution_time_ms ? `${log.execution_time_ms}ms` : "—"}
                            </div>
                          </TableCell>
                          
                          <TableCell className="text-center">
                            <Badge variant={log.was_successful ? "default" : "destructive"} className={`text-[9px] font-bold uppercase tracking-widest h-5 rounded-md px-2 ${log.was_successful ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 shadow-none' : 'shadow-none'}`}>
                              {log.was_successful ? 'Success' : 'Error'}
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