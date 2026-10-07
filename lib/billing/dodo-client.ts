import { DodoPayments } from "dodopayments";

export type DodoEnvironment = "test_mode" | "live_mode";

/** Strips whitespace and stray quotes that env editors commonly add. */
export function sanitizeEnvSecret(value: string | undefined): string {
  return value?.trim().replace(/^["']+|["']+$/g, "").trim() ?? "";
}

function isDodoTestApiKey(apiKey: string): boolean {
  return apiKey.startsWith("test_") || apiKey.startsWith("sk_test_");
}

/**
 * Builds the Dodo SDK client from explicit configuration.
 *
 * The environment is never guessed from the key prefix: an unset
 * DODO_PAYMENTS_ENV means live mode, and a test key in live mode is refused so
 * a misconfigured deployment fails loudly instead of billing against the
 * wrong account.
 */
export function getDodoClient(
  options: { requireWebhookKey?: boolean } = {}
): { client: DodoPayments; environment: DodoEnvironment } {
  const apiKey = sanitizeEnvSecret(process.env.DODO_PAYMENTS_API_KEY);
  if (!apiKey) {
    throw new Error("Missing DODO_PAYMENTS_API_KEY environment variable.");
  }

  const webhookKey = sanitizeEnvSecret(process.env.DODO_PAYMENTS_WEBHOOK_KEY);
  if (options.requireWebhookKey && !webhookKey) {
    throw new Error("Missing DODO_PAYMENTS_WEBHOOK_KEY environment variable.");
  }

  const explicitEnv = sanitizeEnvSecret(process.env.DODO_PAYMENTS_ENV);
  if (explicitEnv !== "test_mode" && explicitEnv !== "live_mode") {
    console.warn(
      "[Billing] DODO_PAYMENTS_ENV is not explicitly set to 'test_mode' or 'live_mode'. Defaulting to 'live_mode'."
    );
  }

  const environment: DodoEnvironment =
    explicitEnv === "test_mode" || explicitEnv === "live_mode"
      ? explicitEnv
      : "live_mode";

  if (process.env.NODE_ENV === "production" && environment === "test_mode") {
    console.warn(
      "[Billing] DODO_PAYMENTS_ENV=test_mode is enabled in production. Using Dodo test API."
    );
  }

  if (environment === "live_mode" && isDodoTestApiKey(apiKey)) {
    throw new Error(
      "DODO_PAYMENTS_API_KEY appears to be a test key while Dodo Payments is configured for live_mode."
    );
  }

  const client = new DodoPayments({
    bearerToken: apiKey,
    environment,
    ...(options.requireWebhookKey ? { webhookKey } : {}),
  });

  return { client, environment };
}
