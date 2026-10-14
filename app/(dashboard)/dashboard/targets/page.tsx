import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileCheck2 } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EntityResearchControls } from "@/components/prospects/entity-research-controls";
import { ManualTargetForm } from "@/components/prospects/manual-target-form";
import { TargetDesk } from "@/components/prospects/target-desk";
import { ADD_TARGET_INPUT_ID } from "@/components/prospects/target-presentation";
import { Button } from "@/components/ui/button";
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

const BRIEF_HREF = "/dashboard/brief";
const PAGE_TITLE = "Targets";
const PAGE_DESCRIPTION = "Accounts that fit your targeting brief, and the public evidence for each.";
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
    fetchProspectTargets(
      supabase,
      tenantId,
      targetingBrief.id,
      targetingBrief.profileVersion,
    ),
    fetchProspectFeedbackSummary(supabase, targetingBrief.id),
    targetMonitoringEnabled
      ? fetchProspectTargetMonitoringStatuses(supabase, targetingBrief.id)
      : Promise.resolve(null),
    fetchProspectTargetOpportunityStatuses(supabase, targetingBrief.id),
    entityResearchEnabled
      ? fetchEntityResearchRunStatuses(
          supabase,
          tenantId,
          targetingBrief.id,
          targetingBrief.profileVersion,
        )
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

  // Every target is assessed against the approved brief, so without one the
  // page has a single job: send the person to approve it.
  if (!targetingBrief.hasBrief) {
    return (
      <div className="arc-workspace-page arc-workspace-page--targets">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <EmptyState
          variant="never-used"
          icon={FileCheck2}
          title="Approve your targeting brief to start adding targets"
          description="Arcli checks every target against your targeting brief, so you can add accounts here once you've approved it."
          action={
            <Button asChild>
              <Link href={BRIEF_HREF}>Review your targeting brief</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="arc-workspace-page arc-workspace-page--targets">
      <PageHeader
        title={PAGE_TITLE}
        description={PAGE_DESCRIPTION}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={BRIEF_HREF}>Edit targeting brief</Link>
          </Button>
        }
      />

      <ManualTargetForm
        allowedTargetTypes={targetingBrief.targetTypes}
        onCreate={createTarget}
      />

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
        targetBriefHref={BRIEF_HREF}
        addTargetInputId={ADD_TARGET_INPUT_ID}
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
