-- Keep website changes isolated: a tenant may retain historical profiles, but
-- the active dashboard reads only the profile for tenant_settings.website_url.
-- Apply after the base service_profiles contract.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_service_profiles_tenant_website_updated
    ON public.service_profiles (tenant_id, website_url, updated_at DESC);

COMMIT;
