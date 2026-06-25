"""
Churn scoring service — main entry point.

**Backward compatibility guarantee**

Everything that was previously importable from this module is still
importable with the exact same names and signatures::

    from churn_scoring import ChurnScoringService, UserProfile, EventSignal
    from churn_scoring import SIGNAL_WEIGHTS, INACTIVITY_DAYS
    from churn_scoring import CHURN_USE_ACTIVITY_ROLLUP

The implementation has been refactored into three focused modules:

* ``churn_config``    constants, env config, Pydantic models
* ``churn_queries``   database query layer (aggregation, DISTINCT, memory
  protection fixes applied)
* ``churn_scoring``   this file; business logic and re-exports

Production fixes applied (see churn_queries.py for query-level details):

1. Event queries now use GROUP BY returning at most one row per
   (user_id, event_name) — eliminates unbounded result sets.
2. Activity queries use DISTINCT user_id — O(active users) instead of
   O(total events).
3. CHURN_USE_ACTIVITY_ROLLUP now defaults to ``true``.
4. Memory-protection telemetry reacts to row count, not just latency.
5. _persist_risk_state uses a generic _chunk_list helper.
"""

import json
import logging
import math
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Re-exports from churn_config for full backward compatibility
# ---------------------------------------------------------------------------
from api.services.churn_config import (
    ACTIVITY_ROLLUP_TABLE,
    CHURN_USE_ACTIVITY_ROLLUP,
    DEFAULT_EVENT_BATCH_SIZE,
    EventSignal,
    INACTIVITY_DAYS,
    MAX_RISK_SCORE,
    MIN_EVENT_BATCH_SIZE,
    NEGATIVE_KEYWORDS,
    NEGATIVE_SENTIMENT_VALUES,
    NEGATIVE_KEYWORDS as NEGATIVE_KEYWORDS_SET,
    POSITIVE_SENTIMENT_VALUES,
    PERSIST_RISK_STATE,
    RECENT_FEEDBACK_LOOKBACK_DAYS,
    RECENT_STRIPE_EVENT_LOOKBACK_DAYS,
    RISK_HISTORY_TABLE,
    RISK_SCORE_VERSION,
    RISK_STATE_TABLE,
    RISK_TIER_THRESHOLDS,
    RiskScoreResult,
    SIGNAL_HALF_LIFE_DAYS,
    SIGNAL_PRIORITY,
    SIGNAL_WEIGHTS,
    SLOW_QUERY_THRESHOLD_SEC,
    STRIPE_SIGNAL_NAMES,
    UserProfile,
)

# ---------------------------------------------------------------------------
# Query layer imports — all DB access is delegated here
# ---------------------------------------------------------------------------
from churn_queries import (
    _chunk_list,
    _coerce_user_id,
    _ensure_utc,
    _fetch_active_users,
    _fetch_events_chunked,
    _parse_datetime,
    _persist_risk_state,
    _to_iso,
)

logger = logging.getLogger(__name__)


class ChurnScoringService:
    """Scores churn risk for a batch of users using deterministic rules."""

    def __init__(self, db_client):
        self.db = db_client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def calculate_batch_risk_scores(
        self,
        tenant_id: str,
        users: List[Dict[str, Any]],
        target_date: str,
    ) -> List[Dict[str, Any]]:
        """Compute churn risk scores for a user batch and return at-risk users."""
        if not tenant_id:
            raise ValueError("tenant_id is required")

        if not users:
            return []

        start_time = time.time()
        run_id = uuid.uuid4().hex

        users_by_id = self._index_users(users)
        profiles = self._build_user_profiles(users_by_id)
        user_ids = list(profiles.keys())

        if not user_ids:
            logger.warning(
                "churn_scoring_skipped_no_user_ids tenant=%s batch_size=%d",
                tenant_id,
                len(users),
            )
            return []

        target_day = self._parse_target_date(target_date)
        window_end = target_day + timedelta(days=1)

        activity_start = window_end - timedelta(days=INACTIVITY_DAYS)
        recent_start = window_end - timedelta(
            days=RECENT_STRIPE_EVENT_LOOKBACK_DAYS
        )
        feedback_start = window_end - timedelta(
            days=RECENT_FEEDBACK_LOOKBACK_DAYS
        )

        logger.info(
            "churn_scoring_batch_started tenant=%s users=%d target_date=%s "
            "run_id=%s rollup=%s",
            tenant_id,
            len(user_ids),
            target_day.date().isoformat(),
            run_id,
            CHURN_USE_ACTIVITY_ROLLUP,
        )

        signals_missing: List[str] = []

        # -- Pre-allocate signal buckets (safe for any configured stripe names)
        latest_signal_ts: Dict[str, Dict[str, datetime]] = {
            name: {} for name in (*STRIPE_SIGNAL_NAMES, "negative_feedback")
        }

        signal_counts: Dict[str, int] = {
            key: 0 for key in SIGNAL_WEIGHTS.keys()
        }

        # -- Stripe signals (cancelled, payment_failed) ----------------
        try:
            for row in _fetch_events_chunked(
                db=self.db,
                tenant_id=tenant_id,
                user_ids=user_ids,
                start_ts=recent_start,
                end_ts=window_end,
                event_names=STRIPE_SIGNAL_NAMES,
                select_fields="user_id,event_name,timestamp",
                batch_label="stripe_signals",
            ):
                event = self._normalize_event(row)
                if not event:
                    continue
                if event.event_name not in STRIPE_SIGNAL_NAMES:
                    continue
                self._track_latest_event(
                    latest_signal_ts[event.event_name],
                    event.user_id,
                    event.timestamp,
                )
                signal_counts[event.event_name] = (
                    signal_counts.get(event.event_name, 0) + 1
                )
        except Exception:
            signals_missing.append("stripe_signals")

        # -- Feedback signals ------------------------------------------
        try:
            for row in _fetch_events_chunked(
                db=self.db,
                tenant_id=tenant_id,
                user_ids=user_ids,
                start_ts=feedback_start,
                end_ts=window_end,
                event_names=["feedback_submitted"],
                select_fields="user_id,event_name,timestamp,properties",
                batch_label="feedback_signals",
            ):
                event = self._normalize_event(row)
                if not event or event.event_name != "feedback_submitted":
                    continue
                if self._is_negative_feedback(event.properties):
                    self._track_latest_event(
                        latest_signal_ts["negative_feedback"],
                        event.user_id,
                        event.timestamp,
                    )
                    signal_counts["negative_feedback"] = (
                        signal_counts.get("negative_feedback", 0) + 1
                    )
        except Exception:
            signals_missing.append("feedback_signals")

        # -- Activity lookup (roll-up aware) ---------------------------
        # None means the query failed; we skip inactivity to avoid mass
        # false positives rather than defaulting to an empty set.
        active_user_ids: Optional[Set[str]] = None
        try:
            active_user_ids = _fetch_active_users(
                db=self.db,
                tenant_id=tenant_id,
                user_ids=user_ids,
                start_ts=activity_start,
                end_ts=window_end,
            )
        except Exception:
            signals_missing.append("activity")

        # -- Score every user ------------------------------------------
        at_risk_users: List[Dict[str, Any]] = []
        risk_state_rows: List[Dict[str, Any]] = []
        history_rows: List[Dict[str, Any]] = []

        for user_id, profile in profiles.items():
            user = users_by_id.get(user_id)
            score, signal_details, signal_scores = self._score_user(
                user_id=user_id,
                profile=profile,
                activity_start=activity_start,
                window_end=window_end,
                active_user_ids=active_user_ids,
                latest_signal_ts=latest_signal_ts,
            )

            risk_tier = self._risk_tier(score)
            primary_signal = self._pick_primary_signal(signal_scores)
            scored_at = datetime.now(timezone.utc).isoformat()

            risk_payload = RiskScoreResult(
                tenant_id=tenant_id,
                user_id=user_id,
                risk_score=score,
                risk_tier=risk_tier,
                primary_risk_signal=primary_signal,
                signals=signal_details,
                scored_at=scored_at,
                score_version=RISK_SCORE_VERSION,
                risk_run_id=run_id,
            )

            risk_state_rows.append(risk_payload.model_dump())
            history_rows.append(risk_payload.model_dump())

            if score <= 0:
                continue

            scored_user = dict(user or {})
            scored_user["churn_risk_score"] = score
            scored_user["primary_risk_signal"] = primary_signal
            scored_user["risk_tier"] = risk_tier
            scored_user["risk_signals"] = signal_details
            scored_user["risk_run_id"] = run_id
            at_risk_users.append(scored_user)

        # -- Persist ----------------------------------------------------
        if PERSIST_RISK_STATE:
            _persist_risk_state(
                db=self.db,
                tenant_id=tenant_id,
                risk_state_rows=risk_state_rows,
                history_rows=history_rows,
            )

        duration = round(time.time() - start_time, 3)

        logger.info(
            "churn_scoring_batch_completed tenant=%s duration=%ss users=%d "
            "at_risk=%d signals=%s missing=%s rollup=%s run_id=%s",
            tenant_id,
            duration,
            len(user_ids),
            len(at_risk_users),
            signal_counts,
            signals_missing,
            CHURN_USE_ACTIVITY_ROLLUP,
            run_id,
        )

        return at_risk_users

    # ------------------------------------------------------------------
    # User profile building
    # ------------------------------------------------------------------

    def _build_user_profiles(
        self,
        users_by_id: Dict[str, Dict[str, Any]],
    ) -> Dict[str, UserProfile]:
        profiles: Dict[str, UserProfile] = {}

        for user_id, user in users_by_id.items():
            payload = {
                "user_id": user_id,
                "last_seen_at": user.get("last_seen_at"),
                "last_seen": user.get("last_seen"),
                "last_active_at": user.get("last_active_at"),
            }
            try:
                profiles[user_id] = UserProfile.model_validate(payload)
            except ValidationError:
                logger.exception(
                    "churn_scoring_invalid_user user_id=%s",
                    user_id,
                )

        return profiles

    # ------------------------------------------------------------------
    # Scoring logic
    # ------------------------------------------------------------------

    def _score_user(
        self,
        user_id: str,
        profile: UserProfile,
        activity_start: datetime,
        window_end: datetime,
        active_user_ids: Optional[Set[str]],
        latest_signal_ts: Dict[str, Dict[str, datetime]],
    ) -> Tuple[int, Dict[str, Any], Dict[str, int]]:
        score = 0
        signal_details: Dict[str, Any] = {}
        signal_scores: Dict[str, int] = {}

        inactive = self._is_inactive_user(
            profile, user_id, activity_start, active_user_ids
        )
        if inactive:
            weight = SIGNAL_WEIGHTS["inactivity"]
            score += weight
            signal_scores["inactivity"] = weight
            last_seen_dt = self._best_last_seen(profile)
            signal_details["inactivity"] = {
                "weight": weight,
                "decay": 1.0,
                "score": weight,
                "last_seen_at": last_seen_dt.isoformat() if last_seen_dt else None,
                "days_since": self._days_since_last_seen(profile, window_end),
            }

        for signal_name in STRIPE_SIGNAL_NAMES:
            event_ts = latest_signal_ts.get(signal_name, {}).get(user_id)
            if not event_ts:
                continue
            weighted = self._apply_decay(signal_name, event_ts, window_end)
            if weighted <= 0:
                continue
            score += weighted
            signal_scores[signal_name] = weighted
            signal_details[signal_name] = {
                "weight": SIGNAL_WEIGHTS[signal_name],
                "decay": self._decay_factor(
                    signal_name, event_ts, window_end
                ),
                "score": weighted,
                "last_event_at": event_ts.isoformat(),
            }

        feedback_ts = latest_signal_ts.get("negative_feedback", {}).get(
            user_id
        )
        if feedback_ts:
            weighted = self._apply_decay(
                "negative_feedback", feedback_ts, window_end
            )
            if weighted > 0:
                score += weighted
                signal_scores["negative_feedback"] = weighted
                signal_details["negative_feedback"] = {
                    "weight": SIGNAL_WEIGHTS["negative_feedback"],
                    "decay": self._decay_factor(
                        "negative_feedback", feedback_ts, window_end
                    ),
                    "score": weighted,
                    "last_event_at": feedback_ts.isoformat(),
                }

        score = min(score, MAX_RISK_SCORE)

        return score, signal_details, signal_scores

    def _apply_decay(
        self,
        signal_name: str,
        event_ts: datetime,
        window_end: datetime,
    ) -> int:
        weight = SIGNAL_WEIGHTS.get(signal_name, 0)
        if weight <= 0:
            return 0
        decay = self._decay_factor(signal_name, event_ts, window_end)
        return round(weight * decay)

    def _decay_factor(
        self,
        signal_name: str,
        event_ts: datetime,
        window_end: datetime,
    ) -> float:
        half_life = SIGNAL_HALF_LIFE_DAYS.get(signal_name)
        if not half_life:
            return 1.0
        age_days = max(
            0.0, (window_end - event_ts).total_seconds() / 86400.0
        )
        return math.pow(0.5, age_days / float(half_life))

    def _risk_tier(self, score: int) -> str:
        if score <= 0:
            return "low"
        # Sort descending so highest threshold is checked first
        for tier, threshold in sorted(
            RISK_TIER_THRESHOLDS, key=lambda t: t[1], reverse=True
        ):
            if score >= threshold:
                return tier
        return "low"

    def _pick_primary_signal(
        self, signal_scores: Dict[str, int]
    ) -> Optional[str]:
        if not signal_scores:
            return None

        priority_index = {
            name: index for index, name in enumerate(SIGNAL_PRIORITY)
        }
        return max(
            signal_scores.keys(),
            key=lambda name: (
                signal_scores.get(name, 0),
                -priority_index.get(name, len(priority_index)),
            ),
        )

    # ------------------------------------------------------------------
    # User indexing helpers
    # ------------------------------------------------------------------

    def _index_users(
        self, users: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        users_by_id: Dict[str, Dict[str, Any]] = {}
        missing = 0

        for user in users:
            user_id = self._resolve_user_id(user)
            if not user_id:
                missing += 1
                continue
            users_by_id[user_id] = user

        if missing:
            logger.warning(
                "churn_scoring_missing_user_ids count=%d total=%d",
                missing,
                len(users),
            )

        return users_by_id

    def _resolve_user_id(self, user: Dict[str, Any]) -> Optional[str]:
        for key in ("user_id", "id", "uid", "auth_user_id"):
            value = user.get(key)
            user_id = _coerce_user_id(value)
            if user_id:
                return user_id
        return None

    def _parse_target_date(
        self, target_date: Optional[str]
    ) -> datetime:
        if not target_date:
            return datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

        try:
            parsed = datetime.strptime(target_date, "%Y-%m-%d").date()
            return datetime.combine(
                parsed, datetime.min.time()
            ).replace(tzinfo=timezone.utc)
        except ValueError:
            logger.warning("invalid_target_date value=%s", target_date)
            raise ValueError(
                f"target_date must be YYYY-MM-DD, got: {target_date!r}"
            )

    # ------------------------------------------------------------------
    # Event normalization
    # ------------------------------------------------------------------

    def _normalize_event(
        self, row: Dict[str, Any]
    ) -> Optional[EventSignal]:
        try:
            parsed = EventSignal.model_validate(row)
        except ValidationError:
            logger.exception("churn_scoring_invalid_event")
            return None

        parsed.event_name = str(parsed.event_name).strip().lower()
        parsed.user_id = self._coerce_user_id(parsed.user_id)
        if not parsed.user_id:
            return None
        if parsed.timestamp is None:
            return None
        parsed.timestamp = _ensure_utc(parsed.timestamp)
        return parsed

    # ------------------------------------------------------------------
    # Activity / inactivity helpers
    # ------------------------------------------------------------------

    def _track_latest_event(
        self,
        bucket: Dict[str, datetime],
        user_id: str,
        event_ts: datetime,
    ) -> None:
        current = bucket.get(user_id)
        if not current or event_ts > current:
            bucket[user_id] = event_ts

    def _is_inactive_user(
        self,
        profile: UserProfile,
        user_id: str,
        cutoff: datetime,
        active_user_ids: Optional[Set[str]],
    ) -> bool:
        # If activity lookup failed, skip inactivity to avoid mass
        # false positives.
        if active_user_ids is None:
            return False
        last_seen_dt = self._best_last_seen(profile)
        if last_seen_dt:
            return last_seen_dt < cutoff and user_id not in active_user_ids
        return user_id not in active_user_ids

    def _best_last_seen(self, profile: UserProfile) -> Optional[datetime]:
        last_seen = (
            profile.last_seen_at or profile.last_seen or profile.last_active_at
        )
        if not last_seen:
            return None
        return _parse_datetime(last_seen)

    def _days_since_last_seen(
        self, profile: UserProfile, window_end: datetime
    ) -> Optional[int]:
        last_seen_dt = self._best_last_seen(profile)
        if not last_seen_dt:
            return None
        delta = window_end - last_seen_dt
        return int(delta.total_seconds() // 86400)

    # ------------------------------------------------------------------
    # Feedback helpers
    # ------------------------------------------------------------------

    def _coerce_properties(self, value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
        return {}

    def _is_negative_feedback(self, properties: Dict[str, Any]) -> bool:
        # Handle sentiment=0 correctly by checking is not None instead of truthiness
        sentiment_raw = properties.get("sentiment")
        sentiment_label = properties.get("sentiment_label")
        if sentiment_raw is not None:
            sentiment = str(sentiment_raw).strip().lower()
        elif sentiment_label is not None:
            sentiment = str(sentiment_label).strip().lower()
        else:
            sentiment = ""

        rating = properties.get("rating")
        reason = str(properties.get("reason") or "").strip().lower()
        feedback_text = str(
            properties.get("feedback_text") or properties.get("text") or ""
        ).strip().lower()

        if sentiment in NEGATIVE_SENTIMENT_VALUES:
            return True

        # Safely coerce rating, rejecting booleans
        rating_value = None
        if rating is not None and not isinstance(rating, bool):
            try:
                rating_value = int(rating)
            except (TypeError, ValueError):
                rating_value = None

        if rating_value is not None:
            if rating_value <= 2:
                return True
            if rating_value >= 4 and sentiment in POSITIVE_SENTIMENT_VALUES:
                if not (
                    self._contains_negative(reason)
                    or self._contains_negative(feedback_text)
                ):
                    return False

        if reason and self._contains_negative(reason):
            return True

        if feedback_text and self._contains_negative(feedback_text):
            return True

        return False

    def _contains_negative(self, text: str) -> bool:
        if not text:
            return False
        for keyword in NEGATIVE_KEYWORDS:
            if keyword in text:
                return True
        return False

    # ------------------------------------------------------------------
    # Backward-compatible chunking helper (delegates to generic)
    # ------------------------------------------------------------------

    def _chunk_user_ids(
        self, user_ids: List[str], batch_size: int
    ) -> Iterable[List[str]]:
        """Yield successive *batch_size*-sized chunks of *user_ids*.

        Kept for callers that invoke this method on the service instance.
        Internally delegates to the generic :func:`churn_queries._chunk_list`.
        """
        return _chunk_list(user_ids, batch_size)

    # ------------------------------------------------------------------
    # Backward-compatible helpers (kept on class for external callers)
    # ------------------------------------------------------------------

    def _coerce_user_id(self, value: Any) -> Optional[str]:
        return _coerce_user_id(value)

    def _to_iso(self, value: datetime) -> str:
        return _to_iso(value)

    def _ensure_utc(self, value: datetime) -> datetime:
        return _ensure_utc(value)

    def _parse_datetime(self, value: Any) -> Optional[datetime]:
        return _parse_datetime(value)


# ===========================================================================
# Convenience re-export of _chunk_list for any external callers
# ===========================================================================

def chunk_list(items: List[Any], batch_size: int) -> Iterable[List[Any]]:
    """Generic list chunking helper available at module level."""
    return _chunk_list(items, batch_size)