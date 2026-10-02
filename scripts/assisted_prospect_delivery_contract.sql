-- Apply after entity_first_prospecting_contract.sql. Service role owns pilot
-- enrollment and delivery; authenticated members may only read and give feedback.
CREATE TABLE IF NOT EXISTS public.assisted_prospect_pilots (
    tenant_id TEXT PRIMARY KEY REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_expires_at TIMESTAMPTZ NOT NULL,
    commercial_basis TEXT NOT NULL CHECK (commercial_basis IN ('paid', 'paid_intent')),
    pilot_status TEXT NOT NULL DEFAULT 'active' CHECK (pilot_status IN ('active', 'paused', 'ended')),
    CONSTRAINT assisted_pilot_access_window_check CHECK (access_expires_at > enrolled_at)
);

CREATE TABLE IF NOT EXISTS public.assisted_prospect_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    targeting_profile_id UUID NOT NULL,
    targeting_profile_version INTEGER NOT NULL,
    prospect_entity_id UUID NOT NULL,
    tier TEXT NOT NULL,
    fit_summary TEXT NOT NULL,
    fit_source_url TEXT NOT NULL,
    buyer_role TEXT NOT NULL,
    angle TEXT NOT NULL,
    uncertainty_summary TEXT NOT NULL,
    signal_summary TEXT,
    signal_source_url TEXT,
    signal_source_channel TEXT,
    signal_date DATE,
    contact_route_type TEXT NOT NULL,
    contact_route_url TEXT NOT NULL,
    source_checked_at TIMESTAMPTZ NOT NULL,
    route_checked_at TIMESTAMPTZ NOT NULL,
    source_channel TEXT NOT NULL,
    rights_basis TEXT NOT NULL,
    research_minutes INTEGER NOT NULL DEFAULT 0,
    review_minutes INTEGER NOT NULL,
    source_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
    ai_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
    reviewed_by TEXT NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    display_expires_at TIMESTAMPTZ NOT NULL,
    withdrawn_at TIMESTAMPTZ,
    withdrawal_reason TEXT,
    CONSTRAINT assisted_delivery_tier_check CHECK (tier IN ('direct_intent', 'timely', 'high_fit')),
    CONSTRAINT assisted_delivery_revision_check CHECK (targeting_profile_version >= 1),
    CONSTRAINT assisted_delivery_fit_check CHECK (public.prospecting_is_safe_evidence_summary(fit_summary)),
    CONSTRAINT assisted_delivery_buyer_role_check CHECK (
        char_length(btrim(buyer_role)) BETWEEN 2 AND 120
        AND public.prospecting_is_safe_evidence_summary(buyer_role)
    ),
    CONSTRAINT assisted_delivery_angle_check CHECK (public.prospecting_is_safe_evidence_summary(angle)),
    CONSTRAINT assisted_delivery_uncertainty_check CHECK
        (public.prospecting_is_safe_evidence_summary(uncertainty_summary)),
    CONSTRAINT assisted_delivery_source_channel_check CHECK
        (source_channel IN ('official_site', 'licensed_provider', 'customer_owned')),
    CONSTRAINT assisted_delivery_signal_channel_check CHECK
        (signal_source_channel IS NULL OR signal_source_channel IN
            ('official_site', 'licensed_provider', 'customer_owned')),
    CONSTRAINT assisted_delivery_rights_basis_check CHECK
        (public.prospecting_is_safe_evidence_summary(rights_basis)),
    CONSTRAINT assisted_delivery_cost_check CHECK
        (research_minutes >= 0 AND review_minutes > 0 AND source_cost_usd >= 0 AND ai_cost_usd >= 0),
    CONSTRAINT assisted_delivery_expiry_check CHECK (
        display_expires_at > reviewed_at
        AND display_expires_at <= reviewed_at + INTERVAL '90 days'
        AND (
            signal_source_url IS NULL
            OR display_expires_at <= reviewed_at + INTERVAL '30 days'
        )
    ),
    CONSTRAINT assisted_delivery_signal_check CHECK (
        (signal_summary IS NULL AND signal_source_url IS NULL
            AND signal_source_channel IS NULL AND signal_date IS NULL AND tier = 'high_fit')
        OR (signal_summary IS NOT NULL AND signal_source_url IS NOT NULL
            AND signal_source_channel IS NOT NULL AND signal_date IS NOT NULL
            AND public.prospecting_is_safe_evidence_summary(signal_summary))
    ),
    CONSTRAINT assisted_delivery_tier_evidence_check CHECK (tier = 'high_fit' OR signal_source_url IS NOT NULL),
    CONSTRAINT assisted_delivery_fit_url_check CHECK (public.prospecting_is_valid_public_http_url(fit_source_url)),
    CONSTRAINT assisted_delivery_signal_url_check CHECK (
        signal_source_url IS NULL OR public.prospecting_is_valid_public_http_url(signal_source_url)
    ),
    CONSTRAINT assisted_delivery_contact_type_check CHECK (
        contact_route_type IN ('public_reply', 'business_contact', 'licensed_business_route')
    ),
    CONSTRAINT assisted_delivery_contact_url_check CHECK (public.prospecting_is_valid_public_http_url(contact_route_url)),
    CONSTRAINT assisted_delivery_reviewer_check CHECK (char_length(btrim(reviewed_by)) BETWEEN 1 AND 120),
    CONSTRAINT assisted_delivery_withdrawal_check CHECK (
        (withdrawn_at IS NULL AND withdrawal_reason IS NULL)
        OR (withdrawn_at IS NOT NULL AND withdrawal_reason IN
            ('source_removed', 'identity_disputed', 'route_failed', 'evidence_incorrect', 'other'))
    ),
    CONSTRAINT assisted_delivery_unique_entity_revision UNIQUE
        (tenant_id, targeting_profile_id, targeting_profile_version, prospect_entity_id),
    CONSTRAINT assisted_delivery_tenant_id_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT assisted_delivery_tenant_profile_fk FOREIGN KEY (tenant_id, targeting_profile_id)
        REFERENCES public.targeting_profiles(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT assisted_delivery_tenant_entity_fk FOREIGN KEY (tenant_id, prospect_entity_id)
        REFERENCES public.prospect_entities(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS assisted_deliveries_recent_idx
    ON public.assisted_prospect_deliveries(tenant_id, targeting_profile_id, targeting_profile_version, delivered_at DESC)
    WHERE withdrawn_at IS NULL;

CREATE OR REPLACE FUNCTION public.guard_assisted_prospect_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF (to_jsonb(NEW) - 'withdrawn_at' - 'withdrawal_reason') IS DISTINCT FROM
           (to_jsonb(OLD) - 'withdrawn_at' - 'withdrawal_reason')
           OR OLD.withdrawn_at IS NOT NULL THEN
            RAISE EXCEPTION 'delivered prospect is immutable except for one withdrawal'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.targeting_profiles p
         WHERE p.id = NEW.targeting_profile_id AND p.tenant_id = NEW.tenant_id
           AND p.approval_status = 'approved'
           AND p.profile_version = NEW.targeting_profile_version
    ) THEN
        RAISE EXCEPTION 'delivery requires the current approved targeting brief'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.assisted_prospect_pilots pilot
         WHERE pilot.tenant_id = NEW.tenant_id AND pilot.pilot_status = 'active'
           AND pilot.access_expires_at > NOW()
    ) THEN
        RAISE EXCEPTION 'delivery requires active pilot enrollment'
            USING ERRCODE = '23514';
    END IF;
    -- Serialize deliveries for one entity so simultaneous operator writes cannot
    -- bypass the cooldown by both observing an empty delivery history.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id), hashtext(NEW.prospect_entity_id::TEXT));
    IF EXISTS (
        SELECT 1 FROM public.assisted_prospect_deliveries prior
         WHERE prior.tenant_id = NEW.tenant_id
           AND prior.prospect_entity_id = NEW.prospect_entity_id
           AND prior.delivered_at >= NOW() - INTERVAL '90 days'
    ) THEN
        RAISE EXCEPTION 'prospect was delivered in the last 90 days'
            USING ERRCODE = '23505';
    END IF;
    IF NEW.source_checked_at > NOW() OR NEW.route_checked_at > NOW()
       OR NEW.reviewed_at > NOW() OR NEW.signal_date > CURRENT_DATE
       OR NEW.reviewed_at < NEW.source_checked_at
       OR NEW.reviewed_at < NEW.route_checked_at THEN
        RAISE EXCEPTION 'delivery review or signal dates are invalid'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_assisted_prospect_delivery ON public.assisted_prospect_deliveries;
CREATE TRIGGER guard_assisted_prospect_delivery
    BEFORE INSERT OR UPDATE ON public.assisted_prospect_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.guard_assisted_prospect_delivery();
REVOKE ALL ON FUNCTION public.guard_assisted_prospect_delivery() FROM PUBLIC;

-- Keep reviewer identity and per-user event history service-only. The UI reads
-- this bounded projection via the RPC below, never the delivery base table.
CREATE TABLE IF NOT EXISTS public.assisted_prospect_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN
        ('worth_contacting', 'wrong_fit', 'already_known', 'no_route', 'bad_evidence', 'not_now', 'contacted', 'meeting')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT assisted_feedback_tenant_delivery_fk FOREIGN KEY (tenant_id, delivery_id)
        REFERENCES public.assisted_prospect_deliveries(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS assisted_feedback_latest_idx
    ON public.assisted_prospect_feedback(tenant_id, delivery_id, user_id, created_at DESC, id DESC);

-- Rejected research must be counted in pilot yield and economics. Keep only
-- source locators and reason codes; no raw page body or personal contact data.
CREATE TABLE IF NOT EXISTS public.assisted_prospect_rejections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    targeting_profile_id UUID NOT NULL,
    targeting_profile_version INTEGER NOT NULL CHECK (targeting_profile_version >= 1),
    entity_url TEXT NOT NULL CHECK (public.prospecting_is_valid_public_http_url(entity_url)),
    source_url TEXT NOT NULL CHECK (public.prospecting_is_valid_public_http_url(source_url)),
    source_channel TEXT NOT NULL CHECK
        (source_channel IN ('official_site', 'public_discussion', 'licensed_provider', 'customer_owned')),
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'missing_route', 'unclear_identity', 'fit_unverified', 'source_temporarily_unavailable',
        'wrong_buyer', 'excluded_account', 'duplicate', 'already_contacted',
        'weak_angle', 'bad_evidence', 'stale_claim', 'source_rights', 'sensitive_data'
    )),
    research_minutes INTEGER NOT NULL CHECK (research_minutes >= 0),
    review_minutes INTEGER NOT NULL CHECK (review_minutes >= 0),
    source_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (source_cost_usd >= 0),
    ai_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (ai_cost_usd >= 0),
    reviewed_by TEXT NOT NULL CHECK (char_length(btrim(reviewed_by)) BETWEEN 1 AND 120),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT assisted_rejection_tenant_profile_fk FOREIGN KEY (tenant_id, targeting_profile_id)
        REFERENCES public.targeting_profiles(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS assisted_rejections_recent_idx
    ON public.assisted_prospect_rejections(tenant_id, reviewed_at DESC);

CREATE OR REPLACE FUNCTION public.guard_assisted_prospect_rejection()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.targeting_profiles p
         WHERE p.id = NEW.targeting_profile_id AND p.tenant_id = NEW.tenant_id
           AND p.approval_status = 'approved'
           AND p.profile_version = NEW.targeting_profile_version
    ) OR NOT EXISTS (
        SELECT 1 FROM public.assisted_prospect_pilots pilot
         WHERE pilot.tenant_id = NEW.tenant_id AND pilot.pilot_status = 'active'
           AND pilot.access_expires_at > NOW()
    ) OR NEW.reviewed_at > NOW() THEN
        RAISE EXCEPTION 'rejection requires the current approved targeting brief and valid review date'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_assisted_prospect_rejection ON public.assisted_prospect_rejections;
CREATE TRIGGER guard_assisted_prospect_rejection
    BEFORE INSERT ON public.assisted_prospect_rejections
    FOR EACH ROW EXECUTE FUNCTION public.guard_assisted_prospect_rejection();
REVOKE ALL ON FUNCTION public.guard_assisted_prospect_rejection() FROM PUBLIC;

ALTER TABLE public.assisted_prospect_pilots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assisted_prospect_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assisted_prospect_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assisted_prospect_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assisted_prospect_pilots FROM anon, authenticated;
REVOKE ALL ON public.assisted_prospect_deliveries FROM anon, authenticated;
REVOKE ALL ON public.assisted_prospect_feedback FROM anon, authenticated;
REVOKE ALL ON public.assisted_prospect_rejections FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assisted_prospect_pilots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assisted_prospect_deliveries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assisted_prospect_feedback TO service_role;
GRANT SELECT, INSERT ON public.assisted_prospect_rejections TO service_role;

-- Enrollment is a separate commercial decision from the existing $35 Pro tier.
-- Scope it to the exact tenant and a finite pilot access window.
CREATE OR REPLACE FUNCTION public.assisted_prospect_pilot_has_access(target_tenant_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.assisted_prospect_pilots pilot
        JOIN public.tenant_users tu ON tu.tenant_id::TEXT = pilot.tenant_id
            AND tu.user_id::TEXT = auth.uid()::TEXT
        WHERE pilot.tenant_id = target_tenant_id
          AND pilot.pilot_status = 'active'
          AND pilot.access_expires_at > NOW()
    );
$$;

CREATE OR REPLACE FUNCTION public.assisted_prospect_pilot_is_enrolled(target_tenant_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT public.assisted_prospect_pilot_has_access(target_tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.list_assisted_prospect_deliveries(target_profile_id UUID)
RETURNS TABLE (
    id UUID, entity_id UUID, entity_kind TEXT, entity_title TEXT, entity_url TEXT,
    tier TEXT, fit_summary TEXT, fit_source_url TEXT, buyer_role TEXT, angle TEXT,
    uncertainty_summary TEXT,
    signal_summary TEXT, signal_source_url TEXT, signal_date DATE,
    contact_route_type TEXT, contact_route_url TEXT, source_checked_at TIMESTAMPTZ,
    route_checked_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, my_verdict TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.targeting_profiles p
        WHERE p.id = target_profile_id AND p.approval_status = 'approved'
          AND public.assisted_prospect_pilot_has_access(p.tenant_id)
    ) THEN
        RAISE EXCEPTION 'pilot is not available for this targeting profile' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT d.id, e.id, e.entity_kind, e.title, e.canonical_url,
           d.tier, d.fit_summary, d.fit_source_url, d.buyer_role, d.angle,
           d.uncertainty_summary,
           d.signal_summary, d.signal_source_url, d.signal_date,
           d.contact_route_type, d.contact_route_url, d.source_checked_at,
           d.route_checked_at, d.delivered_at, f.verdict
      FROM public.assisted_prospect_deliveries d
      JOIN public.targeting_profiles p ON p.id = d.targeting_profile_id
          AND p.tenant_id = d.tenant_id AND p.profile_version = d.targeting_profile_version
      JOIN public.prospect_entities e ON e.id = d.prospect_entity_id AND e.tenant_id = d.tenant_id
      LEFT JOIN LATERAL (
          SELECT event.verdict FROM public.assisted_prospect_feedback event
           WHERE event.delivery_id = d.id AND event.tenant_id = d.tenant_id
             AND event.user_id = auth.uid()::TEXT
           ORDER BY event.created_at DESC, event.id DESC LIMIT 1
      ) f ON TRUE
     WHERE d.targeting_profile_id = target_profile_id AND d.withdrawn_at IS NULL
       AND d.display_expires_at > NOW()
     ORDER BY d.delivered_at DESC, d.id DESC
     LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_assisted_prospect_feedback(
    target_delivery_id UUID, target_verdict TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    matched_tenant TEXT;
    latest_verdict TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF target_verdict NOT IN
        ('worth_contacting', 'wrong_fit', 'already_known', 'no_route', 'bad_evidence', 'not_now', 'contacted', 'meeting') THEN
        RAISE EXCEPTION 'invalid prospect verdict' USING ERRCODE = '22023';
    END IF;
    SELECT d.tenant_id INTO matched_tenant
      FROM public.assisted_prospect_deliveries d
      JOIN public.targeting_profiles p ON p.id = d.targeting_profile_id
          AND p.tenant_id = d.tenant_id AND p.profile_version = d.targeting_profile_version
     WHERE d.id = target_delivery_id AND d.withdrawn_at IS NULL
       AND d.display_expires_at > NOW()
       AND p.approval_status = 'approved'
       AND public.assisted_prospect_pilot_has_access(d.tenant_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'prospect is not available in this workspace' USING ERRCODE = '42501';
    END IF;
    SELECT event.verdict INTO latest_verdict
      FROM public.assisted_prospect_feedback event
     WHERE event.tenant_id = matched_tenant AND event.delivery_id = target_delivery_id
       AND event.user_id = auth.uid()::TEXT
     ORDER BY event.created_at DESC, event.id DESC LIMIT 1;
    IF latest_verdict IS DISTINCT FROM target_verdict THEN
        INSERT INTO public.assisted_prospect_feedback(tenant_id, delivery_id, user_id, verdict)
        VALUES (matched_tenant, target_delivery_id, auth.uid()::TEXT, target_verdict);
    END IF;
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.assisted_prospect_pilot_has_access(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assisted_prospect_pilot_is_enrolled(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_assisted_prospect_deliveries(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_assisted_prospect_feedback(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assisted_prospect_pilot_is_enrolled(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assisted_prospect_deliveries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assisted_prospect_feedback(UUID, TEXT) TO authenticated;
