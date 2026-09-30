from pathlib import Path


def test_crawl_result_notification_contract_has_idempotency_and_safe_defaults():
    statement = Path("scripts/crawl_result_notifications.sql").read_text(
        encoding="utf-8"
    )

    assert "crawl_completion_email_enabled BOOLEAN NOT NULL DEFAULT TRUE" in statement
    assert "CREATE TABLE IF NOT EXISTS public.crawl_notification_preferences" in statement
    assert "enabled BOOLEAN NOT NULL DEFAULT FALSE" in statement
    assert "ALTER COLUMN enabled SET DEFAULT FALSE" in statement
    assert "opted_in_at TIMESTAMPTZ" in statement
    assert "opted_in_email TEXT" in statement
    assert "notice_version TEXT" in statement
    assert "crawl_notification_preferences_self_service" in statement
    assert "UNIQUE INDEX IF NOT EXISTS uq_crawl_notification_outbox_tenant_user_event" in statement
    assert "ON public.crawl_notification_outbox(tenant_id, user_id, event_key)" in statement
    assert "status IN ('pending', 'dispatching', 'sent', 'suppressed', 'failed')" in statement
    assert "ALTER TABLE public.crawl_notification_outbox ENABLE ROW LEVEL SECURITY" in statement
    assert "source-post content" in statement


def test_notification_delivery_uses_stable_provider_idempotency_key():
    source = Path("api/services/crawl_notifications.py").read_text(encoding="utf-8")

    assert 'idempotency_key = f"arcli-crawl-result:{record.id}"' in source
    assert "ON CONFLICT (tenant_id, user_id, event_key) DO NOTHING" in source
    assert "ARCLI_CRAWL_RESULT_EMAIL_MIN_INTERVAL_HOURS" in source
    assert "ARCLI_CRAWL_RESULT_EMAIL_RETENTION_DAYS" in source
    assert "FOR UPDATE SKIP LOCKED" in source
    assert "COALESCE(preference.enabled, FALSE)" in source
    assert "AND preference.enabled" in source
    assert "preference.opted_in_at IS NOT NULL" in source
    assert "LOWER(preference.opted_in_email) = LOWER(account.email)" in source
    assert "LOWER(preference.opted_in_email) = LOWER(outbox.recipient_email)" in source
    assert "preference.notice_version = :notice_version" in source
    assert "LOWER(account.email) = LOWER(outbox.recipient_email)" in source


def test_opt_in_notice_version_matches_the_settings_route():
    source = Path("api/services/crawl_notifications.py").read_text(encoding="utf-8")
    settings_contract = Path("lib/result-email-preference.ts").read_text(
        encoding="utf-8"
    )

    assert 'RESULT_EMAIL_NOTICE_VERSION = "result-emails-v1"' in source
    assert 'RESULT_EMAIL_NOTICE_VERSION = "result-emails-v1"' in settings_contract
