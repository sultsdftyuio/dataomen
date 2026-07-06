-- ============================================================================
-- ARCLI SETTINGS PROFILE UPDATE FIX
-- Purpose:
--   1. Persist the website URL already exposed by the settings UI.
--   2. Keep email fields compatible with normalized-email CHECK constraints.
--   3. Ensure tenant_settings RLS supports authenticated owner/admin updates
--      and missing-row recovery from synchronous Next.js API routes.
--
-- Safe to run multiple times.
-- ============================================================================

ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS website_url text;

UPDATE public.tenant_settings
SET reply_to_email = LOWER(TRIM(reply_to_email))
WHERE reply_to_email IS NOT NULL
  AND reply_to_email <> LOWER(TRIM(reply_to_email));

UPDATE public.tenant_settings
SET sender_email = LOWER(TRIM(sender_email))
WHERE sender_email IS NOT NULL
  AND sender_email <> LOWER(TRIM(sender_email));

DO $$ BEGIN
  ALTER TABLE public.tenant_settings
    ADD CONSTRAINT chk_tenant_reply_to_email_normalized
    CHECK (reply_to_email IS NULL OR reply_to_email = LOWER(TRIM(reply_to_email)))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tenant_settings
    ADD CONSTRAINT chk_tenant_sender_email_normalized
    CHECK (sender_email IS NULL OR sender_email = LOWER(TRIM(sender_email)))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tenant_settings
    ADD CONSTRAINT chk_tenant_website_url_http
    CHECK (website_url IS NULL OR website_url ~* '^https?://')
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_settings_select_own" ON public.tenant_settings;
CREATE POLICY "tenant_settings_select_own" ON public.tenant_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = tenant_settings.tenant_id
        AND tu.user_id::text = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "tenant_settings_insert_own" ON public.tenant_settings;
CREATE POLICY "tenant_settings_insert_own" ON public.tenant_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = tenant_settings.tenant_id
        AND tu.user_id::text = auth.uid()::text
        AND LOWER(tu.role) IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "tenant_settings_update_own" ON public.tenant_settings;
CREATE POLICY "tenant_settings_update_own" ON public.tenant_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = tenant_settings.tenant_id
        AND tu.user_id::text = auth.uid()::text
        AND LOWER(tu.role) IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = tenant_settings.tenant_id
        AND tu.user_id::text = auth.uid()::text
        AND LOWER(tu.role) IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION public.handle_new_tenant_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tenant_settings (tenant_id, company_name, updated_at)
  VALUES (NEW.tenant_id, COALESCE(NEW.name, NEW.display_name, 'My Workspace'), NOW())
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_init_tenant_settings ON public.tenants;
CREATE TRIGGER trg_init_tenant_settings
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_tenant_settings();

INSERT INTO public.tenant_settings (tenant_id, company_name, updated_at)
SELECT
  t.tenant_id,
  COALESCE(t.name, t.display_name, 'My Workspace'),
  NOW()
FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;
