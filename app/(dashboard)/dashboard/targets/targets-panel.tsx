import { ContextCard, ContextLink, ContextStat } from "@/components/dashboard/ContextLayout";
import { targetAssessmentPresentation } from "@/components/prospects/target-presentation";
import type { TargetType, TargetingBriefView } from "@/lib/targeting-brief";
import type { ProspectTargetView } from "../prospect-types";

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  account: "Accounts",
  builder: "Builders",
  project: "Projects",
};

type TargetsPanelProps = {
  targetingBrief: TargetingBriefView;
  targets: ProspectTargetView[];
  briefHref: string;
};

/**
 * The Targets context panel: the target universe every target is checked
 * against, and how the current targets were assessed. Labels come from the
 * same presentation the target rows use, so the counts match what's listed.
 */
export function TargetsPanel({ targetingBrief, targets, briefHref }: TargetsPanelProps) {
  const types = targetingBrief.targetTypes.map((type) => TARGET_TYPE_LABELS[type]);
  const criteria: Array<[string, number]> = [
    ["Ideal customer traits", targetingBrief.idealCustomerTraits.length],
    ["Change triggers", targetingBrief.changeTriggers.length],
    ["Strong evidence rules", targetingBrief.strongEvidenceDefinitions.length],
  ];

  const byAssessment = new Map<string, number>();
  for (const target of targets) {
    const label = targetAssessmentPresentation(target).label;
    byAssessment.set(label, (byAssessment.get(label) ?? 0) + 1);
  }

  return (
    <>
      <ContextCard>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold text-[var(--rail-foreground)]">Target universe</span>
          <span className="text-xs">{targetingBrief.hasBrief ? "Saved" : "Not set up"}</span>
        </div>
        <p className="text-xs leading-5">
          {targetingBrief.hasBrief
            ? types.length > 0
              ? `Researching ${types.join(", ").toLowerCase()}.`
              : "No target types chosen yet."
            : "Every target is checked against it. Set it up once in the brief."}
        </p>
      </ContextCard>

      {targetingBrief.hasBrief ? (
        <dl className="arc-context-stats">
          {criteria.map(([label, count]) => (
            <ContextStat key={label} label={label} value={count} />
          ))}
        </dl>
      ) : null}

      {/* Without a universe the page itself leads with the set-up action, so
          the panel doesn't repeat it. */}
      {targetingBrief.hasBrief ? (
        <nav aria-label="Target universe" className="arc-context-list">
          <ContextLink href={`${briefHref}#target-universe`} title="Edit target universe" detail="In your brief" />
        </nav>
      ) : null}

      {targets.length > 0 ? (
        <>
          <h2 className="arc-context-heading">{targets.length} {targets.length === 1 ? "target" : "targets"}</h2>
          <dl className="arc-context-stats">
            {[...byAssessment.entries()].map(([label, count]) => (
              <ContextStat key={label} label={label} value={count} />
            ))}
          </dl>
        </>
      ) : null}
    </>
  );
}
