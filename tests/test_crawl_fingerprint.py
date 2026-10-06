"""Near-duplicate detection for the profile extraction cache."""

from __future__ import annotations

import random

from api.services.crawl_fingerprint import (
    fingerprint_distance,
    fingerprints_match,
    markdown_fingerprint,
)
from api.services.crawling import (
    _cached_service_profile_for_markdown,
    _profile_document,
)
from api.services.profile_extraction import ServiceProfileDraft
from tests.test_profile_extraction import _profile_payload

WEBSITE_URL = "https://ledgerflow.example/"
COLUMNS = {"profile_json": {}, "website_url": {}, "updated_at": {}}

_VOCABULARY = [f"term{index}" for index in range(3_000)]


def _site_markdown(seed: int, words: int = 6_000) -> str:
    generator = random.Random(seed)
    return " ".join(generator.choice(_VOCABULARY) for _ in range(words))


def _rewrite(markdown: str, fraction: float, seed: int) -> str:
    """Replace one contiguous block, as a rewritten section would."""

    generator = random.Random(seed)
    words = markdown.split()
    length = int(len(words) * fraction)
    start = generator.randrange(0, len(words) - length)
    words[start : start + length] = [generator.choice(_VOCABULARY) for _ in range(length)]
    return " ".join(words)


def test_dates_and_counters_do_not_change_the_fingerprint() -> None:
    markdown = _site_markdown(1)
    churned = markdown.replace("term10 ", "term10 2026 ", 3) + " 1,204 2027"

    assert markdown_fingerprint(markdown) == markdown_fingerprint(churned)


def test_a_small_edit_matches_and_a_rewrite_does_not() -> None:
    markdown = _site_markdown(1)
    original = markdown_fingerprint(markdown)

    for seed in range(8):
        small_edit = markdown_fingerprint(_rewrite(markdown, 0.001, seed))
        rewrite = markdown_fingerprint(_rewrite(markdown, 0.25, seed))
        assert fingerprints_match(original, small_edit), seed
        assert not fingerprints_match(original, rewrite), seed

    assert not fingerprints_match(original, markdown_fingerprint(_site_markdown(2)))


def test_missing_or_malformed_fingerprints_never_match() -> None:
    fingerprint = markdown_fingerprint(_site_markdown(1))

    assert markdown_fingerprint("") == ""
    assert markdown_fingerprint("two words") == ""
    for other in (None, "", "not-hex-at-all!!", "abc", 42):
        assert not fingerprints_match(fingerprint, other)
        assert not fingerprints_match(other, fingerprint)
    assert fingerprint_distance("zz", fingerprint) is None


class _Connection:
    def __init__(self, document: dict[str, object]) -> None:
        self.document = document

    def execute(self, *_args: object, **_kwargs: object) -> "_Connection":
        return self

    def mappings(self) -> list[dict[str, object]]:
        return [{"profile_json": self.document}]


def _stored_document(markdown: str) -> dict[str, object]:
    profile = ServiceProfileDraft.model_validate(_profile_payload()).model_dump()
    profile["crawl_markdown_fingerprint"] = markdown_fingerprint(markdown)
    return _profile_document(profile, WEBSITE_URL, crawl_markdown_sha256="a" * 64)


def _lookup(document: dict[str, object], markdown: str) -> dict[str, object] | None:
    return _cached_service_profile_for_markdown(
        _Connection(document),
        tenant_id="tenant-1",
        website_url=WEBSITE_URL,
        # A different exact hash: any hit must come from the fingerprint.
        crawl_markdown_sha256="b" * 64,
        columns=COLUMNS,
        crawl_markdown_fingerprint=markdown_fingerprint(markdown),
    )


def test_an_effectively_unchanged_site_reuses_its_extracted_profile() -> None:
    markdown = _site_markdown(1)
    document = _stored_document(markdown)

    cached = _lookup(document, _rewrite(markdown, 0.001, seed=4))

    assert cached is not None
    assert cached["one_liner"] == document["one_liner"]


def test_the_near_duplicate_cache_can_be_switched_off(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_PROFILE_NEAR_DUPLICATE_CACHE_ENABLED", "false")
    markdown = _site_markdown(1)

    assert _lookup(_stored_document(markdown), markdown) is None


def test_a_rewritten_site_is_extracted_again() -> None:
    markdown = _site_markdown(1)

    assert _lookup(_stored_document(markdown), _rewrite(markdown, 0.25, seed=4)) is None


def test_a_profile_stored_before_fingerprints_still_needs_an_exact_match() -> None:
    markdown = _site_markdown(1)
    document = _stored_document(markdown)
    document.pop("crawl_markdown_fingerprint")

    assert _lookup(document, markdown) is None


def test_a_reused_profile_keeps_the_fingerprint_of_its_extraction() -> None:
    markdown = _site_markdown(1)
    document = _stored_document(markdown)

    # Re-persisting a cache hit must not adopt the newer crawl's fingerprint,
    # or gradual drift would never add up to a re-extraction.
    persisted_again = _profile_document(document, WEBSITE_URL, crawl_markdown_sha256="b" * 64)

    assert persisted_again["crawl_markdown_fingerprint"] == markdown_fingerprint(markdown)
    assert persisted_again["crawl_markdown_sha256"] == "b" * 64
