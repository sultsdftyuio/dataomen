import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from pydantic import BaseModel, EmailStr, Field, ValidationError

from api.tasks import send_recovery_email

logger = logging.getLogger(__name__)

COOLDOWN_DAYS = int(os.getenv("RECOVERY_COOLDOWN_DAYS", "7"))
ATTRIBUTION_WINDOW_DAYS = int(os.getenv("RECOVERY_ATTRIBUTION_WINDOW_DAYS", "14"))
MAX_SENDS_PER_TENANT_PER_HOUR = int(
    os.getenv("RECOVERY_MAX_SENDS_PER_TENANT_PER_HOUR", "0")
)

RECOVERY_EMAIL_TABLE = os.getenv("RECOVERY_EMAIL_TABLE", "recovery_emails")
RECOVERY_SUPPRESSIONS_TABLE = os.getenv(
    "RECOVERY_SUPPRESSIONS_TABLE", "recovery_suppressions"
)

STATUS_QUEUED = "queued"
STATUS_COOLDOWN = "cooldown_skipped"
STATUS_RATE_LIMITED = "rate_limited"
STATUS_SUPPRESSED = "suppressed"

DEFAULT_CAMPAIGN_MAP = {
    "inactivity": "winback_inactive",
    "invoice_payment_failed": "billing_failed",
    "subscription_cancelled": "cancellation_followup",
    "negative_feedback": "feedback_recovery",
}


class RecoveryCandidate(BaseModel):
    user_id: str = Field(..., min_length=1)
    email: EmailStr
    primary_risk_signal: str = Field(..., min_length=1)
    churn_risk_score: Optional[int] = None


class RecoveryDecision(BaseModel):
    status: str
    campaign_type: Optional[str] = None
    send_id: Optional[str] = None
    reason: Optional[str] = None


class RecoveryRepository:
    def __init__(self, db_client):
        self.db = db_client

    def is_suppressed(
        self,
        tenant_id: str,
        email: str,
        user_id: str
    ) -> bool:
        try:
            resp = (
                self.db
                .table(RECOVERY_SUPPRESSIONS_TABLE)
                .select("id,expires_at")
                .eq("tenant_id", tenant_id)
                .eq("email", email)
                .limit(1)
                .execute()
            )
        except Exception:
            logger.exception(
                "recovery_suppression_check_failed tenant=%s user_id=%s",
                tenant_id,
                user_id,
            )
            return True

        if not resp.data:
            return False

        expires_at = resp.data[0].get("expires_at")
        if expires_at:
            expires_dt = _parse_datetime(expires_at)
            if expires_dt and expires_dt <= datetime.now(timezone.utc):
                return False

        return True

    def is_rate_limited(self, tenant_id: str) -> bool:
        if MAX_SENDS_PER_TENANT_PER_HOUR <= 0:
            return False

        window_start = datetime.now(timezone.utc) - timedelta(hours=1)

        try:
            resp = (
                self.db
                .table(RECOVERY_EMAIL_TABLE)
                .select("id", count="exact")
                .eq("tenant_id", tenant_id)
                .gte("created_at", window_start.isoformat())
                .execute()
            )
        except Exception:
            logger.exception(
                "recovery_rate_limit_check_failed tenant=%s",
                tenant_id,
            )
            return False

        count = getattr(resp, "count", None)
        if count is None:
            count = len(resp.data or [])

        return count >= MAX_SENDS_PER_TENANT_PER_HOUR

    def claim_send(
        self,
        tenant_id: str,
        candidate: RecoveryCandidate,
        campaign_type: str
    ) -> Optional[str]:
        cooldown_start = datetime.now(timezone.utc) - timedelta(days=COOLDOWN_DAYS)

        try:
            recent = (
                self.db
                .table(RECOVERY_EMAIL_TABLE)
                .select("id,created_at")
                .eq("tenant_id", tenant_id)
                .eq("user_id", candidate.user_id)
                .eq("campaign_type", campaign_type)
                .gte("created_at", cooldown_start.isoformat())
                .limit(1)
                .execute()
            )
        except Exception:
            logger.exception(
                "recovery_cooldown_check_failed tenant=%s user_id=%s campaign=%s",
                tenant_id,
                candidate.user_id,
                campaign_type,
            )
            return None

        if recent.data:
            return None

        now = datetime.now(timezone.utc)
        cooldown_anchor = now.replace(hour=0, minute=0, second=0, microsecond=0)
        cooldown_until = cooldown_anchor + timedelta(days=COOLDOWN_DAYS)
        idempotency_key = _build_idempotency_key(
            tenant_id,
            candidate.user_id,
            campaign_type,
            cooldown_anchor.date().isoformat(),
        )

        payload: Dict[str, Any] = {
            "tenant_id": tenant_id,
            "user_id": candidate.user_id,
            "email": candidate.email,
            "campaign_type": campaign_type,
            "status": STATUS_QUEUED,
            "idempotency_key": idempotency_key,
            "queued_at": now.isoformat(),
            "created_at": now.isoformat(),
            "cooldown_until": cooldown_until.isoformat(),
            "primary_risk_signal": candidate.primary_risk_signal,
            "churn_risk_score": candidate.churn_risk_score,
            "attribution_window_days": ATTRIBUTION_WINDOW_DAYS,
            "attempt_count": 0,
        }

        try:
            resp = (
                self.db
                .table(RECOVERY_EMAIL_TABLE)
                .insert(payload)
                .execute()
            )
        except Exception:
            logger.exception(
                "recovery_send_claim_failed tenant=%s user_id=%s campaign=%s",
                tenant_id,
                candidate.user_id,
                campaign_type,
            )
            return None

        if resp.data:
            return resp.data[0].get("id")

        error = getattr(resp, "error", None)
        if error and _is_duplicate_error(error):
            return None

        if error:
            logger.warning(
                "recovery_send_claim_error tenant=%s user_id=%s campaign=%s error=%s",
                tenant_id,
                candidate.user_id,
                campaign_type,
                error,
            )

        return None


class RecoveryAutomationEngine:
    """
    Routes at-risk users to recovery campaigns and queues async email delivery.
    """

    def __init__(self, db_client, email_queue=None):
        self.db = db_client
        self.email_queue = email_queue
        self.repo = RecoveryRepository(db_client)

    def evaluate_and_queue_campaign(
        self,
        tenant_id: str,
        user: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if not tenant_id:
            raise ValueError("tenant_id is required")

        if not user:
            return None

        candidate = self._build_candidate(user)
        if not candidate:
            return None

        campaign_type = self._map_signal_to_campaign(candidate.primary_risk_signal)
        if not campaign_type:
            logger.warning(
                "recovery_unknown_signal tenant=%s user_id=%s signal=%s",
                tenant_id,
                candidate.user_id,
                candidate.primary_risk_signal,
            )
            return None

        if self.repo.is_suppressed(tenant_id, candidate.email, candidate.user_id):
            return RecoveryDecision(
                status=STATUS_SUPPRESSED,
                campaign_type=campaign_type,
                reason="suppressed",
            ).model_dump(exclude_none=True)

        if self.repo.is_rate_limited(tenant_id):
            return RecoveryDecision(
                status=STATUS_RATE_LIMITED,
                campaign_type=campaign_type,
                reason="rate_limited",
            ).model_dump(exclude_none=True)

        send_id = self.repo.claim_send(
            tenant_id=tenant_id,
            candidate=candidate,
            campaign_type=campaign_type,
        )

        if not send_id:
            return RecoveryDecision(
                status=STATUS_COOLDOWN,
                campaign_type=campaign_type,
                reason="cooldown_or_duplicate",
            ).model_dump(exclude_none=True)

        try:
            send_recovery_email.send(
                tenant_id,
                candidate.user_id,
                candidate.email,
                campaign_type,
            )
        except Exception:
            logger.exception(
                "recovery_queue_failed tenant=%s user_id=%s campaign=%s send_id=%s",
                tenant_id,
                candidate.user_id,
                campaign_type,
                send_id,
            )
            return None

        logger.info(
            "recovery_send_queued tenant=%s user_id=%s campaign=%s send_id=%s",
            tenant_id,
            candidate.user_id,
            campaign_type,
            send_id,
        )

        return RecoveryDecision(
            status=STATUS_QUEUED,
            campaign_type=campaign_type,
            send_id=send_id,
        ).model_dump(exclude_none=True)

    def _build_candidate(self, user: Dict[str, Any]) -> Optional[RecoveryCandidate]:
        user_id = _resolve_user_id(user)
        email = _resolve_email(user)
        primary_signal = (user.get("primary_risk_signal") or "").strip().lower()

        if not user_id:
            logger.warning("recovery_missing_user_id")
            return None

        if not email:
            logger.warning("recovery_missing_email user_id=%s", user_id)
            return None

        try:
            return RecoveryCandidate.model_validate({
                "user_id": user_id,
                "email": email,
                "primary_risk_signal": primary_signal,
                "churn_risk_score": user.get("churn_risk_score"),
            })
        except ValidationError:
            logger.exception(
                "recovery_candidate_invalid user_id=%s email=%s",
                user_id,
                email,
            )
            return None

    def _map_signal_to_campaign(self, signal: str) -> Optional[str]:
        return DEFAULT_CAMPAIGN_MAP.get(signal)


def _resolve_user_id(user: Dict[str, Any]) -> Optional[str]:
    for key in ("user_id", "id", "uid", "auth_user_id"):
        value = user.get(key)
        user_id = _coerce_string(value)
        if user_id:
            return user_id
    return None


def _resolve_email(user: Dict[str, Any]) -> Optional[str]:
    for key in ("email", "user_email", "primary_email"):
        value = user.get(key)
        email = _coerce_string(value)
        if email:
            return email
    return None


def _coerce_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return str(value)


def _build_idempotency_key(
    tenant_id: str,
    user_id: str,
    campaign_type: str,
    window_key: str
) -> str:
    raw = f"{tenant_id}:{user_id}:{campaign_type}:{window_key}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _is_duplicate_error(error: Any) -> bool:
    text = str(error).lower()
    return "duplicate" in text or "unique" in text or "23505" in text


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            if candidate.endswith("Z"):
                candidate = candidate[:-1] + "+00:00"
            parsed = datetime.fromisoformat(candidate)
            return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None
