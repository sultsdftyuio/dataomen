"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Snowflake,
  Ban,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

import {
  claimAccountAction,
  requeueDeadLetterAction,
} from "./action";
import {
  HIGH_RISK_THRESHOLD,
  getCampaignStatusColor,
} from "./explainability-drawer-types";
import type {
  ExplainabilityDrawerProps,
  ExplainabilityData,
} from "./explainability-drawer-types";
import { ActionDialog } from "./explainability-action-dialog";

export function ExplainabilityDrawer({
  item,
  isOpen,
  onClose,
}: ExplainabilityDrawerProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [data, setData] = useState<ExplainabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"cooldown" | "suppress" | null>(null);

  const fetchExplainability = useCallback(async (itemId: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/queue/explainability?item_id=${itemId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error("Explainability fetch failed:", err);
      setFetchError(
        "Unable to retrieve the audit trail. Risk score remains valid, but supporting evidence could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const itemId = item?.id;
    if (!isOpen || !itemId) {
      setData(null);
      setFetchError(null);
      return;
    }
    fetchExplainability(itemId);
  }, [isOpen, item?.id, fetchExplainability]);

  useEffect(() => {
    setActionType(null);
  }, [item?.id, isOpen]);

  if (!item) return null;

  const totalCalculated = data
    ? data.factors.reduce((sum, f) => sum + f.weight, 0) + data.baseline_score
    : item.risk_score;

  const handleClaim = () => {
    startTransition(async () => {
      const result = await claimAccountAction({ itemId: item.id, tenantId: item.tenant_id });
      if (result.success) {
        toast({ title: "Account Claimed", description: result.message });
        onClose();
      } else {
        toast({ title: "Claim Failed", description: result.error, variant: "destructive" });
      }
    });
  };

  const handleRequeue = () => {
    startTransition(async () => {
      const result = await requeueDeadLetterAction({ itemId: item.id, tenantId: item.tenant_id });
      if (result.success) {
        toast({ title: "Requeued Successfully", description: result.message });
        onClose();
      } else {
        toast({ title: "Requeue Failed", description: result.error, variant: "destructive" });
      }
    });
  };

  const isHealthy = item.state === "healthy";
  const isDeadLettered = item.state === "dead_lettered";
  const canCooldown =
    !isHealthy &&
    item.state !== "suppressed" &&
    item.state !== "completed" &&
    item.state !== "cooldown";
  const canSuppress =
    !isHealthy && item.state !== "suppressed" && item.state !== "completed";

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-md md:max-w-lg overflow-hidden flex flex-col p-0 border-l shadow-2xl">
          {isDeadLettered && (
            <div className="bg-red-500 text-white px-6 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
              <div className="flex flex-col min-w-0 mr-4">
                <span className="font-bold text-sm tracking-wide uppercase flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Automation Failure
                </span>
                <span className="text-xs text-red-100 truncate">
                  This account is dead-lettered and requires manual review.
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRequeue}
                disabled={isPending}
                className="text-red-600 hover:text-red-700 shrink-0 bg-white"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                {isPending ? "Requeuing..." : "Retry Dispatch"}
              </Button>
            </div>
          )}

          {isHealthy && (
            <div className="bg-emerald-50 text-emerald-800 px-6 py-3 flex items-center shadow-sm z-10 shrink-0 border-b border-emerald-100">
              <ShieldCheck className="h-5 w-5 mr-2.5 text-emerald-600" />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm tracking-wide text-emerald-900">
                  Account Healthy
                </span>
                <span className="text-xs text-emerald-700">
                  No active churn signals detected. Timeline available below.
                </span>
              </div>
            </div>
          )}

          <div className="p-6 pb-4 bg-muted/30 border-b shrink-0">
            <SheetHeader>
              <div className="flex items-center justify-between">
                <SheetTitle className="text-2xl font-bold truncate pr-4">
                  {item.name}
                </SheetTitle>
                <Badge
                  variant={
                    isHealthy
                      ? "outline"
                      : item.risk_score >= HIGH_RISK_THRESHOLD
                        ? "destructive"
                        : "secondary"
                  }
                >
                  Score: {item.risk_score}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-1">
                <SheetDescription>{item.email}</SheetDescription>

                {!item.assigned_to_name && !isHealthy ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClaim}
                    disabled={isPending}
                    className="h-7 text-xs"
                  >
                    Claim Account
                  </Button>
                ) : item.assigned_to_name ? (
                  <Badge
                    variant="outline"
                    className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                  >
                    Owned by {item.assigned_to_name}
                  </Badge>
                ) : null}
              </div>
            </SheetHeader>

            {(canCooldown || canSuppress) && !isDeadLettered && (
              <div className="flex gap-2 mt-6">
                {canCooldown && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => setActionType("cooldown")}
                  >
                    <Snowflake className="h-3.5 w-3.5 mr-1.5" />
                    Force Cooldown
                  </Button>
                )}
                {canSuppress && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => setActionType("suppress")}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                    Suppress
                  </Button>
                )}
              </div>
            )}

            {isDeadLettered && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                <p className="text-xs text-red-700">
                  Operator controls are disabled until the dead-letter is resolved.
                </p>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8 pb-10">
              {loading && (
                <div className="space-y-8">
                  <section>
                    <Skeleton className="h-4 w-24 mb-3" />
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Separator />
                      <Skeleton className="h-4 w-32 ml-auto" />
                    </div>
                  </section>
                </div>
              )}

              {fetchError && !loading && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-orange-900 mb-1">
                    Explainability Unavailable
                  </h3>
                  <p className="text-sm text-orange-700 leading-relaxed">
                    {fetchError}
                  </p>
                  <button
                    onClick={() => fetchExplainability(item.id)}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-orange-700 hover:text-orange-800 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" /> Retry
                  </button>
                </div>
              )}

              {!loading && !fetchError && data && (
                <>
                  {(!isHealthy || data.factors.length > 0) && (
                    <section>
                      <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Risk Factors
                      </h3>
                      <div className="rounded-lg border bg-card p-4 space-y-3 shadow-sm text-sm">
                        {data.factors.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic text-center py-2">
                            No individual risk factors recorded.
                          </p>
                        ) : (
                          <>
                            {data.factors
                              .sort((a, b) => a.order_index - b.order_index)
                              .map((rf) => (
                                <div
                                  key={rf.id}
                                  className="flex justify-between items-center"
                                >
                                  <span className="text-foreground">{rf.factor}</span>
                                  <span className="font-mono text-muted-foreground font-medium tabular-nums">
                                    {rf.weight > 0 ? "+" : ""}
                                    {rf.weight} pts
                                  </span>
                                </div>
                              ))}
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Baseline</span>
                              <span className="font-mono text-muted-foreground font-medium tabular-nums">
                                {data.baseline_score} pts
                              </span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center font-bold">
                              <span className="text-foreground">
                                Total Calculated Score
                              </span>
                              <span className="font-mono text-blue-600 dark:text-blue-400 tabular-nums">
                                {totalCalculated}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </section>
                  )}

                  {(data.manual_interventions.length > 0 || !isHealthy) && (
                    <section>
                      <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Operator Interventions
                      </h3>
                      <div className="rounded-lg border bg-card p-4 shadow-sm">
                        {data.manual_interventions.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic text-center py-2">
                            No manual interventions recorded.
                          </p>
                        ) : (
                          <ul className="space-y-4">
                            {data.manual_interventions
                              .sort(
                                (a, b) =>
                                  new Date(b.date).getTime() -
                                  new Date(a.date).getTime()
                              )
                              .map((mi) => (
                                <li
                                  key={mi.id}
                                  className="flex justify-between items-start gap-4"
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium text-foreground text-sm">
                                      {mi.action}
                                    </span>
                                    <span className="text-xs text-muted-foreground mt-0.5">
                                      by {mi.operator_name}
                                    </span>
                                    {mi.notes && (
                                      <p className="text-xs text-slate-500 mt-1 italic truncate">
                                        "{mi.notes}"
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                    {format(new Date(mi.date), "MMM d, yyyy")}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  )}

                  <section>
                    <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Campaign Timeline
                    </h3>
                    {data.campaign_history.length === 0 ? (
                      <div className="rounded-lg border bg-card p-4 shadow-sm">
                        <p className="text-sm text-muted-foreground italic text-center py-2">
                          No automated campaigns have been dispatched to this customer.
                        </p>
                      </div>
                    ) : (
                      <div className="relative border-l border-muted ml-3 space-y-6">
                        {data.campaign_history
                          .sort(
                            (a, b) =>
                              new Date(b.date).getTime() -
                              new Date(a.date).getTime()
                          )
                          .map((hist) => (
                            <div key={hist.id} className="relative pl-6">
                              <span
                                className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 ${
                                  hist.status === "bounced" ||
                                  hist.status === "dead_lettered"
                                    ? "bg-red-100 border-red-500"
                                    : hist.status === "opened" ||
                                        hist.status === "clicked" ||
                                        hist.status === "replied"
                                      ? "bg-emerald-100 border-emerald-500"
                                      : "bg-blue-100 border-blue-500"
                                }`}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {hist.name}
                                </span>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {format(
                                      new Date(hist.date),
                                      "MMM d, yyyy - h:mm a"
                                    )}
                                  </span>
                                  <span className="text-muted-foreground">
                                    &bull;
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getCampaignStatusColor(hist.status)}`}
                                  >
                                    {hist.status
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <ActionDialog
        item={item}
        onClose={onClose}
        actionType={actionType}
        setActionType={setActionType}
        data={data}
      />
    </>
  );
}