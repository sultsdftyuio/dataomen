import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Crosshair } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { EntityResearchControls } from "@/components/prospects/entity-research-controls";
import { ManualTargetForm } from "@/components/prospects/manual-target-form";
import { TargetDesk } from "@/components/prospects/target-desk";
import {
  createProspectOpportunity,
  qualifyProspectOpportunity,
} from "@/app/actions/prospect-opportunities";
import {
  entityCandidateGenerationUiIsEnabled,
  retainedPublicEvidenceResearchUiIsEnabled,
} from "@/lib/entity-research-server";
import { retainedPublicTargetMonitoringUiIsEnabled } from "@/lib/retained-public-monitoring-server";
import { resolveTenantContext } from "@/utils/supabase/tenant";

import {
  requestEntityCandidateGeneration,
  requestRetainedPublicEvidenceResearch,
} from "../entity-research-actions";
import {
  createManualProspectTarget,
  reviewProspectEvidence,
  setProspectTargetMonitoring,
  submitProspectTargetFeedback,
} from "../targeting-actions";
import { fetchServiceProfile, fetchTenantWebsiteUrl } from "../data";
import {
  fetchEntityResearchRunStatuses,
  fetchProspectFeedbackSummary,
  fetchProspectTargetMonitoringStatuses,
  fetchProspectTargetOpportunityStatuses,
  fetchProspectTargets,
  fetchTargetingBrief,
} from "./data";

export const metadata: Metadata = {
  title: "Targets | Arcli",
  description: "Research accounts, independent builders, and projects before buyer intent is explicit.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TargetsPage() {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    switch (tenantResult.response.status) {
      case 202:
        redirect("/onboarding/workspace");
      case 401:
        redirect("/login?next=/dashboard/targets");
      case 403:
        redirect("/unauthorized");
      default:
        redirect("/error");
    }
  }

  const { supabase, tenantId } = tenantResult.context;
  const websiteUrl = await fetchTenantWebsiteUrl(supabase, tenantId);
  if (!websiteUrl) redirect("/onboarding/workspace");

  const serviceProfile = await fetchServiceProfile(supabase, tenantId, websiteUrl);
  const targetingBrief = await fetchTargetingBrief(
    supabase,
    tenantId,
    serviceProfile.id,
  );
  const candidateGenerationEnabled = entityCandidateGenerationUiIsEnabled();
  const evidenceResearchEnabled = retainedPublicEvidenceResearchUiIsEnabled();
  const targetMonitoringEnabled = retainedPublicTargetMonitoringUiIsEnabled();
  const entityResearchEnabled = candidateGenerationEnabled || evidenceResearchEnabled;
  const [targets, feedbackSummary, monitoringStatuses, opportunityStatuses, entityResearchRuns] = await Promise.all([
    fetchProspectTargets(supabase, tenantId, targetingBrief.id),
    fetchProspectFeedbackSummary(supabase, targetingBrief.id),
    targetMonitoringEnabled
      ? fetchProspectTargetMonitoringStatuses(supabase, targetingBrief.id)
      : Promise.resolve(null),
    fetchProspectTargetOpportunityStatuses(supabase, targetingBrief.id),
    entityResearchEnabled
      ? fetchEntityResearchRunStatuses(supabase, tenantId, targetingBrief.id)
      : Promise.resolve<Awaited<ReturnType<typeof fetchEntityResearchRunStatuses>>>({}),
  ]);
  // An enabled flag alone is insufficient during an additive deployment: the
  // display-safe monitor RPC must be live before we expose an opt-in action.
  const targetMonitoringAvailable =
    targetMonitoringEnabled && monitoringStatuses !== null;
  // The opportunity migration is additive. Withhold all promotion/CRM
  // controls if its status projection is not live, rather than offering an
  // action that could fail after a partial deployment.
  const targetOpportunitiesAvailable = opportunityStatuses !== null;
  const targetsWithWorkflowState = targets.map((target) => ({
    ...target,
    monitoring: monitoringStatuses?.get(target.id) ?? null,
    opportunity: target.assessmentId
      ? opportunityStatuses?.get(target.assessmentId) ?? null
      : null,
  }));
  const createTarget = createManualProspectTarget.bind(null, serviceProfile.id);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-4 overflow-y-auto pr-1">
      <DashboardPageIntro
        eyebrow="Entity-first discovery"
        title="Targets"
        description="Research accounts, builders, and projects that fit your market before they explicitly post buyer intent."
        icon={Crosshair}
      />

      {targetingBrief.hasBrief ? (
        <ManualTargetForm
          allowedTargetTypes={targetingBrief.targetTypes}
          onCreate={createTarget}
        />
      ) : null}

      {entityResearchEnabled ? (
        <EntityResearchControls
          candidateGenerationEnabled={candidateGenerationEnabled}
          evidenceResearchEnabled={evidenceResearchEnabled}
          hasApprovedBrief={targetingBrief.hasBrief}
          seedCount={targetingBrief.seedUrls.length}
          eligibleTargetCount={targets.filter((target) => target.assessmentState !== "rejected").length}
          candidateGenerationRun={entityResearchRuns.candidate_generation}
          evidenceCollectionRun={entityResearchRuns.evidence_collection}
          onGenerateTargets={
            candidateGenerationEnabled ? requestEntityCandidateGeneration : null
          }
          onResearchEvidence={
            evidenceResearchEnabled ? requestRetainedPublicEvidenceResearch : null
          }
        />
      ) : null}

      <TargetDesk
        targets={targetsWithWorkflowState}
        targetBriefHref="/dashboard/brief"
        onReviewEvidence={reviewProspectEvidence}
        onTargetFeedback={submitProspectTargetFeedback}
        onTargetMonitoring={
          targetMonitoringAvailable ? setProspectTargetMonitoring : null
        }
        onCreateOpportunity={
          targetOpportunitiesAvailable ? createProspectOpportunity : null
        }
        onQualifyOpportunity={
          targetOpportunitiesAvailable ? qualifyProspectOpportunity : null
        }
        feedbackSummary={feedbackSummary}
      />
    </div>
  );
}
