import type { Database } from "@/types/supabase";

export type TenantSettingsRow = Database["public"]["Tables"]["tenant_settings"]["Row"];

// Routing credentials remain server-only and are intentionally excluded from
// settings data that can flow toward client components.
export type TenantSettingsSnapshotRow = Omit<
  TenantSettingsRow,
  "api_key" | "crm_webhook_url"
> & {
  api_key?: string | null;
};

export type SettingsWorkspace = {
  companyName: string;
  senderEmail?: string;
  replyToEmail: string;
  websiteUrl: string;
};

export type SettingsIntegrations = {
  stripeConnected: boolean;
  emailProviderStatus: boolean;
  apiKeyLast4: string | null;
  hasApiKey: boolean;
  keyLastUpdated: string | null;
};

export type SettingsRouting = {
  notifyAnomalies: boolean;
  notifyWeekly: boolean;
};

export type SettingsSnapshot = {
  workspace: SettingsWorkspace;
  integrations: SettingsIntegrations;
  routing: SettingsRouting;
};

export type ApiKeySummary = {
  keyLast4: string | null;
  keyLastUpdated: string | null;
};

export type SettingsApiKeyResponse = {
  apiKey: string;
};
