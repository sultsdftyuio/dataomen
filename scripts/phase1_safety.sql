-- Phase 1 safety schema changes

-- Events idempotency
do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_name = 'events'
          and column_name = 'idempotency_key'
    ) then
        alter table events add column idempotency_key text;
    end if;
end $$;

create unique index if not exists events_tenant_idempotency_key_idx
    on events (tenant_id, idempotency_key)
    where idempotency_key is not null;

-- Recovery email idempotency and retry metadata
do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_name = 'recovery_emails'
          and column_name = 'idempotency_key'
    ) then
        alter table recovery_emails add column idempotency_key text;
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_name = 'recovery_emails'
          and column_name = 'message_key'
    ) then
        alter table recovery_emails add column message_key text;
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_name = 'recovery_emails'
          and column_name = 'next_retry_at'
    ) then
        alter table recovery_emails add column next_retry_at timestamptz;
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_name = 'recovery_emails'
          and column_name = 'provider_message_id'
    ) then
        alter table recovery_emails add column provider_message_id text;
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_name = 'recovery_emails'
          and column_name = 'last_error'
    ) then
        alter table recovery_emails add column last_error text;
    end if;
end $$;

create unique index if not exists recovery_emails_tenant_idempotency_key_idx
    on recovery_emails (tenant_id, idempotency_key)
    where idempotency_key is not null;

create unique index if not exists recovery_emails_tenant_message_key_idx
    on recovery_emails (tenant_id, message_key)
    where message_key is not null;

-- Billing webhook dedupe
create table if not exists billing_webhook_events (
    id bigserial primary key,
    tenant_id text not null,
    provider text not null,
    provider_event_id text not null,
    event_type text,
    payload_json jsonb,
    received_at timestamptz not null default now()
);

create unique index if not exists billing_webhook_events_provider_event_id_idx
    on billing_webhook_events (provider, provider_event_id);

create index if not exists billing_webhook_events_tenant_idx
    on billing_webhook_events (tenant_id);
