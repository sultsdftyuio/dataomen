-- ============================================================================
-- ARCLI SCHEMA PATCH: ACTIVE SELF-HEALING & PRIMARY KEY DRIFT FIX
-- ============================================================================

-- 1. Heal the Schema Drift: Ensure the primary key has its default generator attached
ALTER TABLE public.tenants 
    ALTER COLUMN tenant_id SET DEFAULT gen_random_uuid()::TEXT;


-- 2. Make the RPC Foolproof: Explicitly generate the ID to bypass any future schema inconsistencies
CREATE OR REPLACE FUNCTION provision_initial_workspace(target_user_id UUID, default_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    existing_tenant_id TEXT;
    new_tenant_id      TEXT;
BEGIN
    LOOP
        SELECT tenant_id INTO existing_tenant_id
          FROM tenant_users
         WHERE user_id = target_user_id;

        IF existing_tenant_id IS NOT NULL THEN
            RETURN existing_tenant_id;
        END IF;

        BEGIN
            -- FIX: Explicitly generate and pass the UUID to bypass missing DEFAULT constraints
            INSERT INTO tenants (tenant_id, name, provisioning_status)
            VALUES (gen_random_uuid()::TEXT, default_name, 'READY')
            RETURNING tenant_id INTO new_tenant_id;

            INSERT INTO tenant_users (tenant_id, user_id, role)
            VALUES (new_tenant_id, target_user_id, 'owner');

            RETURN new_tenant_id;
        EXCEPTION WHEN unique_violation THEN
            -- Race condition caught: another concurrent call created the user mapping
            CONTINUE;
        END;
    END LOOP;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to provision workspace for user %: %', target_user_id, SQLERRM;
END;
$$;
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    masked_key TEXT NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Crucial index: We will look up incoming webhooks by this hash rapidly
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash) WHERE is_revoked = FALSE;