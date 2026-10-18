-- Accept privacy removal requests for posts collected from community forums
-- (Discourse). Apply after public_data_compliance_contract.sql, before
-- switching on ARCLI_DISCOURSE_INGESTION_ENABLED. Safe to re-run.
--
-- public_data_compliance_contract.sql creates the table with
-- CREATE TABLE IF NOT EXISTS, so re-applying it cannot widen this constraint
-- on an existing database.

BEGIN;

ALTER TABLE public.public_data_removal_requests
    DROP CONSTRAINT IF EXISTS public_data_removal_request_source_check;

ALTER TABLE public.public_data_removal_requests
    ADD CONSTRAINT public_data_removal_request_source_check
    CHECK (source IN ('hackernews', 'bluesky', 'stackexchange', 'github', 'lemmy', 'twitter', 'discourse'));

COMMIT;
