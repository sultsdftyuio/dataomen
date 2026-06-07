"""
Churn scoring configuration, constants, and Pydantic models.

This module contains all environment-driven configuration, signal weighting
constants, and data models used by the churn scoring system.
"""

import json
import logging
import math
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment-based configuration
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# CRITICAL FIX: Activity rollup is now enabled by default.
# Previously defaulted to "false", causing every worker to hit the raw
# events table even when a rollup was available.
# ---------------------------------------------------------------------------
CHURN_USE_ACTIVITY_ROLLUP = (
    os.getenv("CHURN_USE_ACTIVITY_ROLLUP", "true").lower() == "true"
)
ACTIVITY_ROLLUP_TABLE = os.getenv(
    "CHURN_ACTIVITY_ROLLUP_TABLE", "user_activity_daily"
)

PERSIST_RISK_STATE = (
    os.getenv("CHURN_PERSIST_RISK_STATE", "true").lower() == "true"
)
RISK_STATE_TABLE = os.getenv("CHURN_RISK_STATE_TABLE", "churn_risk_state")
RISK_HISTORY_TABLE = os.getenv(
    "CHURN_RISK_HISTORY_TABLE", "churn_risk_history"
)
RISK_SCORE_VERSION = os.getenv("CHURN_SCORE_VERSION", "v1")

# ---------------------------------------------------------------------------
# Memory-protection caps
# ---------------------------------------------------------------------------

# Maximum rows allowed per query before we consider it an unbounded result
# set and log a critical warning.
MAX_ROWS_PER_QUERY = int(os.getenv("CHURN_MAX_ROWS_PER_QUERY", "10000"))

# When a query returns more rows than this threshold, halve the batch size
# for the next iteration — protects against tenants with spiky event volume.
HIGH_ROW_COUNT_THRESHOLD = int(
    os.getenv("CHURN_HIGH_ROW_THRESHOLD", "5000")
)

# ---------------------------------------------------------------------------
# Signal weights & metadata
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Sentiment / keyword matching
# ---------------------------------------------------------------------------

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


# ===========================================================================
# Pydantic models
# ===========================================================================

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