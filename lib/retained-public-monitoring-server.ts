/** Server-only rollout gate for the opt-in retained-corpus monitor. */

function enabled(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    process.env[name]?.trim().toLowerCase() ?? "",
  );
}

/** A monitor cannot run until both its scheduler and evidence executor exist. */
export function retainedPublicTargetMonitoringUiIsEnabled(): boolean {
  return (
    enabled("ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_ENABLED") &&
    enabled("ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED")
  );
}
