-- ============================================================================
-- ARCLI CORE SCHEMA — PAYMENTS, BILLING & CHURN SIGNALS
-- PURPOSE: Manages Arcli's own tenant billing AND ingested SaaS billing states
-- SAFE TO RUN MULTIPLE TIMES (Strictly Idempotent)
-- ============================================================================

-- ============================================================================
-- 1. ENUMS & TYPES
-- ============================================================================

-- Platform Billing State (Arcli's relationship with the Tenant)
DO $$ BEGIN
    CREATE TYPE platform_billing_state AS ENUM (
        'free',
        'trialing', 
        'active', 
        'past_due', 
        'canceled', 
        'incomplete'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE platform_billing_state ADD VALUE IF NOT EXISTS 'free';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ingested Subscription State (Tenant's relationship with their SaaS Customer)
DO $$ BEGIN
    CREATE TYPE customer_subscription_state AS ENUM (
        'active',
        'past_due',
        'unpaid',
        'canceled',
        'incomplete',
        'incomplete_expired',
        'trialing',
        'paused'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ingested Payment Event State (The Core Churn Signal)
DO $$ BEGIN
    CREATE TYPE payment_event_status AS ENUM (
        'succeeded',
        'failed',
        'pending',
        'refunded',
        'disputed'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- 2. ARCLI PLATFORM BILLING (Modifying `tenants`)
-- ============================================================================

-- Safely add billing columns to the existing tenants table
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS billing_status platform_billing_state DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

ALTER TABLE public.tenants ALTER COLUMN billing_status SET DEFAULT 'free';


-- ============================================================================
-- 3. INGESTED SAAS SUBSCRIPTIONS (For MRR tracking & Churn Scoring)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,                     -- Maps to the external customer ID
    provider TEXT NOT NULL,                    -- 'stripe', 'lemonsqueezy', etc.
    provider_subscription_id TEXT NOT NULL,    -- sub_XXX
    status customer_subscription_state NOT NULL DEFAULT 'incomplete',
    mrr_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'usd',
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    current_period_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_customer_subs_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_provider_sub UNIQUE (provider, provider_subscription_id)
);

-- Fast lookup indexes for Async Workers calculating MRR and Risk
CREATE INDEX IF NOT EXISTS idx_cust_subs_tenant_user ON public.customer_subscriptions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cust_subs_status ON public.customer_subscriptions(status);

-- Tenant Isolation (Rule 6)
ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_subs_isolation_policy" ON public.customer_subscriptions;
CREATE POLICY "customer_subs_isolation_policy" ON public.customer_subscriptions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = customer_subscriptions.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );


-- ============================================================================
-- 4. PAYMENT EVENTS (The Core Dunning & Recovery Trigger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,                     -- The SaaS customer
    provider TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,           -- Stripe Invoice ID (in_XXX) or Charge ID
    subscription_id UUID REFERENCES public.customer_subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status payment_event_status NOT NULL,
    error_code TEXT,                           -- e.g., 'insufficient_funds', 'card_declined'
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_payment_events_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_provider_payment_event UNIQUE (provider, provider_event_id)
);

-- Targeted indexes for the Recovery Engine to quickly find fresh failures
CREATE INDEX IF NOT EXISTS idx_pay_events_tenant_user ON public.payment_events(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_pay_events_status_time ON public.payment_events(status, occurred_at DESC);

-- Tenant Isolation (Rule 6)
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_events_isolation_policy" ON public.payment_events;
CREATE POLICY "payment_events_isolation_policy" ON public.payment_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = payment_events.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

-- ============================================================================
-- 5. AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

-- Function to handle updated_at automatically if not already created
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Safely attach triggers
DO $$ BEGIN
    CREATE TRIGGER update_customer_subs_modtime
        BEFORE UPDATE ON public.customer_subscriptions
        FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
