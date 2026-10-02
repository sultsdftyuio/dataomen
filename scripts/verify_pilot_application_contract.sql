-- Run as a trusted migration role in staging after
-- scripts/pilot_application_contract.sql. All fixtures roll back.
BEGIN;

DO $$
BEGIN
    IF to_regclass('public.pilot_applications') IS NULL THEN
        RAISE EXCEPTION 'pilot_applications table is missing; apply scripts/pilot_application_contract.sql before this verification';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pilot_applications'::regclass) THEN
        RAISE EXCEPTION 'pilot_applications RLS is disabled';
    END IF;
    IF EXISTS (
        SELECT 1 FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS rights(privilege_name)
        WHERE has_table_privilege(roles.role_name, 'public.pilot_applications', rights.privilege_name)
    ) THEN
        RAISE EXCEPTION 'browser roles can access private pilot applications';
    END IF;
    IF NOT has_table_privilege('service_role', 'public.pilot_applications', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.pilot_applications', 'INSERT') THEN
        RAISE EXCEPTION 'service role cannot record and review applications';
    END IF;
END $$;

INSERT INTO public.pilot_applications (
    requester_fingerprint, email, website_url, offer, ideal_customer
) VALUES (
    repeat('a', 64), 'pilot-contract@example.com', 'https://example.com/',
    'A platform for sales research teams', 'Software companies with growing sales teams'
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pilot_applications WHERE email = 'pilot-contract@example.com') THEN
        RAISE EXCEPTION 'application fixture was not stored';
    END IF;
END $$;

ROLLBACK;
