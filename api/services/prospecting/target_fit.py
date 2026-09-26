"""Deterministic execution of a tenant's approved targeting brief.

The targeting brief is a relevance policy, not an intent classifier.  This
module therefore scores only an already-authorized account, builder, or
project candidate from bounded public descriptors.  It never fetches a URL,
reads page text, infers a contact, or creates evidence.  In particular, a
change-trigger match can raise review priority but cannot move a target out of
``high_fit`` without separately accepted cited evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

from api.services.social.candidate_privacy import collapse_space

from .entity_first import ENTITY_KINDS, EntityKind, TargetingProfileInput, normalize_public_url


# A candidate that matches an enabled target type has enough relevance to be
# researched and, if it later has accepted direct evaluation evidence, to pass
# the existing strong-signal fit gate.  The threshold represents target fit,
# never a prediction that it will buy.
MINIMUM_QUALIFIED_FIT_SCORE = 0.5
MAX_TRAIT_BONUS = 0.35
FIT_PRIORITY_WEIGHT = 0.85
TRIGGER_PRIORITY_WEIGHT = 0.15
MAX_CONTEXT_TEXT_CHARS = 480

_TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]*", re.IGNORECASE)
_METADATA_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{0,80}$")
_EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![\w.-])"
)
_PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)"
)

# These words make a phrase readable but do not identify a target.  If a
# phrase contains only stop words, it is treated as non-matchable instead of
# allowing every candidate to match the brief accidentally.
_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "at",
        "by",
        "for",
        "from",
        "in",
        "is",
        "of",
        "on",
        "or",
        "the",
        "to",
        "with",
    }
)


def _score(value: Any, *, field_name: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be numeric")
    try:
        normalized = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be numeric") from error
    if not 0 <= normalized <= 1:
        raise ValueError(f"{field_name} must be between 0 and 1")
    return normalized


def _safe_context_text(value: Any, *, field_name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    normalized = collapse_space(value, maximum=MAX_CONTEXT_TEXT_CHARS)
    if not normalized:
        return None
    # Candidate context is intentionally transient, but direct contact data
    # must not even flow through a relevance scorer.
    if _EMAIL_PATTERN.search(normalized) or _PHONE_PATTERN.search(normalized):
        return None
    return normalized


def _tokens(value: str) -> frozenset[str]:
    return frozenset(token.casefold() for token in _TOKEN_PATTERN.findall(value))


def _meaningful_phrase_tokens(value: str) -> frozenset[str]:
    return frozenset(token for token in _tokens(value) if token not in _STOP_WORDS)


def _phrase_matches(phrase: str, candidate_tokens: frozenset[str]) -> bool:
    required = _meaningful_phrase_tokens(phrase)
    return bool(required) and required.issubset(candidate_tokens)


def _matching_count(phrases: tuple[str, ...], candidate_tokens: frozenset[str]) -> int:
    return sum(_phrase_matches(phrase, candidate_tokens) for phrase in phrases)


@dataclass(frozen=True)
class TargetFitCandidate:
    """The small safe descriptor allowed to execute a targeting brief.

    ``structured_description`` may come only from already-fetched JSON-LD or
    OpenGraph metadata.  It is transient and excluded from repr so worker
    errors and test diagnostics cannot become a page-content logging channel.
    """

    entity_kind: EntityKind
    canonical_url: str
    title: str | None = None
    metadata_type: str | None = None
    structured_description: str | None = field(default=None, repr=False)
    source_fit_score: float | None = None
    manual_fit_confirmed: bool = False

    def __post_init__(self) -> None:
        kind = str(self.entity_kind).strip().casefold()
        if kind not in ENTITY_KINDS:
            raise ValueError(f"unsupported entity_kind: {kind}")
        metadata_type = _safe_context_text(self.metadata_type, field_name="metadata_type")
        if metadata_type is not None:
            metadata_type = metadata_type.casefold()
            if not _METADATA_TYPE_PATTERN.fullmatch(metadata_type):
                raise ValueError("metadata_type is invalid")
        if not isinstance(self.manual_fit_confirmed, bool):
            raise ValueError("manual_fit_confirmed must be a boolean")

        object.__setattr__(self, "entity_kind", kind)
        object.__setattr__(self, "canonical_url", normalize_public_url(self.canonical_url))
        object.__setattr__(self, "title", _safe_context_text(self.title, field_name="title"))
        object.__setattr__(self, "metadata_type", metadata_type)
        object.__setattr__(
            self,
            "structured_description",
            _safe_context_text(self.structured_description, field_name="structured_description"),
        )
        object.__setattr__(
            self,
            "source_fit_score",
            _score(self.source_fit_score, field_name="source_fit_score"),
        )

    def descriptor_tokens(self) -> frozenset[str]:
        """Return only lexical tokens from allowed, already-known context."""

        parsed = urlsplit(self.canonical_url)
        # Query values are not needed for relevance and can contain arbitrary
        # user-provided text, so only host/path participate in matching.
        values = (
            parsed.hostname or "",
            parsed.path,
            self.title or "",
            self.metadata_type or "",
            self.structured_description or "",
        )
        return frozenset().union(*(_tokens(value) for value in values))


@dataclass(frozen=True)
class TargetFitAssessment:
    """Explainable relevance dimensions produced without an intent claim."""

    fit_score: float
    trigger_score: float
    priority_score: float
    reason_codes: tuple[str, ...]
    excluded: bool = False


def assess_target_fit(
    targeting_profile: TargetingProfileInput,
    candidate: TargetFitCandidate,
) -> TargetFitAssessment:
    """Apply one approved brief to one safe candidate descriptor.

    The rule is deliberately lexical and deterministic.  A phrase must have
    all of its meaningful tokens in the allowed descriptor; this avoids a
    single generic word broadening a target universe.  Exclusions take
    precedence for generated/provider candidates.  A deliberate manual
    selection is represented separately by ``manual_fit_confirmed`` so it can
    meet the fit threshold without being misrepresented as intent.
    """

    if not isinstance(targeting_profile, TargetingProfileInput):
        raise ValueError("targeting_profile must be a TargetingProfileInput")
    if not isinstance(candidate, TargetFitCandidate):
        raise ValueError("candidate must be a TargetFitCandidate")
    if candidate.entity_kind not in targeting_profile.target_types:
        raise ValueError("candidate entity_kind is not enabled by the targeting profile")

    candidate_tokens = candidate.descriptor_tokens()
    exclusion_matches = _matching_count(targeting_profile.exclusions, candidate_tokens)
    if exclusion_matches and not candidate.manual_fit_confirmed:
        return TargetFitAssessment(
            fit_score=0.0,
            trigger_score=0.0,
            priority_score=0.0,
            reason_codes=("brief_exclusion_match",),
            excluded=True,
        )

    trait_matches = _matching_count(targeting_profile.ideal_customer_traits, candidate_tokens)
    trigger_matches = _matching_count(targeting_profile.change_triggers, candidate_tokens)

    fit_score = MINIMUM_QUALIFIED_FIT_SCORE
    reason_codes: list[str] = ["brief_target_type_match"]
    if targeting_profile.ideal_customer_traits:
        if trait_matches:
            fit_score += MAX_TRAIT_BONUS * (
                trait_matches / len(targeting_profile.ideal_customer_traits)
            )
            reason_codes.append("brief_trait_match")
        else:
            reason_codes.append("brief_traits_unmatched")
    else:
        reason_codes.append("brief_traits_not_configured")

    if candidate.source_fit_score is not None:
        # A licensed provider's bounded entity-level relevance score can add
        # signal after the brief's type/exclusion gate. It cannot bypass an
        # exclusion, become evidence, or become buyer intent.
        fit_score = max(fit_score, candidate.source_fit_score)
        reason_codes.append("source_fit_score_considered")
    if candidate.manual_fit_confirmed:
        # Explicit user selection confirms relevance only. It does not alter
        # trigger/evaluation/need dimensions and therefore cannot imply intent.
        fit_score = max(fit_score, MINIMUM_QUALIFIED_FIT_SCORE)
        reason_codes.append("manual_target_confirmed_fit")
        if exclusion_matches:
            reason_codes.append("brief_exclusion_manual_override")

    trigger_score = (
        trigger_matches / len(targeting_profile.change_triggers)
        if targeting_profile.change_triggers
        else 0.0
    )
    if trigger_matches:
        reason_codes.append("brief_trigger_match")

    fit_score = round(min(1.0, fit_score), 4)
    trigger_score = round(min(1.0, trigger_score), 4)
    priority_score = round(
        min(1.0, fit_score * FIT_PRIORITY_WEIGHT + trigger_score * TRIGGER_PRIORITY_WEIGHT)
        * 100,
        2,
    )
    return TargetFitAssessment(
        fit_score=fit_score,
        trigger_score=trigger_score,
        priority_score=priority_score,
        reason_codes=tuple(reason_codes),
    )


def strong_evidence_definition_matches(
    definitions: tuple[str, ...],
    evidence_text: str,
) -> bool:
    """Whether direct-evaluation text meets a configured strong-proof rule.

    This does not discover evidence or make an assessment transition.  It only
    tightens the evidence-strength label after the existing direct-evaluation
    detector has already accepted a cited sentence.  With no configured rules
    the conservative platform default remains in force.
    """

    if not definitions:
        return True
    candidate_tokens = _tokens(evidence_text)
    for definition in definitions:
        required = _meaningful_phrase_tokens(definition)
        if not required:
            continue
        # One generic overlapping token (for example, "tools") is not enough
        # to prove that a user's stronger definition is satisfied. A short
        # two-word definition still requires both terms.
        required_matches = min(2, len(required))
        if len(required.intersection(candidate_tokens)) >= required_matches:
            return True
    return False


__all__ = [
    "FIT_PRIORITY_WEIGHT",
    "MAX_TRAIT_BONUS",
    "MINIMUM_QUALIFIED_FIT_SCORE",
    "TRIGGER_PRIORITY_WEIGHT",
    "TargetFitAssessment",
    "TargetFitCandidate",
    "assess_target_fit",
    "strong_evidence_definition_matches",
]
