/**
 * Server-only rollout gates for explicit entity-first research operations.
 *
 * These controls intentionally mirror the worker flags. A customer should
 * never receive a button until the corresponding trusted API/worker path has
 * been deployed and deliberately enabled by an operator.
 */

function enabled(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    process.env[name]?.trim().toLowerCase() ?? "",
  );
}

/** Bounded official-site generation creates research targets, never leads. */
export function entityCandidateGenerationUiIsEnabled(): boolean {
  return enabled("ARCLI_ENTITY_CANDIDATE_GENERATION_ENABLED");
}

/** Retained-corpus research creates pending evidence for human review only. */
export function retainedPublicEvidenceResearchUiIsEnabled(): boolean {
  return enabled("ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED");
}
