-- Enforce a strict state machine for tenant billing access
CREATE TYPE billing_state AS ENUM (
    'trialing', 
    'active', 
    'past_due', 
    'canceled', 
    'incomplete'
);

ALTER TABLE tenants
ADD COLUMN billing_status billing_state DEFAULT 'trialing',
ADD COLUMN dodo_subscription_id TEXT UNIQUE,
ADD COLUMN trial_ends_at TIMESTAMPTZ,
ADD COLUMN current_period_end TIMESTAMPTZ;