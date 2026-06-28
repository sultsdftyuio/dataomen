DO $$ 
BEGIN
    -- Check if the legacy 'name' column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'name'
    ) THEN
        -- 1. Migrate legacy data to the new 'label' column
        UPDATE public.api_keys 
        SET label = name 
        WHERE label IS NULL AND name IS NOT NULL;

        -- 2. Remove the NOT NULL constraint so the Python code can insert successfully
        EXECUTE 'ALTER TABLE public.api_keys ALTER COLUMN name DROP NOT NULL;';
    END IF;
END $$;

DO $$ 
BEGIN
    -- 1. Remove NOT NULL constraint from legacy 'masked_key'
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'masked_key'
    ) THEN
        EXECUTE 'ALTER TABLE public.api_keys ALTER COLUMN masked_key DROP NOT NULL;';
    END IF;

    -- 2. Defensively remove NOT NULL constraint from legacy 'is_revoked' 
    -- (Based on code comments indicating it was replaced by 'revoked_at')
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'is_revoked'
    ) THEN
        EXECUTE 'ALTER TABLE public.api_keys ALTER COLUMN is_revoked DROP NOT NULL;';
    END IF;
END $$;
DO $$
DECLARE
    v_constraint_name text;
BEGIN
    -- 1. Drop the legacy 'id' column completely
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_settings' 
          AND column_name = 'id'
    ) THEN
        -- Using CASCADE safely drops it even if it was acting as the primary key
        EXECUTE 'ALTER TABLE public.tenant_settings DROP COLUMN id CASCADE;';
    END IF;

    -- 2. Ensure 'tenant_id' is the primary key for UPSERTs to work correctly
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu 
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public' 
          AND tc.table_name = 'tenant_settings' 
          AND tc.constraint_type = 'PRIMARY KEY' 
          AND ccu.column_name = 'tenant_id'
    ) THEN
        -- Clear any other rogue primary keys just in case
        SELECT constraint_name INTO v_constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'tenant_settings'
          AND constraint_type = 'PRIMARY KEY';

        IF v_constraint_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE public.tenant_settings DROP CONSTRAINT ' || v_constraint_name || ' CASCADE;';
        END IF;

        -- Promote tenant_id to Primary Key
        ALTER TABLE public.tenant_settings ADD PRIMARY KEY (tenant_id);
    END IF;
END $$;