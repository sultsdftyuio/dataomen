-- Compatibility contract for the active event-ingestion service.
--
-- The previous recovery campaign migration happened to add these columns and
-- indexes. They belong to event ingestion, not recovery email, so they live
-- here now that the unused recovery campaign contract has been retired.

BEGIN;

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_events_properties_gin
    ON public.events USING GIN (properties);

-- The application first checks for a matching event and also handles a
-- duplicate insert. Only add the database backstop when historic data is
-- already clean, so this remains safe to apply to older environments.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'uq_events_tenant_idempotency_key'
    ) AND NOT EXISTS (
        SELECT tenant_id, idempotency_key
          FROM public.events
         WHERE idempotency_key IS NOT NULL
         GROUP BY tenant_id, idempotency_key
        HAVING COUNT(*) > 1
         LIMIT 1
    ) THEN
        CREATE UNIQUE INDEX uq_events_tenant_idempotency_key
            ON public.events (tenant_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
