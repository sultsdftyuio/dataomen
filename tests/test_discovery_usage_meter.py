from __future__ import annotations

from api.services.cost_controls import TenantQuotaGuard
from api.services.social import usage_meter


class _Guard:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def check_and_increment(self, **kwargs):
        self.calls.append(kwargs)
        return type(
            "Decision",
            (),
            {
                "allowed": True,
                "current_count": int(kwargs["amount"]),
                "limit": int(kwargs["limit"]),
            },
        )()


def test_usage_meter_is_an_explicit_deployment_guard(monkeypatch) -> None:
    monkeypatch.delenv("ARCLI_DISCOVERY_USAGE_GUARD_ENABLED", raising=False)
    guard = _Guard()

    claim = usage_meter.claim_discovery_usage(
        "tenant-1",
        "fresh_embedding_post",
        amount=12,
        guard=guard,  # type: ignore[arg-type]
    )

    assert claim.allowed
    assert claim.current == 0
    assert guard.calls == []


def test_usage_meter_reserves_the_requested_work_against_the_monthly_limit(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_DISCOVERY_USAGE_GUARD_ENABLED", "true")
    monkeypatch.setenv("ARCLI_PRO_MONTHLY_FRESH_EMBEDDING_POST_LIMIT", "25")
    guard = _Guard()

    claim = usage_meter.claim_discovery_usage(
        "tenant-1",
        "fresh_embedding_post",
        amount=12,
        guard=guard,  # type: ignore[arg-type]
    )

    assert claim.allowed
    assert claim.current == 12
    assert claim.limit == 25
    assert guard.calls == [
        {
            "tenant_id": "tenant-1",
            "counter_name": "pro-monthly-discovery-fresh_embedding_post",
            "limit": 25,
            "window_seconds": 2_592_000,
            "amount": 12,
        }
    ]


def test_quota_guard_can_consume_bounded_batch_work() -> None:
    guard = TenantQuotaGuard()

    first = guard.check_and_increment(
        tenant_id="meter-test-unique",
        counter_name="batch-work",
        limit=5,
        window_seconds=60,
        amount=3,
    )
    second = guard.check_and_increment(
        tenant_id="meter-test-unique",
        counter_name="batch-work",
        limit=5,
        window_seconds=60,
        amount=3,
    )

    assert first.allowed and first.current_count == 3
    assert not second.allowed and second.current_count == 6
