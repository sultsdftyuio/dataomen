import { isPotentialBuyer, isScreenedMatch } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type { QualifiedLeadView } from "@/app/(dashboard)/dashboard/prospect-types";
import { ArcSignalIcon } from "@/components/dashboard/arc-icons";
import { leadIntent, leadStatus } from "@/components/prospects/lead-status";

export type SignalLevel = 0 | 1 | 2 | 3;

/**
 * How strong the evidence is, as 0–3 arcs. It follows the existing buckets
 * (screened out, Maybe, Lead) and raises a Lead to full strength only when it
 * was qualified or the verifier rated the intent high, so it never claims
 * more than the verdict already does.
 */
export function leadSignalLevel(lead: QualifiedLeadView): SignalLevel {
  if (isScreenedMatch(lead)) return 0;
  if (isPotentialBuyer(lead)) return 1;
  if (lead.matchStatus === "qualified" || lead.intentTier === "high") return 3;
  return 2;
}

export function signalLevelLabel(level: SignalLevel): string {
  return `Signal strength ${level} of 3`;
}

/** The verdict, first: signal arcs, the bucket, and how ready they sound. */
export function LeadVerdict({ lead }: { lead: QualifiedLeadView }) {
  const status = leadStatus(lead);
  const intent = leadIntent(lead);
  const level = leadSignalLevel(lead);

  return (
    <p
      className="inline-flex w-fit max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl bg-off-white py-1.5 pr-3.5 pl-2.5 text-sm ring-1 ring-border ring-inset"
      title={status.description}
    >
      <ArcSignalIcon level={level} label={signalLevelLabel(level)} />
      <span className="font-semibold text-foreground">{status.label}</span>
      <span className="text-subtle">{intent ? intent.label : status.description}</span>
    </p>
  );
}
