from pathlib import Path


def test_crawl_result_notification_contract_has_idempotency_and_safe_defaults():
    statement = Path("scripts/crawl_result_notifications.sql").read_text(
        encoding="utf-8"
    )

    assert "crawl_completion_email_enabled BOOLEAN NOT NULL DEFAULT TRUE" in statement
    assert "CREATE TABLE IF NOT EXISTS public.crawl_notification_preferences" in statement
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
