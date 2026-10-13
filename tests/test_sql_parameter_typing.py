"""Guard SQL that only works when the driver inlines parameter values.

Psycopg 3 binds parameters on the server, so PostgreSQL must infer every
parameter's type from its position. A function that accepts any type gives it
nothing to infer from and the statement is rejected with "could not determine
data type of parameter". Psycopg 2 inlined the value, which hid the problem,
and a connection double cannot reveal it: this check reads the SQL itself.
"""

from __future__ import annotations

import re
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "api"

# Variadic "any" functions: an argument has no type unless the SQL gives one.
ANY_TYPE_FUNCTIONS = (
    "jsonb_build_object",
    "json_build_object",
    "jsonb_build_array",
    "json_build_array",
)
_CALL = re.compile(r"\b(" + "|".join(ANY_TYPE_FUNCTIONS) + r")\s*\(")
_TYPED_PARAMETER = re.compile(
    r"CAST\(\s*:\w+\s+AS\s+[^)]+\)|:\w+::\w+",
    re.IGNORECASE,
)
_BARE_PARAMETER = re.compile(r"(?<![:\w]):[A-Za-z_]\w*")


def _call_spans(source: str) -> list[tuple[int, int]]:
    """Return ``(start, end)`` of each outermost builder call's arguments."""
    spans: list[tuple[int, int]] = []
    covered_until = 0
    for match in _CALL.finditer(source):
        if match.start() < covered_until:
            continue  # nested inside a call that is already being checked
        depth = 1
        position = match.end()
        while position < len(source) and depth:
            character = source[position]
            depth += character == "("
            depth -= character == ")"
            position += 1
        spans.append((match.end(), position - 1))
        covered_until = position
    return spans


def untyped_parameters(source: str) -> list[str]:
    """Return bare ``:name`` parameters passed to an any-type SQL function."""
    found: list[str] = []
    for start, end in _call_spans(source):
        arguments = _TYPED_PARAMETER.sub("", source[start:end])
        found.extend(_BARE_PARAMETER.findall(arguments))
    return found


def test_the_check_recognises_typed_and_untyped_arguments() -> None:
    assert untyped_parameters("SELECT jsonb_build_object(:key, 1)") == [":key"]
    assert untyped_parameters(
        "jsonb_build_object('a', jsonb_build_object('b', :inner))"
    ) == [":inner"]
    assert untyped_parameters(
        "jsonb_build_object(CAST(:key AS text), CAST(:value AS jsonb), 'n', :count::integer)"
    ) == []
    assert untyped_parameters(
        "x @> jsonb_build_array(CAST(:entity_kind AS text)) AND y = :unrelated"
    ) == []
    # A cast elsewhere in the statement does not type a builder argument.
    assert untyped_parameters(
        "SELECT CAST(:a AS text), json_build_array(:a)"
    ) == [":a"]


def test_no_backend_statement_passes_an_untyped_parameter_to_a_json_builder() -> None:
    offenders = {
        str(path.relative_to(BACKEND_ROOT.parent)).replace("\\", "/"): parameters
        for path in sorted(BACKEND_ROOT.rglob("*.py"))
        if (parameters := untyped_parameters(path.read_text(encoding="utf-8")))
    }

    assert offenders == {}, (
        "Give each parameter an explicit CAST(:name AS type) inside "
        f"{', '.join(ANY_TYPE_FUNCTIONS)}: {offenders}"
    )


def test_the_embedding_cache_write_types_every_builder_argument() -> None:
    for relative in ("services/social/public_records.py", "services/social/legacy_storage.py"):
        source = (BACKEND_ROOT / relative).read_text(encoding="utf-8")

        assert "CAST(:cache_key AS text)" in source
        assert "'model', CAST(:embedding_model AS text)" in source
        assert "'text_sha256', CAST(:text_sha256 AS text)" in source
        assert "'embedding', CAST(:embedding AS jsonb)" in source
        assert "'dimensions', CAST(:dimensions AS integer)" in source
