"""Coverage for which statements persisting one lead match issues."""

from __future__ import annotations

from unittest.mock import patch

from api.services.social import legacy_storage
from api.services.social.models import SocialPost
from api.services.verifier import VERIFIER_POLICY_VERSION, VerificationResult

JSON = {"data_type": "jsonb", "udt_name": "jsonb"}
TEXT = {"data_type": "text", "udt_name": "text"}
UUID = {"data_type": "uuid", "udt_name": "uuid"}
COLUMNS = {
    "tenant_id": TEXT,
    "service_profile_id": UUID,
    "source_post_id": UUID,
    "match_status": TEXT,
    "verifier_score": {"data_type": "double precision", "udt_name": "float8"},
    "verification": JSON,
    "source_post": JSON,
    "metadata": JSON,
    "updated_at": {"data_type": "timestamp with time zone", "udt_name": "timestamptz"},
}
POST = SocialPost(
    source="hackernews",
    external_id="42",
    title="Need a billing tool",
    text="We reconcile invoices by hand every month.",
)
VERDICT = VerificationResult(
    match=True,
    decision_label="strong_match",
    confidence=0.9,
    pain_detected="Manual invoice reconciliation",
    why_this_matches="The author asks for a billing tool.",
)


class RecordingConnection:
    def __init__(self, *, existing_id: str | None = None) -> None:
        self.existing_id = existing_id
        self.statements: list[str] = []

    def execute(self, statement, _params):
        self.statements.append(" ".join(str(statement).split()))
        return self

    def scalar_one_or_none(self):
        return self.existing_id


def _persist(conn: RecordingConnection, **overrides: object) -> None:
    arguments: dict[str, object] = {
        "tenant_id": "tenant-a",
        "service_profile_id": "00000000-0000-0000-0000-0000000000aa",
        "source_post_id": "00000000-0000-0000-0000-000000000001",
        "post": POST,
        "similarity_score": 0.7,
        "verification": VERDICT,
        "profile_embedding_sha256": "profile-hash",
        "verifier_model": "test-verifier-model",
        "verifier_policy_version": VERIFIER_POLICY_VERSION,
    }
    arguments.update(overrides)
    with patch.object(legacy_storage, "_table_columns", return_value=COLUMNS):
        legacy_storage._persist_lead_match(conn, **arguments)  # type: ignore[arg-type]


def test_a_profile_scoped_match_is_one_upsert_with_no_prior_lookup() -> None:
    conn = RecordingConnection()

    _persist(conn)

    assert len(conn.statements) == 1
    assert conn.statements[0].startswith("INSERT INTO public.lead_matches")
    assert "ON CONFLICT (tenant_id, service_profile_id, source_post_id)" in conn.statements[0]
    # A human's qualification must survive a later re-verification.
    assert "WHEN public.lead_matches.match_status = 'qualified' THEN 'qualified'" in conn.statements[0]


def test_a_match_without_a_profile_still_updates_its_existing_row() -> None:
    conn = RecordingConnection(existing_id="existing-match")

    _persist(conn, service_profile_id=None)

    assert len(conn.statements) == 2
    assert conn.statements[0].startswith("SELECT id FROM public.lead_matches")
    assert conn.statements[1].startswith("UPDATE public.lead_matches")


def test_a_match_without_a_profile_is_inserted_when_none_exists() -> None:
    conn = RecordingConnection()

    _persist(conn, service_profile_id=None)

    assert len(conn.statements) == 2
    assert conn.statements[0].startswith("SELECT id FROM public.lead_matches")
    assert conn.statements[1].startswith("INSERT INTO public.lead_matches")
    assert "ON CONFLICT" not in conn.statements[1]
