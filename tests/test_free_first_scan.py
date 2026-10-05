"""The Free first scan is one-time, dark by default, and never extends recrawls."""

from pathlib import Path

from api.services import tenant_entitlements as entitlements


class _Result:
    def __init__(self, value: bool) -> None:
        self._value = value

    def scalar_one(self) -> bool:
        return self._value


class _Connection:
    """Answers the terminal-run lookup; fails loudly on any other query."""

    def __init__(self, *, has_terminal_run: bool) -> None:
        self.has_terminal_run = has_terminal_run
        self.queries = 0

    def execute(self, statement, _params):
        self.queries += 1
        assert "discovery_runs" in str(statement)
        return _Result(self.has_terminal_run)


def test_free_first_scan_is_off_unless_explicitly_enabled(monkeypatch):
    monkeypatch.delenv("ARCLI_FREE_FIRST_SCAN_ENABLED", raising=False)
    conn = _Connection(has_terminal_run=False)

    assert entitlements.tenant_has_unused_free_first_scan(conn, "tenant-1") is False
    assert conn.queries == 0


def test_enabled_free_first_scan_is_available_before_any_finished_run(monkeypatch):
    monkeypatch.setenv("ARCLI_FREE_FIRST_SCAN_ENABLED", "true")

    assert entitlements.tenant_has_unused_free_first_scan(
        _Connection(has_terminal_run=False), "tenant-1"
    )


def test_free_first_scan_is_consumed_by_the_first_finished_run(monkeypatch):
    monkeypatch.setenv("ARCLI_FREE_FIRST_SCAN_ENABLED", "true")

    assert not entitlements.tenant_has_unused_free_first_scan(
        _Connection(has_terminal_run=True), "tenant-1"
    )


def test_paid_access_short_circuits_the_free_check(monkeypatch):
    monkeypatch.setattr(entitlements, "tenant_has_active_paid_access", lambda *_: True)

    def unexpected(*_args):
        raise AssertionError("paid tenants never consume the free scan")

    monkeypatch.setattr(entitlements, "tenant_has_unused_free_first_scan", unexpected)

    assert entitlements.tenant_may_run_lead_discovery(object(), "tenant-1")


def test_recurring_recrawls_stay_paid_only():
    source = Path("api/services/website_recrawl.py").read_text(encoding="utf-8")

    assert "tenant_has_active_paid_access" in source
    assert "tenant_may_run_lead_discovery" not in source
