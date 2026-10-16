import { ContextCard, ContextLink } from "@/components/dashboard/ContextLayout";
import type { TargetingBriefView } from "@/lib/targeting-brief";
import type { ServiceProfileView } from "../prospect-types";

type BriefPanelProps = {
  websiteUrl: string;
  serviceProfile: ServiceProfileView;
  targetingBrief: TargetingBriefView;
};

function siteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function countLabel(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The Brief's context panel: what the brief was built from, how much of it is
 * set up, and a link to each section. Counts come from the saved brief, so an
 * unsaved edit doesn't change them until it is saved.
 */
export function BriefPanel({ websiteUrl, serviceProfile, targetingBrief }: BriefPanelProps) {
  const fields = serviceProfile.fields;
  const signalCount = fields.pain_points.length + fields.buying_triggers.length + fields.urgency_signals.length;
  const sections = [
    fields.target_audience.length > 0,
    fields.core_problem.trim().length > 0,
    signalCount > 0,
    targetingBrief.hasBrief,
  ];
  const doneCount = sections.filter(Boolean).length;

  return (
    <>
      <ContextCard>
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-xs">Built from</span>
            <span className="truncate text-[15px] font-semibold text-[var(--rail-foreground)]">{siteName(websiteUrl)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="arc-context-progress flex-1" role="img" aria-label={`${doneCount} of ${sections.length} sections set up`}>
            {sections.map((done, index) => (
              <span key={index} data-done={done || undefined} />
            ))}
          </div>
          <span className="text-xs tabular-nums text-[var(--rail-foreground)]">{doneCount} of {sections.length}</span>
        </div>
        <p className="arc-context-note text-xs leading-5">Changes apply to future scans.</p>
      </ContextCard>

      <h2 className="arc-context-heading">Sections</h2>
      <nav aria-label="Brief sections" className="arc-context-list">
        <ContextLink
          href="#targeting-buyer-panel-title"
          title="Who has the problem"
          detail={fields.target_audience.length ? countLabel(fields.target_audience.length, "buyer", "buyers") : "Not set"}
          attention={fields.target_audience.length === 0}
        />
        <ContextLink
          href="#targeting-problem-panel-title"
          title="What they want solved"
          detail={fields.core_problem.trim() ? "Written" : "Not set"}
          attention={!fields.core_problem.trim()}
        />
        <ContextLink
          href="#targeting-signals-panel-title"
          title="What to recognise"
          detail={signalCount ? countLabel(signalCount, "signal", "signals") : "Not set"}
          attention={signalCount === 0}
        />
        <ContextLink
          href="#target-universe"
          title="Target universe"
          detail={targetingBrief.hasBrief ? "Saved" : "Not set up"}
          attention={!targetingBrief.hasBrief}
        />
      </nav>
    </>
  );
}
