"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ShieldCheck 
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// Server Actions
import { applyInterventionAction, claimAccountAction, requeueDeadLetterAction } from "./action";

// Phase 1 Schema Alignment
import type { CustomerOperation } from "./risk-queue-client";

// ─── Constants ─────────────────────────────────────────────────
const MIN_REASON_LENGTH = 10;
const HIGH_RISK_THRESHOLD = 70;

// ─── Deterministic Explainability Types ─────────────────────────
type RiskFactor = {
  id: string;
  factor: string;
  weight: number;
  order_index: number;
};

type CampaignEvent = {
  id: string;
  name: string;
  date: string;
  status: 'delivered' | 'opened' | 'bounced' | 'suppressed' | 'dead_lettered' | 'clicked' | 'replied';
};

type ManualIntervention = {
  id: string;
  action: string;
  operator_name: string;
  date: string;
  notes?: string;
};

type ExplainabilityData = {
  factors: RiskFactor[];
  baseline_score: number;
  campaign_history: CampaignEvent[];
  manual_interventions: ManualIntervention[];
};

interface ExplainabilityDrawerProps {
  item: CustomerOperation | null;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helper: Campaign Status Badge ──────────────────────────────
const getCampaignStatusColor = (status: CampaignEvent["status"]) => {
  const map: Record<CampaignEvent["status"], string> = {
    delivered: "bg-blue-100 text-blue-800 border-blue-200",
    opened: "bg-emerald-100 text-emerald-800 border-emerald-200",
    clicked: "bg-emerald-100 text-emerald-800 border-emerald-200",
    replied: "bg-purple-100 text-purple-800 border-purple-200",
    bounced: "bg-red-100 text-red-800 border-red-200",
    suppressed: "bg-slate-100 text-slate-800 border-slate-200",
    dead_lettered: "bg-orange-100 text-orange-800 border-orange-200",
  };
  return map[status];
};

export function ExplainabilityDrawer({ item, isOpen, onClose }: ExplainabilityDrawerProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // ─── Explainability Data ─────────────────────────────────────
  const [data, setData] = useState<ExplainabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ─── Action Dialog State ───────────────────────────────────
  const [actionType, setActionType] = useState<"cooldown" | "suppress" | null>(null);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("14");
  const [suppressConfirmed, setSuppressConfirmed] = useState(false);

  // Server derives tenant from authenticated session — never trust client-provided tenant_id
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
      setFetchError("Unable to retrieve the audit trail. Risk score remains valid, but supporting evidence could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load explainability data whenever the drawer opens for an item
  useEffect(() => {
    const itemId = item?.id;
    if (!isOpen || !itemId) {
      setData(null);
      setFetchError(null);
      return;
    }
    fetchExplainability(itemId);
  }, [isOpen, item?.id, fetchExplainability]);

  // Reset the action dialog whenever the drawer closes or the customer changes
  useEffect(() => {
    setActionType(null);
    setReason("");
    setDuration("14");
    setSuppressConfirmed(false);
  }, [item?.id, isOpen]);

  if (!item) return null;

  const reasonValid = reason.trim().length >= MIN_REASON_LENGTH;
  const canSubmit = actionType === "suppress" ? reasonValid && suppressConfirmed : reasonValid;

  const totalCalculated = data
    ? data.factors.reduce((sum, f) => sum + f.weight, 0) + data.baseline_score
    : item.risk_score;

  // ─── Secure Action Handlers ────────────────────────────────
  // NOTE: Server actions must derive tenant_id from the authenticated session.
  // Do not accept security-sensitive identifiers from the client.
  const handleActionSubmit = () => {
    if (!canSubmit || !actionType) return;

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("itemId", item.id);
        formData.append("customerId", item.customer_id);
        formData.append("action", actionType);
        formData.append("reason", reason.trim());
        formData.append("idempotencyKey", crypto.randomUUID());

        if (actionType === "cooldown") {
          formData.append("durationDays", duration);
        }

        const result = await applyInterventionAction(formData);

        if (result.success) {
          toast({ title: "Intervention Applied", description: result.message });
          setActionType(null);
          setReason("");
          onClose();
        } else {
          toast({ title: "Error", description: result.error, variant: "destructive" });
        }
      } catch (err) {
        toast({
          title: "Submission Failed",
          description: "Something went wrong reaching the server. Please try again.",
          variant: "destructive",
        });
      }
    });
  };

  const handleClaim = () => {
    startTransition(async () => {
      const result = await claimAccountAction(item.id);
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
      const result = await requeueDeadLetterAction(item.id);
      if (result.success) {
        toast({ title: "Requeued Successfully", description: result.message });
        onClose();
      } else {
        toast({ title: "Requeue Failed", description: result.error, variant: "destructive" });
      }
    });
  };

  // Logic flags
  const isHealthy = item.state === "healthy";
  const isDeadLettered = item.state === "dead_lettered";
  const canCooldown = !isHealthy && item.state !== "suppressed" && item.state !== "completed" && item.state !== "cooldown";
  const canSuppress = !isHealthy && item.state !== "suppressed" && item.state !== "completed";

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-md md:max-w-lg overflow-hidden flex flex-col p-0 border-l shadow-2xl">

          {/* ═══ DEAD-LETTER INCIDENT BANNER ═══ */}
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

          {/* ═══ HEALTHY STATE BANNER ═══ */}
          {isHealthy && (
            <div className="bg-emerald-50 text-emerald-800 px-6 py-3 flex items-center shadow-sm z-10 shrink-0 border-b border-emerald-100">
              <ShieldCheck className="h-5 w-5 mr-2.5 text-emerald-600" />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm tracking-wide text-emerald-900">Account Healthy</span>
                <span className="text-xs text-emerald-700">No active churn signals detected. Timeline available below.</span>
              </div>
            </div>
          )}

          <div className="p-6 pb-4 bg-muted/30 border-b shrink-0">
            <SheetHeader>
              <div className="flex items-center justify-between">
                <SheetTitle className="text-2xl font-bold truncate pr-4">{item.name}</SheetTitle>
                <Badge variant={isHealthy ? "outline" : item.risk_score >= HIGH_RISK_THRESHOLD ? "destructive" : "secondary"}>
                  Score: {item.risk_score}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-1">
                <SheetDescription>{item.email}</SheetDescription>
                
                {/* ═══ CLAIM WORKFLOW ═══ */}
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
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    Owned by {item.assigned_to_name}
                  </Badge>
                ) : null}
              </div>
            </SheetHeader>

            {/* ─── EMERGENCY OPERATOR CONTROLS ─── */}
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

            {/* Muted operator notice for Dead Letters */}
            {isDeadLettered && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                <p className="text-xs text-red-700">Operator controls are disabled until the dead-letter is resolved.</p>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8 pb-10">

              {/* Loading State */}
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

              {/* Fetch Error State */}
              {fetchError && !loading && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-orange-900 mb-1">Explainability Unavailable</h3>
                  <p className="text-sm text-orange-700 leading-relaxed">{fetchError}</p>
                  <button
                    onClick={() => fetchExplainability(item.id)}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-orange-700 hover:text-orange-800 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" /> Retry
                  </button>
                </div>
              )}

              {/* Content rendering */}
              {!loading && !fetchError && data && (
                <>
                  {/* Risk Factors (Only shown if there are factors or the user is not healthy) */}
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
                                <div key={rf.id} className="flex justify-between items-center">
                                  <span className="text-foreground">{rf.factor}</span>
                                  <span className="font-mono text-muted-foreground font-medium tabular-nums">
                                    {rf.weight > 0 ? "+" : ""}{rf.weight} pts
                                  </span>
                                </div>
                              ))}
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Baseline</span>
                              <span className="font-mono text-muted-foreground font-medium tabular-nums">{data.baseline_score} pts</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center font-bold">
                              <span className="text-foreground">Total Calculated Score</span>
                              <span className="font-mono text-blue-600 dark:text-blue-400 tabular-nums">{totalCalculated}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Operator Interventions */}
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
                              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                              .map((mi) => (
                                <li key={mi.id} className="flex justify-between items-start gap-4">
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium text-foreground text-sm">{mi.action}</span>
                                    <span className="text-xs text-muted-foreground mt-0.5">by {mi.operator_name}</span>
                                    {mi.notes && <p className="text-xs text-slate-500 mt-1 italic truncate">"{mi.notes}"</p>}
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

                  {/* Campaign Timeline (Always shown as history is useful for healthy customers too) */}
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
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((hist) => (
                            <div key={hist.id} className="relative pl-6">
                              <span
                                className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 ${
                                  hist.status === "bounced" || hist.status === "dead_lettered"
                                    ? "bg-red-100 border-red-500"
                                    : hist.status === "opened" || hist.status === "clicked" || hist.status === "replied"
                                    ? "bg-emerald-100 border-emerald-500"
                                    : "bg-blue-100 border-blue-500"
                                }`}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{hist.name}</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {format(new Date(hist.date), "MMM d, yyyy - h:mm a")}
                                  </span>
                                  <span className="text-muted-foreground">&bull;</span>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getCampaignStatusColor(hist.status)}`}>
                                    {hist.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
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

      {/* ═══ ACTION DIALOG: Force Cooldown & Suppress ═══ */}
      <Dialog open={!!actionType} onOpenChange={(open) => !open && !isPending && setActionType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "cooldown" ? "Apply Contact Cooldown" : "Suppress Customer"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "cooldown"
                ? "Pause automated recovery attempts for a specific duration."
                : "Permanently remove this customer from the risk queue. This stops all future automated outreach."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {actionType === "cooldown" && (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="cooldown-duration">Duration</label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id="cooldown-duration"><SelectValue placeholder="Select duration" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 Days</SelectItem>
                    <SelectItem value="14">14 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="intervention-reason">
                Mandatory Reason <span className="text-red-500">*</span>
              </label>
              <Textarea
                id="intervention-reason"
                placeholder={
                  actionType === "suppress"
                    ? "e.g., Customer requested no outreach via Support Ticket #1024"
                    : "e.g., Handled manually via Zoom call"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="resize-none"
                aria-invalid={!reasonValid}
              />
              <p className={`text-xs ${reasonValid ? "text-muted-foreground" : "text-red-500"}`}>
                {reasonValid ? "Looks good." : `${reason.trim().length}/${MIN_REASON_LENGTH} characters minimum`}
              </p>
            </div>

            {actionType === "suppress" && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <Checkbox
                  id="confirm-suppress"
                  checked={suppressConfirmed}
                  onCheckedChange={(checked) => setSuppressConfirmed(checked === true)}
                  className="mt-0.5"
                />
                <label htmlFor="confirm-suppress" className="text-xs text-red-800 leading-relaxed">
                  I understand this permanently stops all automated recovery for this customer and cannot be undone from this screen.
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionType(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant={actionType === "suppress" ? "destructive" : "default"}
              onClick={handleActionSubmit}
              disabled={isPending || !canSubmit}
            >
              {isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Applying...</>
              ) : (
                "Confirm Action"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}