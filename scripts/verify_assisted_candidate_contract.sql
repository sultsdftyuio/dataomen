-- Run only on a dedicated staging/test database after the base prospecting,
-- assisted delivery, and assisted candidate contracts have been applied.
-- Every fixture write rolls back. An exception aborts the test transaction.
BEGIN;
SET LOCAL statement_timeout = '20s';

DO $assisted_test$
DECLARE
    tenant_a TEXT := 'assisted-test-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 16);
    tenant_b TEXT := 'assisted-test-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 16);
    profile_id UUID;
    service_id UUID;
    account_id UUID;
    candidate_id UUID;
    delivery_id UUID;
    rejected_candidate_id UUID;
    domain_a TEXT := 'a-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12) || '.example';
    domain_b TEXT := 'b-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12) || '.example';
    domain_c TEXT := 'c-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12) || '.example';
BEGIN
    IF to_regclass('public.assisted_prospect_candidates') IS NULL
       OR to_regclass('public.assisted_candidate_observations') IS NULL
       OR to_regclass('public.assisted_prospect_deliveries') IS NULL THEN
        RAISE EXCEPTION 'apply scripts/entity_first_prospecting_contract.sql, scripts/assisted_prospect_delivery_contract.sql, then scripts/assisted_candidate_intake_contract.sql before this staging verification';
    END IF;
    IF has_table_privilege('authenticated', 'public.assisted_prospect_candidates', 'SELECT')
       OR has_table_privilege('authenticated', 'public.assisted_candidate_observations', 'SELECT')
       OR has_table_privilege('authenticated', 'public.assisted_source_approvals', 'SELECT') THEN
        RAISE EXCEPTION 'private candidate tables are readable by authenticated clients';
    END IF;
    IF has_table_privilege('service_role', 'public.assisted_source_approvals', 'INSERT')
       OR NOT has_function_privilege(
           'authenticated', 'public.list_assisted_prospect_deliveries(uuid)', 'EXECUTE'
       )
       OR has_function_privilege(
           'anon', 'public.list_assisted_prospect_deliveries(uuid)', 'EXECUTE'
       ) THEN
        RAISE EXCEPTION 'source approval or customer RPC grants are unsafe';
    END IF;

    INSERT INTO public.tenants(tenant_id, name)
    VALUES (tenant_a, 'Assisted contract test A'), (tenant_b, 'Assisted contract test B');
    INSERT INTO public.service_profiles(tenant_id, website_url)
    VALUES (tenant_a, 'https://seller.example/') RETURNING id INTO service_id;
    INSERT INTO public.targeting_profiles(
        tenant_id, service_profile_id, target_types, approval_status, approved_at, approved_by
    ) VALUES (
        tenant_a, service_id, '["account"]'::JSONB, 'approved', NOW(), 'contract-test'
    ) RETURNING id INTO profile_id;
    INSERT INTO public.assisted_prospect_pilots(tenant_id, access_expires_at, commercial_basis)
    VALUES (tenant_a, NOW() + INTERVAL '14 days', 'paid_intent');
    INSERT INTO public.assisted_source_approvals(
        tenant_id, source_key, source_kind, approval_ref, max_retention_days, valid_until
    ) VALUES
        (tenant_a, 'directory_test', 'approved_directory', 'Approved test source.', 7,
         NOW() + INTERVAL '14 days'),
        (tenant_b, 'directory_test', 'approved_directory', 'Approved test source.', 7,
         NOW() + INTERVAL '14 days');

    INSERT INTO public.prospect_entities(
        tenant_id, entity_kind, entity_provider, entity_external_id, canonical_url, title, origin_kind
    ) VALUES (
        tenant_a, 'account', 'assisted_account', domain_a, 'https://' || domain_a || '/',
        'Candidate A', 'manual'
    ) RETURNING id INTO account_id;
    INSERT INTO public.assisted_prospect_candidates(
        tenant_id, targeting_profile_id, targeting_profile_version, prospect_entity_id, domain
    ) VALUES (tenant_a, profile_id, 1, account_id, domain_a)
    RETURNING id INTO candidate_id;

    BEGIN
        INSERT INTO public.assisted_prospect_candidates(
            tenant_id, targeting_profile_id, targeting_profile_version, prospect_entity_id, domain
        ) VALUES (tenant_a, profile_id, 1, account_id, domain_a);
        RAISE EXCEPTION 'duplicate candidate was accepted';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;
    BEGIN
        INSERT INTO public.assisted_candidate_observations(
            tenant_id, candidate_id, observation_key, source_kind, source_key, source_url,
            rights_approval_ref, observed_at, retention_expires_at
        ) VALUES (
            tenant_b, candidate_id, repeat('b', 64), 'approved_directory', 'directory_test',
            'https://directory.example/listing', 'Approved test source.', NOW(),
            NOW() + INTERVAL '7 days'
        );
        RAISE EXCEPTION 'cross-tenant observation was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
    BEGIN
        INSERT INTO public.assisted_candidate_observations(
            tenant_id, candidate_id, observation_key, source_kind, source_key, source_url,
            rights_approval_ref, observed_at, retention_expires_at
        ) VALUES (
            tenant_a, candidate_id, repeat('c', 64), 'approved_directory', 'directory_test',
            'https://directory.example/listing', 'Unapproved source reference.', NOW(),
            NOW() + INTERVAL '7 days'
        );
        RAISE EXCEPTION 'unapproved observation was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    INSERT INTO public.assisted_candidate_observations(
        tenant_id, candidate_id, observation_key, source_kind, source_key, source_url,
        rights_approval_ref, observed_at, retention_expires_at
    ) VALUES (
        tenant_a, candidate_id, repeat('a', 64), 'approved_directory', 'directory_test',
        'https://directory.example/listing', 'Approved test source.', NOW(),
        NOW() + INTERVAL '7 days'
    );
    IF NOT public.assisted_candidate_has_current_source(tenant_a, candidate_id)
       OR public.assisted_candidate_has_current_source(tenant_b, candidate_id) THEN
        RAISE EXCEPTION 'candidate source visibility crossed a tenant boundary';
    END IF;

    -- Publication must fit within both the source retention and approval window.
    BEGIN
        INSERT INTO public.assisted_prospect_deliveries(
            tenant_id, targeting_profile_id, targeting_profile_version,
            prospect_entity_id, candidate_id, tier, fit_summary, fit_source_url,
            buyer_role, angle, uncertainty_summary, contact_route_type,
            contact_route_url, source_checked_at, route_checked_at, source_channel,
            rights_basis, review_minutes, reviewed_by, reviewed_at, display_expires_at
        ) VALUES (
            tenant_a, profile_id, 1, account_id, candidate_id, 'high_fit',
            'The official site describes relevant business software.',
            'https://' || domain_a || '/about', 'Operations lead',
            'Discuss the documented workflow fit.', 'Buying plans are unconfirmed.',
            'business_contact', 'https://' || domain_a || '/contact',
            NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', 'official_site',
            'Approved public company site.', 5, 'contract-test', NOW(),
            NOW() + INTERVAL '10 days'
        );
        RAISE EXCEPTION 'delivery outlived source retention';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    INSERT INTO public.assisted_prospect_deliveries(
        tenant_id, targeting_profile_id, targeting_profile_version,
        prospect_entity_id, candidate_id, tier, fit_summary, fit_source_url,
        buyer_role, angle, uncertainty_summary, contact_route_type,
        contact_route_url, source_checked_at, route_checked_at, source_channel,
        rights_basis, review_minutes, reviewed_by, reviewed_at, display_expires_at
    ) VALUES (
        tenant_a, profile_id, 1, account_id, candidate_id, 'high_fit',
        'The official site describes relevant business software.',
        'https://' || domain_a || '/about', 'Operations lead',
        'Discuss the documented workflow fit.', 'Buying plans are unconfirmed.',
        'business_contact', 'https://' || domain_a || '/contact',
        NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', 'official_site',
        'Approved public company site.', 5, 'contract-test', NOW(),
        NOW() + INTERVAL '2 days'
    ) RETURNING id INTO delivery_id;
    IF NOT EXISTS (
        SELECT 1 FROM public.assisted_prospect_candidates
         WHERE id = candidate_id AND status = 'delivered'
    ) OR NOT public.assisted_candidate_has_current_source(tenant_a, candidate_id) THEN
        RAISE EXCEPTION 'delivery did not update the candidate or source gate';
    END IF;
    INSERT INTO public.assisted_account_suppressions(tenant_id, domain, reason_code, source_key)
    VALUES (tenant_a, domain_a, 'do_not_contact', 'crm_test');
    IF public.assisted_candidate_has_current_source(tenant_a, candidate_id) THEN
        RAISE EXCEPTION 'new suppression did not hide the delivered account';
    END IF;
    UPDATE public.assisted_account_suppressions SET cleared_at = NOW()
     WHERE tenant_id = tenant_a AND domain = domain_a;
    IF NOT public.assisted_candidate_has_current_source(tenant_a, candidate_id) THEN
        RAISE EXCEPTION 'cleared suppression did not restore source visibility';
    END IF;

    INSERT INTO public.prospect_entities(
        tenant_id, entity_kind, entity_provider, entity_external_id, canonical_url, title, origin_kind
    ) VALUES (
        tenant_a, 'account', 'assisted_account', domain_b, 'https://' || domain_b || '/',
        'Candidate B', 'manual'
    ) RETURNING id INTO account_id;
    INSERT INTO public.assisted_account_suppressions(tenant_id, domain, reason_code, source_key)
    VALUES (tenant_a, domain_b, 'existing_customer', 'crm_test');
    BEGIN
        INSERT INTO public.assisted_prospect_candidates(
            tenant_id, targeting_profile_id, targeting_profile_version, prospect_entity_id, domain
        ) VALUES (tenant_a, profile_id, 1, account_id, domain_b);
        RAISE EXCEPTION 'suppressed account entered the review queue';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    INSERT INTO public.prospect_entities(
        tenant_id, entity_kind, entity_provider, entity_external_id, canonical_url, title, origin_kind
    ) VALUES (
        tenant_a, 'account', 'assisted_account', domain_c, 'https://' || domain_c || '/',
        'Candidate C', 'manual'
    ) RETURNING id INTO account_id;
    INSERT INTO public.assisted_prospect_candidates(
        tenant_id, targeting_profile_id, targeting_profile_version, prospect_entity_id, domain
    ) VALUES (tenant_a, profile_id, 1, account_id, domain_c)
    RETURNING id INTO rejected_candidate_id;
    INSERT INTO public.assisted_prospect_rejections(
        tenant_id, targeting_profile_id, targeting_profile_version, candidate_id,
        entity_url, source_url, source_channel, reason_code,
        research_minutes, review_minutes, reviewed_by
    ) VALUES (
        tenant_a, profile_id, 1, rejected_candidate_id,
        'https://' || domain_c || '/', 'https://' || domain_c || '/about',
        'official_site', 'wrong_buyer', 4, 2, 'contract-test'
    );
    IF NOT EXISTS (
        SELECT 1 FROM public.assisted_prospect_candidates
         WHERE id = rejected_candidate_id AND status = 'rejected'
    ) THEN
        RAISE EXCEPTION 'rejection did not close the candidate';
    END IF;

    UPDATE public.assisted_source_approvals SET approval_status = 'revoked'
     WHERE tenant_id = tenant_a AND source_key = 'directory_test';
    IF public.assisted_candidate_has_current_source(tenant_a, candidate_id) THEN
        RAISE EXCEPTION 'revoked source still exposed its delivered account';
    END IF;
    RAISE NOTICE 'assisted candidate contract passed; delivery fixture % rolls back', delivery_id;
END;
$assisted_test$;

ROLLBACK;
