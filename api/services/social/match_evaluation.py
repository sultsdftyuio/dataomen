"""Offline quality measurement for the public-post discovery admission guard.

The production guard intentionally stays a cheap, recall-oriented filter.  This
module lets us measure its behavior against a versioned, labeled JSONL corpus
without sending any post content to logs or changing the ingestion contract.
"""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .activation import _source_post_discovery_admission


_POSITIVE_LABELS = frozenset(
    {
        "positive",
        "admit",
        "accepted",
        "relevant",
        "keep",
        "true",
    }
)
_NEGATIVE_LABELS = frozenset(
    {
        "negative",
        "reject",
        "rejected",
        "irrelevant",
        "drop",
        "false",
    }
)


@dataclass(frozen=True)
class LabeledDiscoveryAdmissionCase:
    """One labeled example for recall-stage discovery admission.

    ``post`` is retained only while evaluation runs.  It is deliberately not
    exposed in :class:`DiscoveryAdmissionEvaluationReport` so command output
    and CI artifacts cannot inadvertently publish source-post content.
    """

    case_id: str
    query: str
    expected_admitted: bool
    post: Mapping[str, Any]
    query_type: str | None = None


@dataclass(frozen=True)
class DiscoveryAdmissionEvaluationReport:
    """Aggregate-only outcome of evaluating labeled discovery examples."""

    case_count: int
    positive_case_count: int
    negative_case_count: int
    true_positive_count: int
    false_positive_count: int
    false_negative_count: int
    true_negative_count: int
    precision: float
    recall: float
    f1: float
    signal_counts: dict[str, int]
    accepted_case_ids: tuple[str, ...]
    rejected_case_ids: tuple[str, ...]
    false_positive_case_ids: tuple[str, ...]
    false_negative_case_ids: tuple[str, ...]
    evaluation_error_counts: dict[str, int]
    evaluation_error_case_ids: tuple[str, ...]
    query_type_outcomes: dict[str, dict[str, int]] = field(default_factory=dict)
    source_outcomes: dict[str, dict[str, int]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-safe report that contains identifiers, never post text."""

        return {
            "case_count": self.case_count,
            "positive_case_count": self.positive_case_count,
            "negative_case_count": self.negative_case_count,
            "confusion_matrix": {
                "true_positive": self.true_positive_count,
                "false_positive": self.false_positive_count,
                "false_negative": self.false_negative_count,
                "true_negative": self.true_negative_count,
            },
            "metrics": {
                "precision": self.precision,
                "recall": self.recall,
                "f1": self.f1,
            },
            "signal_counts": dict(sorted(self.signal_counts.items())),
            "accepted_case_ids": list(self.accepted_case_ids),
            "rejected_case_ids": list(self.rejected_case_ids),
            "false_positive_case_ids": list(self.false_positive_case_ids),
            "false_negative_case_ids": list(self.false_negative_case_ids),
            "evaluation_error_counts": dict(sorted(self.evaluation_error_counts.items())),
            "evaluation_error_case_ids": list(self.evaluation_error_case_ids),
            # These are aggregate-only dimensions. They make it possible to
            # spot a weak query class or source without serialising public
            # post text into CI output or operational logs.
            "query_type_outcomes": _sorted_outcomes(self.query_type_outcomes),
            "source_outcomes": _sorted_outcomes(self.source_outcomes),
        }


def load_labeled_discovery_admission_cases(
    path: str | Path,
) -> list[LabeledDiscoveryAdmissionCase]:
    """Load a labeled JSONL corpus while keeping malformed corpus rows explicit.

    Expected JSONL shape::

        {"id": "case-1", "label": "positive", "query": "...",
         "query_type": "recommendation_request",
         "post": {"title": "...", "body": "...", "metadata": {}}}

    ``label`` may use one of the documented positive/negative aliases, or an
    explicit boolean ``expected_admitted``.  Parser errors include only a line
    number and field name, never source text.
    """

    corpus_path = Path(path)
    cases: list[LabeledDiscoveryAdmissionCase] = []
    seen_case_ids: set[str] = set()

    with corpus_path.open("r", encoding="utf-8") as corpus_file:
        for line_number, raw_line in enumerate(corpus_file, start=1):
            if not raw_line.strip():
                continue
            try:
                payload = json.loads(raw_line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"Invalid JSONL at line {line_number}: {exc.msg}"
                ) from exc
            if not isinstance(payload, Mapping):
                raise ValueError(f"Invalid evaluation case at line {line_number}: object required")

            case_id = _required_non_empty_string(payload, "id", line_number)
            if case_id in seen_case_ids:
                raise ValueError(f"Duplicate evaluation case id at line {line_number}: {case_id}")
            seen_case_ids.add(case_id)

            query = _required_non_empty_string(payload, "query", line_number)
            expected_admitted = _expected_admitted(payload, line_number)
            post = payload.get("post")
            if not isinstance(post, Mapping):
                raise ValueError(
                    f"Invalid evaluation case at line {line_number}: post object required"
                )

            query_type_value = payload.get("query_type")
            if query_type_value is not None and not isinstance(query_type_value, str):
                raise ValueError(
                    f"Invalid evaluation case at line {line_number}: query_type must be a string"
                )
            query_type = query_type_value.strip() if isinstance(query_type_value, str) else None
            cases.append(
                LabeledDiscoveryAdmissionCase(
                    case_id=case_id,
                    query=query,
                    expected_admitted=expected_admitted,
                    post=dict(post),
                    query_type=query_type or None,
                )
            )

    return cases


def evaluate_discovery_admission_cases(
    cases: Sequence[LabeledDiscoveryAdmissionCase],
) -> DiscoveryAdmissionEvaluationReport:
    """Evaluate the actual discovery admission guard against a labeled corpus.

    A broken individual provider-shaped post is counted as a rejected
    evaluation error rather than preventing the rest of a benchmark run.  The
    report remains content-free so it is safe to attach to CI or worker logs.
    """

    true_positive_count = 0
    false_positive_count = 0
    false_negative_count = 0
    true_negative_count = 0
    positive_case_count = 0
    signal_counts: Counter[str] = Counter()
    accepted_case_ids: list[str] = []
    rejected_case_ids: list[str] = []
    false_positive_case_ids: list[str] = []
    false_negative_case_ids: list[str] = []
    evaluation_error_counts: Counter[str] = Counter()
    evaluation_error_case_ids: list[str] = []
    query_type_outcomes: dict[str, Counter[str]] = {}
    source_outcomes: dict[str, Counter[str]] = {}

    for case in cases:
        if case.expected_admitted:
            positive_case_count += 1

        try:
            admission = _source_post_discovery_admission(
                case.post,
                case.query,
                query_type=case.query_type,
            )
            admitted = admission.accepted
            signal_counts.update(admission.reasons)
        except Exception as exc:  # Defensive: one malformed test record is not a batch failure.
            admitted = False
            evaluation_error_counts[exc.__class__.__name__] += 1
            evaluation_error_case_ids.append(case.case_id)
            signal_counts["admission_evaluation_failed"] += 1

        if admitted:
            accepted_case_ids.append(case.case_id)
        else:
            rejected_case_ids.append(case.case_id)

        if case.expected_admitted and admitted:
            true_positive_count += 1
        elif case.expected_admitted:
            false_negative_count += 1
            false_negative_case_ids.append(case.case_id)
        elif admitted:
            false_positive_count += 1
            false_positive_case_ids.append(case.case_id)
        else:
            true_negative_count += 1

        _record_outcome(
            query_type_outcomes,
            case.query_type or "untyped",
            expected_admitted=case.expected_admitted,
            admitted=admitted,
        )
        _record_outcome(
            source_outcomes,
            _case_source(case.post),
            expected_admitted=case.expected_admitted,
            admitted=admitted,
        )

    precision = _safe_ratio(true_positive_count, true_positive_count + false_positive_count)
    recall = _safe_ratio(true_positive_count, true_positive_count + false_negative_count)
    f1 = _safe_ratio(2 * precision * recall, precision + recall)
    return DiscoveryAdmissionEvaluationReport(
        case_count=len(cases),
        positive_case_count=positive_case_count,
        negative_case_count=len(cases) - positive_case_count,
        true_positive_count=true_positive_count,
        false_positive_count=false_positive_count,
        false_negative_count=false_negative_count,
        true_negative_count=true_negative_count,
        precision=precision,
        recall=recall,
        f1=f1,
        signal_counts=dict(signal_counts),
        accepted_case_ids=tuple(accepted_case_ids),
        rejected_case_ids=tuple(rejected_case_ids),
        false_positive_case_ids=tuple(false_positive_case_ids),
        false_negative_case_ids=tuple(false_negative_case_ids),
        evaluation_error_counts=dict(evaluation_error_counts),
        evaluation_error_case_ids=tuple(evaluation_error_case_ids),
        query_type_outcomes={
            key: dict(value) for key, value in query_type_outcomes.items()
        },
        source_outcomes={key: dict(value) for key, value in source_outcomes.items()},
    )


def quality_gate_failures(
    report: DiscoveryAdmissionEvaluationReport,
    *,
    min_precision: float | None = None,
    min_recall: float | None = None,
    min_f1: float | None = None,
) -> tuple[str, ...]:
    """Return deterministic quality-gate names that do not meet their target."""

    gates = {
        "precision": min_precision,
        "recall": min_recall,
        "f1": min_f1,
    }
    observed = {
        "precision": report.precision,
        "recall": report.recall,
        "f1": report.f1,
    }
    failures: list[str] = []
    for gate_name, minimum in gates.items():
        if minimum is None:
            continue
        _validate_quality_threshold(gate_name, minimum)
        if observed[gate_name] < minimum:
            failures.append(gate_name)
    return tuple(failures)


def _required_non_empty_string(
    payload: Mapping[str, Any],
    field_name: str,
    line_number: int,
) -> str:
    value = payload.get(field_name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            f"Invalid evaluation case at line {line_number}: {field_name} non-empty string required"
        )
    return value.strip()


def _expected_admitted(payload: Mapping[str, Any], line_number: int) -> bool:
    explicit_value = payload.get("expected_admitted")
    if isinstance(explicit_value, bool):
        return explicit_value
    if "expected_admitted" in payload:
        raise ValueError(
            f"Invalid evaluation case at line {line_number}: expected_admitted must be boolean"
        )

    label = payload.get("label")
    if not isinstance(label, str):
        raise ValueError(
            f"Invalid evaluation case at line {line_number}: label or expected_admitted required"
        )
    normalized_label = label.strip().casefold()
    if normalized_label in _POSITIVE_LABELS:
        return True
    if normalized_label in _NEGATIVE_LABELS:
        return False
    raise ValueError(f"Invalid evaluation case at line {line_number}: unsupported label")


def _safe_ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def _case_source(post: Mapping[str, Any]) -> str:
    """Return a stable, content-free source label for an evaluation case."""

    value = post.get("source")
    if not isinstance(value, str) or not value.strip():
        return "unknown"
    return value.strip().casefold()


def _record_outcome(
    outcomes: dict[str, Counter[str]],
    group: str,
    *,
    expected_admitted: bool,
    admitted: bool,
) -> None:
    """Increment an aggregate confusion-matrix slice without retaining text."""

    bucket = outcomes.setdefault(group, Counter())
    bucket["case_count"] += 1
    bucket["expected_positive" if expected_admitted else "expected_negative"] += 1
    bucket["admitted" if admitted else "rejected"] += 1
    if expected_admitted and admitted:
        bucket["true_positive"] += 1
    elif expected_admitted:
        bucket["false_negative"] += 1
    elif admitted:
        bucket["false_positive"] += 1
    else:
        bucket["true_negative"] += 1


def _sorted_outcomes(
    outcomes: Mapping[str, Mapping[str, int]],
) -> dict[str, dict[str, int]]:
    return {
        group: {
            outcome: int(count)
            for outcome, count in sorted(counts.items())
        }
        for group, counts in sorted(outcomes.items())
    }


def _validate_quality_threshold(gate_name: str, value: float) -> None:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
        raise ValueError(f"{gate_name} quality threshold must be between 0 and 1")
