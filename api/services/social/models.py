"""Models for social-source ingestion."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import re
import json
import hashlib
from uuid import uuid4
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Sequence, TypeVar
from urllib.parse import quote

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.services.cost_controls import TenantQuotaGuard, env_float, env_int
from api.services.client_lifecycle import managed_network_client
from api.services.embeddings import (
    EmbeddingService,
    _as_dict,
    _bind_payload,
    _database_engine,
    _first_document,
    _load_service_profile,
    _service_profile_columns,
    _string_list,
    _string_value,
)
from api.services.integrations.hn_connector import SourcePost
from api.services.integrations.public_source import PublicSourcePost
from api.services.integrations.x_connector import TwitterSourcePost
from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerificationResult,
    VerifierService,
)




logger = logging.getLogger(__name__)



DEFAULT_REDDIT_SUBREDDITS = (
    "SaaS",
    "startups",
    "Entrepreneur",
    "smallbusiness",
    "marketing",
    "sales",
    "CustomerSuccess",
    "B2B",
)



DEFAULT_MAX_QUERIES = 8



DEFAULT_POSTS_PER_QUERY = 15



DEFAULT_MAX_POSTS = 80



DEFAULT_VERIFIER_QUALIFIED_THRESHOLD = 0.55



# These are verifier-confirmed, human-review signals rather than qualified
# opportunities. A lower floor preserves plausible evidence that would
# otherwise vanish while the ready-for-review threshold remains higher.
DEFAULT_DISCOVERY_CANDIDATE_THRESHOLD = 0.30



SOURCE_POST_EMBEDDING_CACHE_KEY = "matching_embedding_cache"



DEFAULT_INITIAL_PUBLIC_SOURCE_QUERY_LIMIT = 6



DEFAULT_INITIAL_PUBLIC_SOURCE_LOOKBACK_HOURS = 720



DEFAULT_INITIAL_PUBLIC_SOURCE_POSTS_PER_QUERY = 50


# A profile still owns exactly one canonical phrase for each discovery intent.
# Activation can search a small number of alternate phrasings for that intent,
# keeping source queries broad enough to capture how people actually write
# about a problem without turning a bounded scan into an unbounded crawl.
DEFAULT_INITIAL_PUBLIC_SOURCE_QUERY_VARIANTS_PER_TYPE = 2



DEFAULT_INITIAL_PUBLIC_GLOBAL_REMATCH_LIMIT = 100



DEFAULT_INITIAL_PUBLIC_GLOBAL_REMATCH_MAX_CANDIDATES = 15



DEFAULT_ADDITIONAL_PUBLIC_SOURCE_QUERY_CACHE_TTL_SECONDS = 900



ADDITIONAL_PUBLIC_SOURCE_NAMES = (
    "bluesky",
    "stackexchange",
    "github",
    "lemmy",
)



DISCOVERY_QUERY_TYPES = (
    "buyer_pain",
    "urgent_failure",
    "recommendation_request",
    "manual_workflow_frustration",
    "category_tool_search",
    "switching_trigger",
)


# Versions released before the buyer-language hardening could persist this
# exact emergency set after a deep-profile repair failed.  It is generic enough
# to retrieve broad editorial and political discussion.  Translate it only at
# search time so existing customer-edited profiles are never overwritten, yet
# the next activation immediately uses the more attributable buyer phrasing.
_LEGACY_DEMAND_ACQUISITION_QUERY_REPLACEMENTS = {
    "customer growth has stalled": "need more leads",
    "not enough people signing up": "need more leads",
    "new customer signups are dropping": "signups dropping",
    "new signups dropped this week": "signups dropping",
    "how can i get more customers": "how to find customers",
    "need a better way to get customers": "how to find customers",
    "spending too much time on outreach": "manual prospecting",
    "we are doing outreach by hand": "manual prospecting",
    "tools to grow our customer base": "prospecting tools",
    "our growth strategy stopped working": "outbound not working",
    "our current growth plan is failing": "outbound not working",
}
_LEGACY_B2B_DEMAND_ACQUISITION_QUERY_REPLACEMENTS = {
    **_LEGACY_DEMAND_ACQUISITION_QUERY_REPLACEMENTS,
    "not enough saas users signing up": "need more leads",
    "new saas signups dropped this week": "signups dropping",
    "how are saas founders finding customers": "how to find customers",
    "tools to find saas customers": "prospecting tools",
    "our saas growth plan is failing": "outbound not working",
}
_B2B_SOFTWARE_PROFILE_PATTERN = re.compile(
    r"\b(?:b2b|saas|software|startup|start-up)\b",
    re.IGNORECASE,
)



@dataclass(frozen=True)
class DiscoveryQuery:
    """A buyer-language source-search phrase with its matching-brief intent."""

    query_type: str
    phrase: str

    def to_payload(self) -> dict[str, str]:
        return {"query_type": self.query_type, "phrase": self.phrase}



@dataclass(frozen=True)
class PublicSourcePostRef:
    """A source-qualified reference to one globally stored public post.

    External IDs are provider scoped: ``42`` can be a Hacker News comment, a
    GitHub issue, and a post on another network.  Passing this small compound
    value between ingestion and embedding preserves the database's composite
    ``(source, source_post_id)`` identity without exposing a tenant boundary.
    """

    source: str
    source_post_id: str
    # This is transient activation metadata, never a cross-tenant lead score.
    # It lets a bounded embedding handoff prefer posts with stronger free
    # buying signals while preserving the provider-qualified identity.
    lead_signal_score: int = field(default=0, compare=False)
    lead_signal_reasons: tuple[str, ...] = field(default=(), compare=False)
    lead_signal_group: str | None = field(default=None, compare=False)

    def __post_init__(self) -> None:
        if not self.source.strip() or not self.source_post_id.strip():
            raise ValueError("source and source_post_id are required")
        object.__setattr__(
            self,
            "lead_signal_score",
            max(0, min(100, int(self.lead_signal_score))),
        )
        object.__setattr__(
            self,
            "lead_signal_reasons",
            tuple(str(reason) for reason in self.lead_signal_reasons if str(reason)),
        )
        group = str(self.lead_signal_group or "").strip()
        object.__setattr__(self, "lead_signal_group", group or None)

    def to_payload(self) -> dict[str, str]:
        return {
            "source": self.source.strip(),
            "source_post_id": self.source_post_id.strip(),
        }



@dataclass(frozen=True)
class SocialPost:
    source: str
    external_id: str
    title: str
    text: str
    author: str | None = None
    community: str | None = None
    url: str | None = None
    published_at: str | None = None
    metadata: dict[str, Any] | None = None

    @property
    def dedupe_key(self) -> str:
        return f"{self.source}:{self.external_id}"

    @property
    def matching_text(self) -> str:
        return "\n\n".join(part for part in (self.title, self.text) if part).strip()

    def to_source_post_json(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "external_id": self.external_id,
            "title": self.title,
            "text": self.text,
            "author": self.author,
            "community": self.community,
            "url": self.url,
            "published_at": self.published_at,
            "metadata": self.metadata or {},
        }



@dataclass(frozen=True)
class InitialPublicSourceIngestionPlan:
    """The bounded public-source Fast check spawned after a profile is embedded."""

    queries: list[DiscoveryQuery]
    hn_jobs: int
    x_jobs: int
    x_skip_reason: str | None = None
    additional_source_jobs: int = 0
    # A tenant-owned diagnostics row. It is optional while the additive
    # discovery telemetry contract is being rolled out.
    discovery_run_id: str | None = None

    @property
    def query_terms(self) -> list[str]:
        """Compatibility projection for callers that predate typed queries."""
        return [query.phrase for query in self.queries]



def _csv_env(name: str, default: tuple[str, ...] = ()) -> list[str]:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return list(default)

    return [item.strip() for item in raw_value.split(",") if item.strip()]



def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()



def _read_string(sources: list[dict[str, Any]], keys: list[str]) -> str | None:
    for source in sources:
        for key in keys:
            value = _string_value(source.get(key))
            if value:
                return value
    return None



def _read_list(sources: list[dict[str, Any]], keys: list[str]) -> list[str]:
    for source in sources:
        for key in keys:
            value = _string_list(source.get(key))
            if value:
                return value
    return []



def _list_value(value: Any) -> list[Any]:
    """Read JSON/JSONB arrays without treating dictionaries as strings."""
    if isinstance(value, list):
        return list(value)
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return list(parsed) if isinstance(parsed, list) else []
    return []


def _search_time_discovery_phrase(phrase: str, sources: list[dict[str, Any]]) -> str:
    """Upgrade old emergency demand phrases without mutating customer data.

    The persisted profile remains editable and untouched. When its own brief
    clearly names a B2B-software audience, add that buyer-owned context to the
    temporary source query so broad HN/X searches do not mistake publisher
    content for a real customer conversation.
    """

    normalized_phrase = phrase.casefold()
    profile_context = " ".join(
        part
        for source in sources
        for key in (
            "one_liner",
            "target_audience",
            "core_problem_solved",
            "key_value_propositions",
            "ideal_customer_pain_points",
            "use_cases",
            "buying_triggers",
            "urgency_signals",
        )
        for part in (
            [_string_value(source.get(key))]
            if _string_value(source.get(key))
            else _string_list(source.get(key))
        )
    )
    replacements = (
        _LEGACY_B2B_DEMAND_ACQUISITION_QUERY_REPLACEMENTS
        if _B2B_SOFTWARE_PROFILE_PATTERN.search(profile_context)
        else _LEGACY_DEMAND_ACQUISITION_QUERY_REPLACEMENTS
    )
    return replacements.get(normalized_phrase, phrase)



def _profile_discovery_queries(row: dict[str, Any]) -> list[DiscoveryQuery]:
    """Return canonical typed discovery phrases from a persisted profile.

    Profiles created before typed discovery queries retain their legacy flat
    ``search_terms``.  Map those terms onto the stable intent order so queue
    consumers always receive the same `{query_type, phrase}` shape.
    """
    document = _first_document(row)
    sources = [document, row]
    for source in sources:
        typed_queries: list[DiscoveryQuery] = []
        seen_types: set[str] = set()
        seen_phrases: set[str] = set()
        for raw_item in _list_value(source.get("discovery_queries")):
            if not isinstance(raw_item, dict):
                continue
            query_type = _string_value(raw_item.get("query_type"))
            phrase = _string_value(raw_item.get("phrase"))
            if not query_type or not phrase or query_type not in DISCOVERY_QUERY_TYPES:
                continue
            normalized_phrase = _compact_public_search_term(
                _search_time_discovery_phrase(phrase, sources)
            )
            phrase_key = normalized_phrase.casefold()
            if (
                not normalized_phrase
                or query_type in seen_types
                or phrase_key in seen_phrases
            ):
                continue
            seen_types.add(query_type)
            seen_phrases.add(phrase_key)
            typed_queries.append(DiscoveryQuery(query_type, normalized_phrase))

        if typed_queries:
            order = {query_type: index for index, query_type in enumerate(DISCOVERY_QUERY_TYPES)}
            return sorted(typed_queries, key=lambda query: order[query.query_type])

    legacy_terms = _read_list(
        sources,
        ["search_terms", "discovery_terms"],
    )
    return [
        DiscoveryQuery(
            DISCOVERY_QUERY_TYPES[index % len(DISCOVERY_QUERY_TYPES)],
            _compact_public_search_term(
                _search_time_discovery_phrase(normalized_phrase, sources)
            ),
        )
        for index, term in enumerate(legacy_terms)
        if (normalized_phrase := _compact_public_search_term(term))
    ]



def _service_profile_from_row(row: dict[str, Any]) -> ServiceProfile:
    document = _first_document(row)
    sources = [document, row]

    company_name = _read_string(sources, ["company_name", "name"]) or "Workspace"
    one_liner = (
        _read_string(
            sources,
            ["one_liner", "unique_value_prop", "unique_value_proposition"],
        )
        or "B2B service"
    )
    target_audience = _read_list(sources, ["target_audience", "audience"]) or [
        "B2B buyers"
    ]
    core_problem = (
        _read_string(sources, ["core_problem_solved", "core_problem"]) or one_liner
    )
    value_props = _read_list(
        sources,
        ["key_value_propositions", "value_propositions"],
    )
    if not value_props:
        value_props = [one_liner]

    pain_points = _read_list(
        sources,
        ["ideal_customer_pain_points", "pain_points"],
    )
    if not pain_points:
        pain_points = [core_problem]

    use_cases = _read_list(sources, ["use_cases", "usecases"])
    buying_triggers = _read_list(sources, ["buying_triggers"])
    urgency_signals = _read_list(sources, ["urgency_signals"])
    discovery_queries = _profile_discovery_queries(row)

    return ServiceProfile(
        company_name=company_name,
        one_liner=one_liner,
        target_audience=target_audience,
        core_problem_solved=core_problem,
        key_value_propositions=value_props,
        ideal_customer_pain_points=pain_points,
        use_cases=use_cases,
        buying_triggers=buying_triggers,
        urgency_signals=urgency_signals,
        search_terms=[query.phrase for query in discovery_queries]
        or _read_list(sources, ["search_terms", "discovery_terms"]),
        negative_keywords=_read_list(sources, ["negative_keywords", "excluded_audiences"]),
    )



def _embedding_values(value: Any) -> list[float] | None:
    if isinstance(value, list):
        values = [float(item) for item in value if isinstance(item, (int, float))]
        return values if values else None

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if stripped.startswith("[") and stripped.endswith("]"):
            try:
                values = [
                    float(item)
                    for item in stripped.strip("[]").split(",")
                    if item.strip()
                ]
            except ValueError:
                return None
            return values if values else None

    return None



def _profile_embedding_from_row(row: dict[str, Any]) -> list[float] | None:
    for key in ("profile_embedding", "embedding"):
        embedding = _embedding_values(row.get(key))
        if embedding:
            return embedding

    documents = [
        _as_dict(row.get("embedding_json")),
        _first_document(row),
        _as_dict(row.get("profile_json")),
        _as_dict(row.get("profile")),
        _as_dict(row.get("data")),
    ]
    for document in documents:
        embedding = _embedding_values(document.get("profile_embedding"))
        if embedding:
            return embedding

    return None



def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()



def _embedding_sha256(embedding: list[float]) -> str:
    payload = json.dumps(
        [round(float(item), 8) for item in embedding],
        separators=(",", ":"),
    )
    return _sha256_text(payload)

# Cross-module helper imports for static analysis and direct module use.
from .queries import _compact_public_search_term
