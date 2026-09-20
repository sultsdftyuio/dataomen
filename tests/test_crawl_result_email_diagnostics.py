import json

from scripts import diagnose_crawl_result_email as diagnostics


def test_diagnostic_reports_valid_configuration_without_exposing_the_api_key(monkeypatch):
    monkeypatch.setenv("ARCLI_CRAWL_RESULT_EMAILS_ENABLED", "true")
    monkeypatch.setenv("ARCLI_CRAWL_RESULT_EMAIL_API_KEY", "super-secret-key")
    monkeypatch.setenv(
        "ARCLI_CRAWL_RESULT_EMAIL_SENDER", "Arcli <notifications@arcli.example>"
    )
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    report = diagnostics.build_diagnostic_report(
        include_outbox=False,
        outbox_limit=10,
    )

    configuration = report["notification_configuration"]
    assert configuration["valid"] is True
    assert configuration["api_key_source"] == "ARCLI_CRAWL_RESULT_EMAIL_API_KEY"
    assert configuration["sender_domain"] == "arcli.example"
    assert "super-secret-key" not in json.dumps(report)


def test_diagnostic_identifies_missing_sender_without_database_access(monkeypatch):
    monkeypatch.setenv("ARCLI_CRAWL_RESULT_EMAILS_ENABLED", "true")
    monkeypatch.setenv("RESEND_API_KEY", "super-secret-key")
    monkeypatch.delenv("ARCLI_CRAWL_RESULT_EMAIL_SENDER", raising=False)

    report = diagnostics.build_diagnostic_report(
        include_outbox=True,
        outbox_limit=10,
    )

    assert report["notification_configuration"]["error_code"] == "configuration_sender_missing"
    assert report["outbox"] == {
        "checked": False,
        "reason": "database_url_missing",
    }
