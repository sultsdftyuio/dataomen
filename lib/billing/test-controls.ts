function normalizedEnvironmentValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Keeps manual billing overrides available during local development while
 * requiring an explicit opt-in in deployed environments.
 */
export function areBillingTestControlsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicitFlag = normalizedEnvironmentValue(
    environment.BILLING_TEST_CONTROLS_ENABLED,
  );

  if (["true", "1", "yes"].includes(explicitFlag)) return true;
  if (["false", "0", "no"].includes(explicitFlag)) return false;

  return environment.NODE_ENV !== "production";
}
