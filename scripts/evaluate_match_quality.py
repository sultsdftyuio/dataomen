"""Run offline quality gates for public-post discovery admission.

Example:
    .venv\\Scripts\\python.exe scripts/evaluate_match_quality.py \
        tests/fixtures/match_evaluation_cases.jsonl --min-recall 0.8
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

# Running ``python scripts/evaluate_match_quality.py`` places ``scripts`` (not
# the repository root) on sys.path.  Add the root explicitly so this remains a
# useful standalone CI command as well as an importable module in tests.
_REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(_REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPOSITORY_ROOT))

from api.services.social.match_evaluation import (
    evaluate_discovery_admission_cases,
    load_labeled_discovery_admission_cases,
    quality_gate_failures,
)


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate discovery-admission recall and precision from a labeled JSONL corpus. "
            "The JSON report contains aggregate metrics and case IDs only."
        )
    )
    parser.add_argument("cases", type=Path, help="Path to labeled JSONL cases")
    parser.add_argument(
        "--min-precision",
        type=float,
        default=None,
        help="Fail when measured precision is below this inclusive 0..1 threshold.",
    )
    parser.add_argument(
        "--min-recall",
        type=float,
        default=None,
        help="Fail when measured recall is below this inclusive 0..1 threshold.",
    )
    parser.add_argument(
        "--min-f1",
        type=float,
        default=None,
        help="Fail when measured F1 is below this inclusive 0..1 threshold.",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Emit compact JSON instead of indented JSON.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_argument_parser()
    arguments = parser.parse_args(argv)

    try:
        cases = load_labeled_discovery_admission_cases(arguments.cases)
        report = evaluate_discovery_admission_cases(cases)
        failures = quality_gate_failures(
            report,
            min_precision=arguments.min_precision,
            min_recall=arguments.min_recall,
            min_f1=arguments.min_f1,
        )
    except (OSError, ValueError) as exc:
        parser.error(str(exc))

    payload = report.to_dict()
    payload["quality_gates"] = {
        "min_precision": arguments.min_precision,
        "min_recall": arguments.min_recall,
        "min_f1": arguments.min_f1,
        "failed": list(failures),
        "passed": not failures,
    }
    if arguments.compact:
        print(json.dumps(payload, sort_keys=True))
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if failures else 0


if __name__ == "__main__":  # pragma: no cover - exercised through the CLI.
    raise SystemExit(main())
