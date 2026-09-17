from api.services import crawl_notifications as notifications


def test_feature_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("ARCLI_CRAWL_RESULT_EMAILS_ENABLED", raising=False)

    assert notifications.crawl_result_email_enabled() is False


def test_free_completion_copy_never_reports_locked_leads():
    subject, text_body, html_body = notifications._email_copy(
        notification_type=notifications.NOTIFICATION_TYPE_CRAWL_COMPLETED,
        result_summary={
            "website_host": "example.com",
            "pages_crawled": 4,
            "ready_for_review": 99,
        },
    )

    assert subject == "Arcli refresh complete for example.com"
    assert "4 website pages" in text_body
    assert "99" not in text_body
    assert "ready for your review" not in text_body.lower()
    assert "99" not in html_body


def test_paid_completion_copy_includes_only_aggregate_result_counts():
    subject, text_body, html_body = notifications._email_copy(
        notification_type=notifications.NOTIFICATION_TYPE_DISCOVERY_COMPLETED,
        result_summary={
            "website_host": "example.com",
            "pages_crawled": 4,
            "ready_for_review": 2,
            "source_posts_checked": 7,
        },
    )

    assert subject == "2 new leads ready in Arcli"
    assert "2 leads are ready for your review." in text_body
    assert "7 new public conversations" in text_body
    assert "2 leads are ready for your review." in html_body


def test_email_copy_escapes_website_host_before_html_rendering():
    _, _, html_body = notifications._email_copy(
        notification_type=notifications.NOTIFICATION_TYPE_DISCOVERY_PARTIAL,
        result_summary={"website_host": '<img src=x onerror="alert(1)">'},
    )

    assert '<img src=x onerror="alert(1)">' not in html_body
    assert "your website" in html_body


def test_summary_extractors_only_accept_non_negative_aggregate_counts():
    summary = {
        "run_control": {"ready_for_review": "3"},
        "new_inserts": -4,
    }

    assert notifications._ready_for_review_from_summary(summary) == 3
    assert notifications._source_post_count_from_summary(summary) == 0


def test_disabled_enqueue_does_not_open_database_or_publish(monkeypatch):
    monkeypatch.setenv("ARCLI_CRAWL_RESULT_EMAILS_ENABLED", "false")

    def unexpected_database_access():
        raise AssertionError("disabled notifications must not access the database")

    monkeypatch.setattr(notifications, "_database_engine", unexpected_database_access)

    result = notifications.enqueue_initial_crawl_completion_notifications(
        tenant_id="tenant-1",
        crawl_job_id="crawl-1",
        website_url="https://example.com",
        pages_crawled=1,
    )

    assert result == []


def test_failed_discovery_is_not_emailed_before_worker_retries_finish(monkeypatch):
    monkeypatch.setenv("ARCLI_CRAWL_RESULT_EMAILS_ENABLED", "true")

    def unexpected_database_access():
        raise AssertionError("failed discovery should not enqueue an email")

    monkeypatch.setattr(notifications, "_database_engine", unexpected_database_access)

    result = notifications.enqueue_discovery_completion_notifications(
        tenant_id="tenant-1",
        discovery_run_id="00000000-0000-0000-0000-000000000001",
        status="failed",
    )

    assert result == []


def test_disabled_delivery_does_not_open_database(monkeypatch):
    monkeypatch.setenv("ARCLI_CRAWL_RESULT_EMAILS_ENABLED", "false")

    def unexpected_database_access():
        raise AssertionError("disabled notifications must not access the database")

    monkeypatch.setattr(notifications, "_database_engine", unexpected_database_access)

    assert notifications.deliver_crawl_result_notification("outbox-id") == "disabled"
