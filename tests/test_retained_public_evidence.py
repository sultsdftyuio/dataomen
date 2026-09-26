from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from api.services.prospecting.retained_public_evidence import (
    RetainedPublicAuthorLocator,
    RetainedPublicSourceRecord,
    load_retained_public_author_records,
    propose_retained_public_evaluation_evidence,
    resolve_retained_public_author_locator,
)
from api.services.prospecting.research_policy import (
    EntityEvidenceResearchRequest,
    plan_entity_evidence_research,
)


ENTITY_ID = "50e98719-4e36-4d9f-8a76-5f4b9e32d9c2"
PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
POST_ID = "4197c931-ecdd-4102-af3f-a36c1ad6bae1"
NOW = datetime(2026, 9, 24, 12, tzinfo=timezone.utc)


def _plan(*, explicit_request: bool = True):
    return plan_entity_evidence_research(
        EntityEvidenceResearchRequest(
            entity_id=ENTITY_ID,
            entity_kind="builder",
            origin_kind="manual",
            assessment_state="high_fit",
            explicit_request=explicit_request,
            public_sources=["github"],
        )
    )


def _record(
    *,
    source_post_id: str = POST_ID,
    author_locator: str = "indie-builder",
    body: str = "We are evaluating outbound automation tools versus manual prospect lists.",
) -> RetainedPublicSourceRecord:
    return RetainedPublicSourceRecord(
        source_post_id=source_post_id,
        source="github",
        author_locator=author_locator,
        body=body,
        observed_at=NOW,
        source_url="https://github.com/indie-builder/sample/issues/42",
    )


class _Result:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> list[dict[str, Any]]:
        return self.rows


class _Connection:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def execute(self, statement: Any, params: dict[str, Any]) -> _Result:
        self.calls.append((str(statement), params))
        return _Result(self.rows)


def test_only_strict_builder_profile_urls_resolve_to_retained_author_locators() -> None:
    github = resolve_retained_public_author_locator(
        entity_kind="builder",
        canonical_url="https://github.com/Indie-Builder/",
    )
    bluesky = resolve_retained_public_author_locator(
        entity_kind="builder",
        canonical_url="https://bsky.app/profile/alice.bsky.social",
    )
    hacker_news = resolve_retained_public_author_locator(
        entity_kind="builder",
        canonical_url="https://news.ycombinator.com/user?id=Alice_42",
    )

    assert github == RetainedPublicAuthorLocator("github", "indie-builder")
    assert bluesky == RetainedPublicAuthorLocator("bluesky", "alice.bsky.social")
    assert hacker_news == RetainedPublicAuthorLocator("hackernews", "alice_42")
    assert (
        resolve_retained_public_author_locator(
            entity_kind="project",
            canonical_url="https://github.com/indie-builder/project",
        )
        is None
    )
    assert (
        resolve_retained_public_author_locator(
            entity_kind="builder",
            canonical_url="https://github.com/indie-builder/project",
        )
        is None
    )


def test_retained_row_query_is_global_exact_author_lookup_with_a_hard_limit() -> None:
    connection = _Connection(
        [
            {
                "id": POST_ID,
                "source": "github",
                "author_handle": "Indie-Builder",
                "body": "We are evaluating outbound automation tools versus manual prospect lists.",
                "observed_at": NOW,
                "source_url": "https://github.com/indie-builder/sample/issues/42",
            }
        ]
    )

    records = load_retained_public_author_records(
        connection,  # type: ignore[arg-type]
        locator=RetainedPublicAuthorLocator("github", "indie-builder"),
        limit=3,
    )

    assert len(records) == 1
    assert records[0].author_locator == "indie-builder"
    sql, params = connection.calls[0]
    assert "post.tenant_id IS NULL" in sql
    assert "post.source_post_id IS NOT NULL" in sql
    assert "LOWER(post.author_handle) = :author_locator" in sql
    assert "ILIKE" not in sql
    assert "metadata" not in sql
    assert params == {
        "source": "github",
        "author_locator": "indie-builder",
        "body_limit": 12000,
        "limit": 3,
    }


def test_direct_evaluation_language_becomes_pending_cited_evidence_not_a_buyer_claim() -> None:
    record = _record()
    batch = propose_retained_public_evaluation_evidence(
        _plan(),
        targeting_profile_id=PROFILE_ID,
        research_run_id=RUN_ID,
        locator=RetainedPublicAuthorLocator("github", "indie-builder"),
        records=[record],
    )

    assert len(batch.evidence) == 1
    evidence = batch.evidence[0]
    assert evidence.evidence_type == "evaluation"
    assert evidence.evidence_strength == "strong"
    assert evidence.evidence_status == "pending"
    assert evidence.source_post_id == POST_ID
    assert evidence.source_url is None
    assert evidence.evidence_excerpt == record.body
    assert "buyer" not in evidence.summary.casefold()
    assert "strong buyer signal" not in evidence.summary.casefold()
    assert record.body not in repr(record)


def test_configured_strong_definition_can_only_downgrade_an_evidence_label() -> None:
    record = _record()

    batch = propose_retained_public_evaluation_evidence(
        _plan(),
        targeting_profile_id=PROFILE_ID,
        research_run_id=RUN_ID,
        locator=RetainedPublicAuthorLocator("github", "indie-builder"),
        records=[record],
        strong_evidence_definitions=("migrating away from a competitor",),
    )

    assert len(batch.evidence) == 1
    assert batch.evidence[0].evidence_strength == "moderate"


def test_mismatched_or_non_evaluation_rows_cannot_create_evidence() -> None:
    mismatched = _record(author_locator="other-builder")
    no_evaluation = _record(
        source_post_id="b8f98dd0-ae08-4bf9-b776-39c63a4e2f82",
        body="We shipped a small update today.",
    )

    batch = propose_retained_public_evaluation_evidence(
        _plan(),
        targeting_profile_id=PROFILE_ID,
        research_run_id=RUN_ID,
        locator=RetainedPublicAuthorLocator("github", "indie-builder"),
        records=[mismatched, no_evaluation],
    )

    assert batch.evidence == ()
    assert batch.skipped_by_reason == {
        "author_locator_mismatch": 1,
        "no_direct_evaluation_language": 1,
    }


def test_an_excerpt_that_would_be_redacted_is_not_persisted_as_false_provenance() -> None:
    contact_bearing = _record(
        body="We are evaluating prospecting tools versus manual work; email founder@example.com.",
    )

    batch = propose_retained_public_evaluation_evidence(
        _plan(),
        targeting_profile_id=PROFILE_ID,
        research_run_id=RUN_ID,
        locator=RetainedPublicAuthorLocator("github", "indie-builder"),
        records=[contact_bearing],
    )

    assert batch.evidence == ()
    assert batch.skipped_by_reason == {"no_direct_evaluation_language": 1}


def test_an_unplanned_research_request_cannot_consume_retained_records() -> None:
    batch = propose_retained_public_evaluation_evidence(
        _plan(explicit_request=False),
        targeting_profile_id=PROFILE_ID,
        research_run_id=RUN_ID,
        locator=RetainedPublicAuthorLocator("github", "indie-builder"),
        records=[_record()],
    )

    assert batch.evidence == ()
    assert batch.skipped_by_reason == {"research_not_planned": 1}


def test_retained_reader_rejects_an_unbounded_lookup() -> None:
    with pytest.raises(ValueError, match="between 1 and 10"):
        load_retained_public_author_records(
            _Connection([]),  # type: ignore[arg-type]
            locator=RetainedPublicAuthorLocator("github", "indie-builder"),
            limit=11,
        )
