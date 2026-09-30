"""Failures at discovery boundaries must stay retryable and observable."""

from contextlib import nullcontext
from unittest.mock import patch

import pytest

from api.services import ingestion_service
from api.services.social import legacy_storage
from api.services.social.models import SocialPost
from api.services.verifier import VerificationResult


class _Engine:
    def begin(self):
        return nullcontext(object())


def test_entitlement_database_failure_reaches_the_actor_retry_policy() -> None:
    with (
        patch("api.services.crawling._database_engine", return_value=_Engine()),
        patch(
            "api.services.tenant_entitlements.tenant_has_active_paid_access",
            side_effect=ConnectionError("database temporarily unavailable"),
        ),
        patch(
            "api.services.social_ingestion.enqueue_initial_public_source_ingestion"
        ) as enqueue,
    ):
        with pytest.raises(RuntimeError, match="verify lead-discovery entitlement"):
            ingestion_service.process_initial_public_ingestion_job("tenant-1", "profile-1")

    enqueue.assert_not_called()


def test_verified_lead_cannot_be_reported_persisted_without_storage_contract() -> None:
    class _Connection:
        def execute(self, *_args, **_kwargs):
            raise AssertionError("the incomplete contract must be rejected first")

    post = SocialPost(
        source="hackernews",
        external_id="123",
        title="Need billing software",
        text="We need a better billing system for our SaaS.",
        url="https://news.ycombinator.com/item?id=123",
    )
    verification = VerificationResult(
        match=True,
        decision_label="strong_match",
        intent_tier="high",
        confidence=0.9,
        pain_detected="Manual billing",
        why_this_matches="The author asks for billing software.",
    )
    with patch.object(legacy_storage, "_table_columns", return_value={}):
        with pytest.raises(RuntimeError, match="lead_matches storage contract is incomplete"):
            legacy_storage._persist_lead_match(
                _Connection(),
                tenant_id="tenant-1",
                service_profile_id="profile-1",
                source_post_id="00000000-0000-0000-0000-000000000001",
                post=post,
                similarity_score=0.7,
                verification=verification,
                profile_embedding_sha256="profile-hash",
                verifier_model="test-model",
                verifier_policy_version="test-policy",
            )
