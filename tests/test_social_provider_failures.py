"""Ensure unavailable social providers do not consume an entire job."""

from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from api.services.social_ingestion import _fetch_reddit_posts, _fetch_x_posts


class _DeniedResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code

    def raise_for_status(self) -> None:
        raise httpx.HTTPStatusError(
            "provider denied the request",
            request=httpx.Request("GET", "https://provider.example/search"),
            response=self,  # type: ignore[arg-type]
        )


class _DeniedClient:
    def __init__(self, response: _DeniedResponse, calls: list[str], **_kwargs: object) -> None:
        self.response = response
        self.calls = calls

    def __enter__(self) -> "_DeniedClient":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def get(self, url: str, **_kwargs: object) -> _DeniedResponse:
        self.calls.append(url)
        return self.response


class SocialProviderFailureTests(unittest.TestCase):
    profile = SimpleNamespace(
        ideal_customer_pain_points=["Manual prospect research"],
        core_problem_solved="Finding qualified B2B buyers",
        key_value_propositions=[],
        target_audience=[],
        negative_keywords=[],
    )

    def test_reddit_is_disabled_by_default(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("httpx.Client") as client_class,
        ):
            posts = _fetch_reddit_posts(
                self.profile,
                tenant_id="tenant-1",
                service_profile_id="profile-1",
            )

        self.assertEqual(posts, [])
        client_class.assert_not_called()

    def test_reddit_stops_after_a_policy_block(self) -> None:
        calls: list[str] = []

        with patch.dict(
            os.environ,
            {"ARCLI_REDDIT_INGESTION_ENABLED": "true"},
            clear=True,
        ), patch(
            "httpx.Client",
            side_effect=lambda **kwargs: _DeniedClient(_DeniedResponse(403), calls, **kwargs),
        ):
            posts = _fetch_reddit_posts(
                self.profile,
                tenant_id="tenant-1",
                service_profile_id="profile-1",
            )

        self.assertEqual(posts, [])
        self.assertEqual(len(calls), 1)

    def test_x_stops_after_a_subscription_block(self) -> None:
        calls: list[str] = []

        with patch.dict(
            os.environ,
            {"X_BEARER_TOKEN": "token"},
            clear=True,
        ), patch(
            "httpx.Client",
            side_effect=lambda **kwargs: _DeniedClient(_DeniedResponse(402), calls, **kwargs),
        ):
            posts = _fetch_x_posts(
                self.profile,
                tenant_id="tenant-1",
                service_profile_id="profile-1",
            )

        self.assertEqual(posts, [])
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
