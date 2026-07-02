"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { applyInterventionAction } from "./action";
import { MIN_REASON_LENGTH } from "./explainability-drawer-types";
import type { ExplainabilityDrawerProps, ExplainabilityData } from "./explainability-drawer-types";

interface ActionDialogProps
  extends Pick<ExplainabilityDrawerProps, "item" | "onClose"> {
  actionType: "cooldown" | "suppress" | null;
  setActionType: (type: "cooldown" | "suppress" | null) => void;
  data: ExplainabilityData | null;
}

export function ActionDialog({
  item,
  onClose,
  actionType,
  setActionType,
  data,
}: ActionDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("14");
  const [suppressConfirmed, setSuppressConfirmed] = useState(false);

  if (!item) return null;

  const reasonValid = reason.trim().length >= MIN_REASON_LENGTH;
  const canSubmit =
    actionType === "suppress"
      ? reasonValid && suppressConfirmed
      : reasonValid;

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

  return (
    <Dialog
      open={!!actionType}
      onOpenChange={(open) => !open && !isPending && setActionType(null)}
    >
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
              <label className="text-sm font-medium" htmlFor="cooldown-duration">
                Duration
              </label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="cooldown-duration">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
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
            <p
              className={`text-xs ${reasonValid ? "text-muted-foreground" : "text-red-500"}`}
            >
              {reasonValid
                ? "Looks good."
                : `${reason.trim().length}/${MIN_REASON_LENGTH} characters minimum`}
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
              <label
                htmlFor="confirm-suppress"
                className="text-xs text-red-800 leading-relaxed"
              >
                I understand this permanently stops all automated recovery for this
                customer and cannot be undone from this screen.
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setActionType(null)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant={actionType === "suppress" ? "destructive" : "default"}
            onClick={handleActionSubmit}
            disabled={isPending || !canSubmit}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Applying...
              </>
            ) : (
              "Confirm Action"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}