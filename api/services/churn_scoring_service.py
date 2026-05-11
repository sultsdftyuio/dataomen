import json
import logging
import math
import os
import time
import uuid
from datetime import datetime, timezone, timedelta, date
from typing import List, Dict, Any, Optional, Iterable, Set, Tuple

from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

INACTIVITY_DAYS = int(os.getenv("CHURN_INACTIVITY_DAYS", "14"))
RECENT_STRIPE_EVENT_LOOKBACK_DAYS = int(
    os.getenv("CHURN_STRIPE_LOOKBACK_DAYS", "30")
)
RECENT_FEEDBACK_LOOKBACK_DAYS = int(
    os.getenv("CHURN_FEEDBACK_LOOKBACK_DAYS", "30")
)
MAX_RISK_SCORE = 100

DEFAULT_EVENT_BATCH_SIZE = int(os.getenv("CHURN_EVENT_BATCH_SIZE", "250"))
MIN_EVENT_BATCH_SIZE = int(os.getenv("CHURN_EVENT_BATCH_MIN", "50"))
SLOW_QUERY_THRESHOLD_SEC = float(
    os.getenv("CHURN_QUERY_SLOW_SEC", "1.5")
)
CHURN_USE_ACTIVITY_ROLLUP = (
    os.getenv("CHURN_USE_ACTIVITY_ROLLUP", "false").lower() == "true"
)
ACTIVITY_ROLLUP_TABLE = os.getenv("CHURN_ACTIVITY_ROLLUP_TABLE", "user_activity_daily")

PERSIST_RISK_STATE = os.getenv("CHURN_PERSIST_RISK_STATE", "true").lower() == "true"
RISK_STATE_TABLE = os.getenv("CHURN_RISK_STATE_TABLE", "churn_risk_state")
RISK_HISTORY_TABLE = os.getenv("CHURN_RISK_HISTORY_TABLE", "churn_risk_history")
RISK_SCORE_VERSION = os.getenv("CHURN_SCORE_VERSION", "v1")

SIGNAL_WEIGHTS: Dict[str, int] = {
    "subscription_cancelled": 90,
    "invoice_payment_failed": 60,
    "inactivity": 40,
    "negative_feedback": 35,
}

SIGNAL_PRIORITY: List[str] = [
    "subscription_cancelled",
    "invoice_payment_failed",
    "inactivity",
    "negative_feedback",
]

SIGNAL_HALF_LIFE_DAYS: Dict[str, int] = {
    "subscription_cancelled": 30,
    "invoice_payment_failed": 14,
    "negative_feedback": 10,
}

RISK_TIER_THRESHOLDS: List[Tuple[str, int]] = [
    ("critical", 75),
    ("high", 50),
    ("medium", 25),
    ("low", 1),
]

NEGATIVE_SENTIMENT_VALUES = {
    "negative",
    "bad",
    "poor",
    "angry",
    "sad",
    "frustrated",
}

POSITIVE_SENTIMENT_VALUES = {
    "positive",
    "good",
    "great",
    "happy",
    "satisfied",
}

NEGATIVE_KEYWORDS = {
    "bug",
    "issue",
    "problem",
    "broken",
    "error",
    "slow",
    "performance",
    "downtime",
    "outage",
    "crash",
    "confusing",
    "difficult",
    "missing",
    "feature",
    "pricing",
    "expensive",
    "billing",
    "support",
    "refund",
    "cancel",
    "canceled",
    "cancelled",
    "cancellation",
    "unreliable",
    "frustrating",
    "too_expensive",
    "missing_feature",
}

STRIPE_SIGNAL_NAMES = [
    "subscription_cancelled",
    "invoice_payment_failed",
]


class UserProfile(BaseModel):
    model_config = ConfigDict(extra="allow")

    user_id: str = Field(..., min_length=1)
    last_seen_at: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    last_active_at: Optional[datetime] = None


class EventSignal(BaseModel):
    model_config = ConfigDict(extra="allow")

    user_id: str = Field(..., min_length=1)
    event_name: str = Field(..., min_length=1)
    timestamp: datetime
    properties: Dict[str, Any] = Field(default_factory=dict)


class RiskScoreResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    tenant_id: str
    user_id: str
    risk_score: int
    risk_tier: str
    primary_risk_signal: Optional[str]
    signals: Dict[str, Any]
    scored_at: str
    score_version: str
    risk_run_id: str


class ChurnScoringService:
    """
    Scores churn risk for a batch of users using deterministic rules.
    """

    def __init__(self, db_client):
        self.db = db_client

    def calculate_batch_risk_scores(
        self,
        tenant_id: str,
        users: List[Dict[str, Any]],
        target_date: str
    ) -> List[Dict[str, Any]]:
        """
        Computes churn risk scores for a user batch and returns only at-risk users.
        """
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
        recent_start = window_end - timedelta(days=RECENT_STRIPE_EVENT_LOOKBACK_DAYS)
        feedback_start = window_end - timedelta(days=RECENT_FEEDBACK_LOOKBACK_DAYS)

        logger.info(
            "churn_scoring_batch_started tenant=%s users=%d target_date=%s run_id=%s",
            tenant_id,
            len(user_ids),
            target_day.date().isoformat(),
            run_id,
        )

        signals_missing: List[str] = []

        latest_signal_ts: Dict[str, Dict[str, datetime]] = {
            "subscription_cancelled": {},
            "invoice_payment_failed": {},
            "negative_feedback": {},
        }

        signal_counts: Dict[str, int] = {key: 0 for key in SIGNAL_WEIGHTS.keys()}

        try:
            for row in self._fetch_events_chunked(
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
                signal_counts[event.event_name] = signal_counts.get(event.event_name, 0) + 1
        except Exception:
            signals_missing.append("stripe_signals")

        try:
            for row in self._fetch_events_chunked(
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

        active_user_ids: Set[str] = set()
        try:
            active_user_ids = self._fetch_active_users(
                tenant_id=tenant_id,
                user_ids=user_ids,
                start_ts=activity_start,
                end_ts=window_end,
            )
        except Exception:
            signals_missing.append("activity")

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

        if PERSIST_RISK_STATE:
            self._persist_risk_state(
                tenant_id,
                risk_state_rows,
                history_rows,
            )

        duration = round(time.time() - start_time, 3)

        logger.info(
            "churn_scoring_batch_completed tenant=%s duration=%ss users=%d at_risk=%d "
            "signals=%s missing=%s run_id=%s",
            tenant_id,
            duration,
            len(user_ids),
            len(at_risk_users),
            signal_counts,
            signals_missing,
            run_id,
        )

        return at_risk_users

    def _build_user_profiles(
        self,
        users_by_id: Dict[str, Dict[str, Any]]
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

    def _score_user(
        self,
        user_id: str,
        profile: UserProfile,
        activity_start: datetime,
        window_end: datetime,
        active_user_ids: Set[str],
        latest_signal_ts: Dict[str, Dict[str, datetime]],
    ) -> Tuple[int, Dict[str, Any], Dict[str, int]]:
        score = 0
        signal_details: Dict[str, Any] = {}
        signal_scores: Dict[str, int] = {}

        inactive = self._is_inactive_user(profile, user_id, activity_start, active_user_ids)
        if inactive:
            weight = SIGNAL_WEIGHTS["inactivity"]
            score += weight
            signal_scores["inactivity"] = weight
            signal_details["inactivity"] = {
                "weight": weight,
                "decay": 1.0,
                "score": weight,
                "last_seen_at": self._best_last_seen(profile),
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
                "decay": self._decay_factor(signal_name, event_ts, window_end),
                "score": weighted,
                "last_event_at": event_ts.isoformat(),
            }

        feedback_ts = latest_signal_ts.get("negative_feedback", {}).get(user_id)
        if feedback_ts:
            weighted = self._apply_decay("negative_feedback", feedback_ts, window_end)
            if weighted > 0:
                score += weighted
                signal_scores["negative_feedback"] = weighted
                signal_details["negative_feedback"] = {
                    "weight": SIGNAL_WEIGHTS["negative_feedback"],
                    "decay": self._decay_factor("negative_feedback", feedback_ts, window_end),
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
        return int(round(weight * decay))

    def _decay_factor(
        self,
        signal_name: str,
        event_ts: datetime,
        window_end: datetime,
    ) -> float:
        half_life = SIGNAL_HALF_LIFE_DAYS.get(signal_name)
        if not half_life:
            return 1.0
        age_days = max(0.0, (window_end - event_ts).total_seconds() / 86400.0)
        return math.pow(0.5, age_days / float(half_life))

    def _risk_tier(self, score: int) -> str:
        if score <= 0:
            return "low"
        for tier, threshold in RISK_TIER_THRESHOLDS:
            if score >= threshold:
                return tier
        return "low"

    def _pick_primary_signal(self, signal_scores: Dict[str, int]) -> Optional[str]:
        if not signal_scores:
            return None

        priority_index = {name: index for index, name in enumerate(SIGNAL_PRIORITY)}
        return max(
            signal_scores.keys(),
            key=lambda name: (
                signal_scores.get(name, 0),
                -priority_index.get(name, len(priority_index)),
            ),
        )

    def _index_users(
        self,
        users: List[Dict[str, Any]]
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
            user_id = self._coerce_user_id(value)
            if user_id:
                return user_id
        return None

    def _coerce_user_id(self, value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return str(value)

    def _parse_target_date(self, target_date: Optional[str]) -> datetime:
        if not target_date:
            return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        try:
            parsed = datetime.strptime(target_date, "%Y-%m-%d").date()
            return datetime.combine(parsed, datetime.min.time()).replace(tzinfo=timezone.utc)
        except ValueError:
            logger.warning("invalid_target_date value=%s", target_date)
            return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    def _parse_datetime(self, value: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            return self._ensure_utc(value)
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time()).replace(tzinfo=timezone.utc)
        if isinstance(value, (int, float)):
            return self._from_epoch(value)
        if isinstance(value, str):
            candidate = value.strip()
            if not candidate:
                return None
            try:
                if candidate.endswith("Z"):
                    candidate = candidate[:-1] + "+00:00"
                parsed = datetime.fromisoformat(candidate)
                return self._ensure_utc(parsed)
            except ValueError:
                return None
        return None

    def _from_epoch(self, value: float) -> datetime:
        timestamp = float(value)
        if timestamp > 1e12:
            timestamp = timestamp / 1000.0
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)

    def _ensure_utc(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _normalize_event(self, row: Dict[str, Any]) -> Optional[EventSignal]:
        try:
            parsed = EventSignal.model_validate(row)
        except ValidationError:
            logger.exception("churn_scoring_invalid_event")
            return None

        parsed.event_name = parsed.event_name.strip().lower()
        parsed.user_id = parsed.user_id.strip()
        parsed.timestamp = self._ensure_utc(parsed.timestamp)
        return parsed

    def _fetch_events_chunked(
        self,
        tenant_id: str,
        user_ids: List[str],
        start_ts: datetime,
        end_ts: datetime,
        event_names: Iterable[str],
        select_fields: str,
        batch_label: str,
    ) -> Iterable[Dict[str, Any]]:
        if not user_ids:
            return []

        batch_size = min(DEFAULT_EVENT_BATCH_SIZE, len(user_ids))
        index = 0

        while index < len(user_ids):
            chunk = user_ids[index:index + batch_size]
            start = time.time()
            resp = (
                self.db
                .table("events")
                .select(select_fields)
                .eq("tenant_id", tenant_id)
                .in_("user_id", chunk)
                .in_("event_name", list(event_names))
                .gte("timestamp", self._to_iso(start_ts))
                .lt("timestamp", self._to_iso(end_ts))
                .execute()
            )
            duration = time.time() - start

            if duration > SLOW_QUERY_THRESHOLD_SEC and batch_size > MIN_EVENT_BATCH_SIZE:
                batch_size = max(MIN_EVENT_BATCH_SIZE, batch_size // 2)

            if duration > SLOW_QUERY_THRESHOLD_SEC:
                logger.warning(
                    "churn_scoring_slow_query tenant=%s label=%s duration=%ss batch=%d",
                    tenant_id,
                    batch_label,
                    round(duration, 3),
                    len(chunk),
                )

            for row in (resp.data or []):
                yield row

            index += len(chunk)

    def _fetch_active_users(
        self,
        tenant_id: str,
        user_ids: List[str],
        start_ts: datetime,
        end_ts: datetime,
    ) -> Set[str]:
        if CHURN_USE_ACTIVITY_ROLLUP:
            try:
                return self._fetch_active_users_from_rollup(
                    tenant_id,
                    user_ids,
                    start_ts,
                    end_ts,
                )
            except Exception:
                logger.exception(
                    "churn_scoring_rollup_failed tenant=%s",
                    tenant_id,
                )

        return self._fetch_active_users_from_events(
            tenant_id,
            user_ids,
            start_ts,
            end_ts,
        )

    def _fetch_active_users_from_events(
        self,
        tenant_id: str,
        user_ids: List[str],
        start_ts: datetime,
        end_ts: datetime,
    ) -> Set[str]:
        if not user_ids:
            return set()

        batch_size = min(DEFAULT_EVENT_BATCH_SIZE, len(user_ids))
        active_users: Set[str] = set()
        index = 0

        while index < len(user_ids):
            chunk = user_ids[index:index + batch_size]
            start = time.time()
            resp = (
                self.db
                .table("events")
                .select("user_id")
                .eq("tenant_id", tenant_id)
                .in_("user_id", chunk)
                .gte("timestamp", self._to_iso(start_ts))
                .lt("timestamp", self._to_iso(end_ts))
                .execute()
            )
            duration = time.time() - start

            if duration > SLOW_QUERY_THRESHOLD_SEC and batch_size > MIN_EVENT_BATCH_SIZE:
                batch_size = max(MIN_EVENT_BATCH_SIZE, batch_size // 2)

            if duration > SLOW_QUERY_THRESHOLD_SEC:
                logger.warning(
                    "churn_scoring_slow_query tenant=%s label=activity duration=%ss batch=%d",
                    tenant_id,
                    round(duration, 3),
                    len(chunk),
                )

            for row in (resp.data or []):
                user_id = self._coerce_user_id(row.get("user_id"))
                if user_id:
                    active_users.add(user_id)

            index += len(chunk)

        return active_users

    def _fetch_active_users_from_rollup(
        self,
        tenant_id: str,
        user_ids: List[str],
        start_ts: datetime,
        end_ts: datetime,
    ) -> Set[str]:
        if not user_ids:
            return set()

        batch_size = min(DEFAULT_EVENT_BATCH_SIZE, len(user_ids))
        active_users: Set[str] = set()
        index = 0

        while index < len(user_ids):
            chunk = user_ids[index:index + batch_size]
            start = time.time()
            resp = (
                self.db
                .table(ACTIVITY_ROLLUP_TABLE)
                .select("user_id,last_seen_at")
                .eq("tenant_id", tenant_id)
                .in_("user_id", chunk)
                .gte("last_seen_at", self._to_iso(start_ts))
                .lt("last_seen_at", self._to_iso(end_ts))
                .execute()
            )
            duration = time.time() - start

            if duration > SLOW_QUERY_THRESHOLD_SEC and batch_size > MIN_EVENT_BATCH_SIZE:
                batch_size = max(MIN_EVENT_BATCH_SIZE, batch_size // 2)

            if duration > SLOW_QUERY_THRESHOLD_SEC:
                logger.warning(
                    "churn_scoring_slow_query tenant=%s label=activity_rollup duration=%ss batch=%d",
                    tenant_id,
                    round(duration, 3),
                    len(chunk),
                )

            for row in (resp.data or []):
                user_id = self._coerce_user_id(row.get("user_id"))
                if user_id:
                    active_users.add(user_id)

            index += len(chunk)

        return active_users

    def _track_latest_event(
        self,
        bucket: Dict[str, datetime],
        user_id: str,
        event_ts: datetime
    ) -> None:
        current = bucket.get(user_id)
        if not current or event_ts > current:
            bucket[user_id] = event_ts

    def _is_inactive_user(
        self,
        profile: UserProfile,
        user_id: str,
        cutoff: datetime,
        active_user_ids: Set[str],
    ) -> bool:
        last_seen = self._best_last_seen(profile)
        if last_seen:
            return last_seen < cutoff and user_id not in active_user_ids
        return user_id not in active_user_ids

    def _best_last_seen(self, profile: UserProfile) -> Optional[str]:
        last_seen = profile.last_seen_at or profile.last_seen or profile.last_active_at
        if not last_seen:
            return None
        parsed = self._parse_datetime(last_seen)
        return parsed.isoformat() if parsed else None

    def _days_since_last_seen(
        self,
        profile: UserProfile,
        window_end: datetime,
    ) -> Optional[int]:
        last_seen = profile.last_seen_at or profile.last_seen or profile.last_active_at
        parsed = self._parse_datetime(last_seen)
        if not parsed:
            return None
        delta = window_end - parsed
        return int(delta.total_seconds() // 86400)

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
        sentiment = str(properties.get("sentiment") or properties.get("sentiment_label") or "").strip().lower()
        rating = properties.get("rating")
        reason = str(properties.get("reason") or "").strip().lower()
        feedback_text = str(properties.get("feedback_text") or properties.get("text") or "").strip().lower()

        if sentiment in NEGATIVE_SENTIMENT_VALUES:
            return True

        if rating is not None:
            try:
                rating_value = int(rating)
            except (TypeError, ValueError):
                rating_value = None

            if rating_value is not None:
                if rating_value <= 2:
                    return True
                if rating_value >= 4 and sentiment in POSITIVE_SENTIMENT_VALUES:
                    if not (self._contains_negative(reason) or self._contains_negative(feedback_text)):
                        return False

        if reason and self._contains_negative(reason):
            return True

        if feedback_text and self._contains_negative(feedback_text):
            return True

        return False

    def _contains_negative(self, text: str) -> bool:
        for keyword in NEGATIVE_KEYWORDS:
            if keyword in text:
                return True
        return False

    def _chunk_user_ids(
        self,
        user_ids: List[str],
        batch_size: int
    ) -> Iterable[List[str]]:
        if batch_size <= 0:
            batch_size = DEFAULT_EVENT_BATCH_SIZE
        for index in range(0, len(user_ids), batch_size):
            yield user_ids[index:index + batch_size]

    def _to_iso(self, value: datetime) -> str:
        return self._ensure_utc(value).isoformat()

    def _persist_risk_state(
        self,
        tenant_id: str,
        risk_state_rows: List[Dict[str, Any]],
        history_rows: List[Dict[str, Any]],
    ) -> None:
        if not risk_state_rows:
            return

        batch_size = min(DEFAULT_EVENT_BATCH_SIZE, len(risk_state_rows))

        for chunk in self._chunk_user_ids(list(range(len(risk_state_rows))), batch_size):
            state_payload = [risk_state_rows[i] for i in chunk]
            history_payload = [history_rows[i] for i in chunk]

            try:
                (
                    self.db
                    .table(RISK_STATE_TABLE)
                    .upsert(state_payload, on_conflict="tenant_id,user_id")
                    .execute()
                )
                (
                    self.db
                    .table(RISK_HISTORY_TABLE)
                    .insert(history_payload)
                    .execute()
                )
            except Exception:
                logger.exception(
                    "churn_scoring_persist_failed tenant=%s rows=%d",
                    tenant_id,
                    len(state_payload),
                )
                return
