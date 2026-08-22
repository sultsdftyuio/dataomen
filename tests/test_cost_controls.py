from __future__ import annotations

from unittest.mock import patch

from api.services.cost_controls import ProviderConcurrencyLimiter, ProviderRateLimiter


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, int] = {}
        self.expirations: dict[str, int] = {}

    def incr(self, name: str) -> int:
        self.values[name] = self.values.get(name, 0) + 1
        return self.values[name]

    def expire(self, name: str, seconds: int) -> bool:
        self.expirations[name] = seconds
        return True


class FakePacingRedis:
    def __init__(self) -> None:
        self.calls: list[tuple[object, ...]] = []

    def eval(self, *args: object) -> list[int]:
        self.calls.append(args)
        return [1, 3_001, 1]


def test_provider_rate_limiter_shares_a_bounded_window() -> None:
    redis = FakeRedis()
    limiter = ProviderRateLimiter(redis_client=redis)

    first = limiter.acquire(provider="openai-chat", limit=2, window_seconds=60)
    second = limiter.acquire(provider="openai-chat", limit=2, window_seconds=60)
    blocked = limiter.acquire(provider="openai-chat", limit=2, window_seconds=60)

    assert first.allowed is True
    assert second.allowed is True
    assert blocked.allowed is False
    assert blocked.retry_after_seconds > 0
    assert list(redis.expirations.values()) == [60]


def test_provider_rate_limiter_reserves_evenly_spaced_slots() -> None:
    limiter = ProviderRateLimiter()
    provider = "test-paced-provider"

    with patch("api.services.cost_controls.time.monotonic", return_value=100.0):
        first = limiter.reserve_paced_slot(
            provider=provider,
            limit=2,
            window_seconds=60,
        )
        second = limiter.reserve_paced_slot(
            provider=provider,
            limit=2,
            window_seconds=60,
        )
        third = limiter.reserve_paced_slot(
            provider=provider,
            limit=2,
            window_seconds=60,
        )

    assert first.allowed is True
    assert first.wait_seconds == 0
    assert 30 < second.wait_seconds < 30.01
    assert 60 < third.wait_seconds < 60.01


def test_nonblocking_paced_reservation_does_not_join_the_queue() -> None:
    limiter = ProviderRateLimiter()
    provider = "test-try-paced-provider"

    with patch("api.services.cost_controls.time.monotonic", return_value=100.0):
        first = limiter.try_reserve_paced_slot(
            provider=provider,
            limit=2,
            window_seconds=60,
        )
        blocked = limiter.try_reserve_paced_slot(
            provider=provider,
            limit=2,
            window_seconds=60,
        )
        queued = limiter.reserve_paced_slot(
            provider=provider,
            limit=2,
            window_seconds=60,
        )

    assert first.allowed is True
    assert blocked.allowed is False
    assert 30 < blocked.wait_seconds < 30.01
    # The rejected non-blocking attempt did not reserve a second future slot.
    assert 30 < queued.wait_seconds < 30.01


def test_paced_reservation_uses_one_atomic_redis_operation() -> None:
    redis = FakePacingRedis()
    limiter = ProviderRateLimiter(redis_client=redis)  # type: ignore[arg-type]

    reservation = limiter.reserve_paced_slot(
        provider="openai-chat",
        limit=20,
        window_seconds=60,
    )

    assert reservation.allowed is True
    assert reservation.wait_seconds == 3.001
    assert reservation.queued_requests == 1
    assert len(redis.calls) == 1
    assert redis.calls[0][1:3] == (1, "arcli:pace:openai-chat")


def test_provider_concurrency_limiter_releases_the_next_free_plan_slot() -> None:
    limiter = ProviderConcurrencyLimiter()
    provider = "test-free-firecrawl-slot"

    with patch("api.services.cost_controls.time.monotonic", return_value=100.0):
        first, first_wait = limiter._try_acquire(
            provider=provider,
            limit=1,
            lease_seconds=90,
            token="first",
        )
        blocked, blocked_wait = limiter._try_acquire(
            provider=provider,
            limit=1,
            lease_seconds=90,
            token="second",
        )

    assert first is not None
    assert first_wait == 0
    assert blocked is None
    assert blocked_wait == 90

    limiter.release(first)

    with patch("api.services.cost_controls.time.monotonic", return_value=101.0):
        next_lease, next_wait = limiter._try_acquire(
            provider=provider,
            limit=1,
            lease_seconds=90,
            token="second",
        )

    assert next_lease is not None
    assert next_wait == 0
    limiter.release(next_lease)
