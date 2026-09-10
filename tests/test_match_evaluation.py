"""Regression tests for the offline discovery-admission quality harness."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import api.services.social.match_evaluation as match_evaluation
from api.services.social.match_evaluation import (
    LabeledDiscoveryAdmissionCase,
    evaluate_discovery_admission_cases,
    load_labeled_discovery_admission_cases,
    quality_gate_failures,
)
from scripts.evaluate_match_quality import main


_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "match_evaluation_cases.jsonl"


def test_evaluation_report_measures_actual_admission_logic_without_post_text() -> None:
    report = evaluate_discovery_admission_cases(
        load_labeled_discovery_admission_cases(_FIXTURE_PATH)
    )

    assert report.case_count == 5
    assert report.precision == 1.0
    assert report.recall == 1.0
    assert report.f1 == 1.0
    assert "indirect_intent" in report.signal_counts
    assert report.false_positive_case_ids == ()
    assert report.false_negative_case_ids == ()

    serialized = json.dumps(report.to_dict())
    assert "manual reconciliation" not in serialized
    assert "architecture should" not in serialized


def test_empty_or_one_sided_corpora_have_finite_safe_metrics() -> None:
    empty = evaluate_discovery_admission_cases([])
    assert (empty.precision, empty.recall, empty.f1) == (0.0, 0.0, 0.0)

    rejected_positive = evaluate_discovery_admission_cases(
        [
            LabeledDiscoveryAdmissionCase(
                case_id="short-positive",
                query="workflow automation",
                expected_admitted=True,
                post={"body": "hello"},
            )
        ]
    )
    assert (rejected_positive.precision, rejected_positive.recall, rejected_positive.f1) == (
        0.0,
        0.0,
        0.0,
    )


def test_one_malformed_post_is_recorded_without_stopping_the_evaluation_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actual_admission = match_evaluation._source_post_discovery_admission

    def fail_for_marked_post(
        post: object,
        query: str,
        *,
        query_type: str | None = None,
    ) -> object:
        if isinstance(post, dict) and post.get("body") == "malformed provider property":
            raise RuntimeError("malformed provider property")
        return actual_admission(post, query, query_type=query_type)

    monkeypatch.setattr(
        match_evaluation,
        "_source_post_discovery_admission",
        fail_for_marked_post,
    )

    report = evaluate_discovery_admission_cases(
        [
            LabeledDiscoveryAdmissionCase(
                case_id="malformed-post",
                query="workflow automation",
                expected_admitted=False,
                post={"body": "malformed provider property"},
            ),
            LabeledDiscoveryAdmissionCase(
                case_id="healthy-post",
                query="workflow automation",
                expected_admitted=True,
                post={"body": "We need to automate our manual workflow."},
            ),
        ]
    )

    assert report.case_count == 2
    assert report.evaluation_error_counts == {"RuntimeError": 1}
    assert report.evaluation_error_case_ids == ("malformed-post",)
    assert report.accepted_case_ids == ("healthy-post",)


def test_quality_gates_are_inclusive_and_report_only_failed_dimensions() -> None:
    report = evaluate_discovery_admission_cases(
        load_labeled_discovery_admission_cases(_FIXTURE_PATH)
    )

    assert quality_gate_failures(report, min_precision=1.0, min_recall=1.0) == ()
    rejected_positive = evaluate_discovery_admission_cases(
        [
            LabeledDiscoveryAdmissionCase(
                case_id="short-positive",
                query="workflow automation",
                expected_admitted=True,
                post={"body": "hello"},
            )
        ]
    )
    assert quality_gate_failures(rejected_positive, min_f1=0.1) == ("f1",)
    with pytest.raises(ValueError, match="between 0 and 1"):
        quality_gate_failures(report, min_f1=1.01)


def test_cli_emits_aggregate_json_and_returns_nonzero_for_failed_gate(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    successful_exit = main([str(_FIXTURE_PATH), "--min-precision", "1", "--compact"])
    successful_payload = json.loads(capsys.readouterr().out)

    assert successful_exit == 0
    assert successful_payload["quality_gates"]["passed"] is True
    assert "body" not in successful_payload

    failing_corpus = tmp_path / "failing-cases.jsonl"
    failing_corpus.write_text(
        '{"id":"short-positive","label":"positive","query":"workflow automation","post":{"body":"hello"}}\n',
        encoding="utf-8",
    )
    failed_exit = main([str(failing_corpus), "--min-recall", "0.1", "--compact"])
    failed_payload = json.loads(capsys.readouterr().out)

    assert failed_exit == 1
    assert failed_payload["quality_gates"]["failed"] == ["recall"]
