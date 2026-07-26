from __future__ import annotations

from api.services.cost_controls import ProviderRateLimiter


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
