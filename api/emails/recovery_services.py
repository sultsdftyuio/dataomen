import logging
import time
from datetime import timedelta
from typing import Any, Dict, Optional

from postgrest.exceptions import APIError as PostgrestAPIError
from supabase import Client

from recovery_models import (
    MAX_SEND_ATTEMPTS,
    METRICS,
    RECOVERY_ATTEMPT_RESERVATION_RPC,
    RECOVERY_DISPATCH_TOKEN_RPC,
    RECOVERY_DLQ_TABLE,
    RECOVERY_EMAIL_EVENTS_TABLE,
    RECOVERY_EMAIL_TABLE,
    RECOVERY_UNIFIED_RESERVE_RPC,
    DispatchTokenClaimResponse,
    FailureStage,
    RecoverySendRecord,
    RecoveryStatus,
    SendResult,
    UnifiedReserveResponse,
    get_template_renderer,
    safe_model_validate,
    utc_now,
    utc_now_iso,
)

logger = logging.getLogger(__name__)


# ==========================================
# RECOVERY REPOSITORY
# ==========================================

class RecoveryRepository:
    def __init__(self, client: Client):
        self.client = client

    def tenant_has_pro_entitlement(self, tenant_id: str) -> bool:
        """
        Final delivery gate for recovery emails.
        New schemas use plan_tier/subscription_status; legacy schemas use plan/status.
        Fail closed if billing state cannot be resolved.
        """
        active_statuses = {"active", "trialing"}

        try:
            resp = (
                self.client.table("tenants")
                .select("plan_tier, subscription_status")
                .eq("tenant_id", tenant_id)
                .limit(1)
                .execute()
            )
            row = (resp.data or [None])[0]
            if row:
                plan_tier = str(row.get("plan_tier") or "").strip().lower()
                status = str(row.get("subscription_status") or "").strip().lower()
                return plan_tier == "pro" and status in active_statuses
        except PostgrestAPIError:
            logger.info("tenant_entitlement_preferred_schema_unavailable tenant=%s", tenant_id)
        except Exception:
            logger.exception("tenant_entitlement_check_failed tenant=%s", tenant_id)
            return False

        try:
            resp = (
                self.client.table("tenants")
                .select("plan, status")
                .eq("tenant_id", tenant_id)
                .limit(1)
                .execute()
            )
            row = (resp.data or [None])[0]
            if not row:
                return False

            plan = str(row.get("plan") or "").strip().lower()
            status = str(row.get("status") or "").strip().lower()
            return plan == "pro" and status in active_statuses
        except Exception:
            logger.exception("tenant_entitlement_legacy_check_failed tenant=%s", tenant_id)
            return False

    # --- Event writing (audit trail with retry) ---
    def write_event(
        self,
        send_id: str,
        event_type: str,
        metadata: Optional[Dict[str, Any]] = None,
        max_retries: int = 2,
    ) -> bool:
        """
        Write an audit event with automatic retry.
        Returns True if the event was persisted, False otherwise.

        Note: Event writes are best-effort with retry. For strict compliance,
        consider a dead-letter queue for failed events or a background repair job.
        """
        if not send_id or not event_type:
            return False

        payload = {
            "send_id": send_id,
            "event_type": event_type,
            "metadata": metadata or {},
            "occurred_at": utc_now_iso(),
        }

        for attempt in range(max_retries + 1):
            try:
                resp = self.client.table(RECOVERY_EMAIL_EVENTS_TABLE).insert(payload).execute()
                if resp.data:
                    return True
            except PostgrestAPIError as exc:
                logger.warning(
                    "recovery_email_event_write_api_error send_id=%s event_type=%s attempt=%s error=%s",
                    send_id,
                    event_type,
                    attempt,
                    exc,
                )
            except Exception:
                logger.exception(
                    "recovery_email_event_write_failed send_id=%s event_type=%s attempt=%s",
                    send_id,
                    event_type,
                    attempt,
                )

            if attempt < max_retries:
                time.sleep(0.1 * (2 ** attempt))  # 100ms, 200ms backoff

        # All retries exhausted — log for potential background repair.
        logger.error(
            "recovery_email_event_write_exhausted send_id=%s event_type=%s retries=%s",
            send_id,
            event_type,
            max_retries,
        )
        METRICS.increment("recovery.event.write_exhausted")
        return False

    # --- Unified reserve (single round-trip) ---
    def unified_reserve(
        self,
        dispatch_token: str,
        tenant_id: str,
        send_id: str,
    ) -> UnifiedReserveResponse:
        """
        Single RPC call that:
          1. Claims the dispatch token
          2. Fetches the send record
          3. Checks cooldowns (global cap + template cooldown)
          4. Reserves the provider attempt

        Returns everything needed to decide whether to send.
        Falls back to individual queries if the unified RPC is not yet deployed.
        """
        payload = {
            "p_dispatch_token": dispatch_token,
            "p_tenant_id": tenant_id,
            "p_send_id": send_id,
            "p_max_attempts": MAX_SEND_ATTEMPTS,
        }

        try:
            resp = self.client.rpc(RECOVERY_UNIFIED_RESERVE_RPC, payload).execute()
        except PostgrestAPIError as exc:
            logger.warning(
                "unified_reserve_rpc_api_error tenant=%s send_id=%s error=%s",
                tenant_id,
                send_id,
                exc,
            )
            return self._fallback_reserve(dispatch_token, tenant_id, send_id)
        except Exception as exc:
            logger.warning(
                "unified_reserve_rpc_unavailable tenant=%s send_id=%s error=%s",
                tenant_id,
                send_id,
                exc,
            )
            return self._fallback_reserve(dispatch_token, tenant_id, send_id)

        if not resp.data:
            return UnifiedReserveResponse(error="missing")

        data = resp.data
        if isinstance(data, list):
            data = data[0] if data else None

        if not data or not isinstance(data, dict):
            return UnifiedReserveResponse(error="invalid")

        validated = safe_model_validate(UnifiedReserveResponse, data, f"unified_reserve:{tenant_id}:{send_id}")
        if validated is None:
            return UnifiedReserveResponse(error="invalid")
        return validated

    def _fallback_reserve(
        self,
        dispatch_token: str,
        tenant_id: str,
        send_id: str,
    ) -> UnifiedReserveResponse:
        """Graceful fallback to individual queries when unified RPC is unavailable."""
        # 1. Claim token
        claim = self.claim_dispatch_token(dispatch_token, tenant_id, send_id)
        if not claim.claimed:
            return UnifiedReserveResponse(claim_status=claim.state or "duplicate")

        # 2. Fetch record
        record = self.fetch_send_by_id(tenant_id, send_id)
        if not record:
            return UnifiedReserveResponse(claim_status="missing_record")

        # 3. Check terminal status
        if record.status in (
            RecoveryStatus.PROVIDER_ACCEPTED,
            RecoveryStatus.DELIVERED,
            RecoveryStatus.DEAD_LETTERED,
        ):
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                cooldown_status="terminal",
            )

        # 4. Check max attempts
        if record.attempt_count >= MAX_SEND_ATTEMPTS:
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                cooldown_status="max_attempts",
            )

        # 5. Check cooldowns
        if self.is_user_globally_capped(tenant_id, record.user_id):
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                cooldown_status="global_cap",
            )

        if self.is_template_on_cooldown(tenant_id, record.user_id, record.campaign_type):
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                cooldown_status="template_cooldown",
            )

        # 6. Reserve attempt
        attempt_count = self.reserve_provider_attempt(record.id)
        if attempt_count is None:
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                error="reservation_failed",
            )

        return UnifiedReserveResponse(
            record=record,
            claim_status="claimed",
            cooldown_status="ok",
            attempt_count=attempt_count,
        )

    # --- Legacy individual methods (used by fallback and DLQ operations) ---
    def fetch_send_by_id(self, tenant_id: str, send_id: str) -> Optional[RecoverySendRecord]:
        try:
            resp = (
                self.client
                .table(RECOVERY_EMAIL_TABLE)
                .select("*")
                .eq("tenant_id", tenant_id)
                .eq("id", send_id)
                .limit(1)
                .execute()
            )
        except PostgrestAPIError as exc:
            logger.exception(
                "fetch_send_api_error tenant=%s send_id=%s error=%s",
                tenant_id,
                send_id,
                exc,
            )
            return None
        except Exception:
            logger.exception(
                "fetch_send_failed tenant=%s send_id=%s",
                tenant_id,
                send_id,
            )
            return None

        if not resp.data:
            return None

        return safe_model_validate(RecoverySendRecord, resp.data[0], f"fetch_send:{tenant_id}:{send_id}")

    def claim_dispatch_token(self, dispatch_token: str, tenant_id: str, send_id: str) -> DispatchTokenClaimResponse:
        payload = {
            "p_dispatch_token": dispatch_token,
            "p_tenant_id": tenant_id,
            "p_send_id": send_id,
        }

        try:
            resp = self.client.rpc(RECOVERY_DISPATCH_TOKEN_RPC, payload).execute()
        except PostgrestAPIError as exc:
            logger.exception(
                "dispatch_token_claim_api_error tenant=%s send_id=%s error=%s",
                tenant_id,
                send_id,
                exc,
            )
            return DispatchTokenClaimResponse(claimed=False, state="api_error")
        except Exception:
            logger.exception("dispatch_token_claim_failed tenant=%s send_id=%s", tenant_id, send_id)
            return DispatchTokenClaimResponse(claimed=False, state="error")

        if not resp.data:
            return DispatchTokenClaimResponse(claimed=False, state="missing")

        payload = resp.data
        if isinstance(payload, list):
            payload = payload[0] if payload else None

        if not payload:
            return DispatchTokenClaimResponse(claimed=False, state="missing")

        validated = safe_model_validate(
            DispatchTokenClaimResponse,
            payload,
            f"claim_dispatch:{tenant_id}:{send_id}",
        )
        if validated is None:
            return DispatchTokenClaimResponse(claimed=False, state="invalid")
        return validated

    def reserve_provider_attempt(self, send_id: str) -> Optional[int]:
        payload = {"p_send_id": send_id}

        try:
            resp = self.client.rpc(RECOVERY_ATTEMPT_RESERVATION_RPC, payload).execute()
        except PostgrestAPIError as exc:
            logger.exception("attempt_reservation_api_error send_id=%s error=%s", send_id, exc)
            raise
        except Exception:
            logger.exception("attempt_reservation_failed send_id=%s", send_id)
            raise

        if not resp.data:
            return None

        data = resp.data
        if isinstance(data, list):
            data = data[0] if data else None

        if not data or not isinstance(data, dict):
            return None

        attempt_value = data.get("attempt_count")
        if attempt_value is None:
            return None

        try:
            return int(attempt_value)
        except (TypeError, ValueError):
            logger.exception("attempt_reservation_invalid send_id=%s", send_id)
            return None

    def is_user_globally_capped(self, tenant_id: str, user_id: str) -> bool:
        window_start = utc_now() - timedelta(hours=24)
        try:
            resp = (
                self.client.table(RECOVERY_EMAIL_TABLE)
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .in_("status", [RecoveryStatus.PROVIDER_ACCEPTED.value, RecoveryStatus.DELIVERED.value])
                .gte("provider_accepted_at", window_start.isoformat())
                .limit(1)
                .execute()
            )
            return len(resp.data or []) > 0
        except PostgrestAPIError as exc:
            logger.exception(
                "is_user_globally_capped_api_error tenant=%s user=%s error=%s",
                tenant_id,
                user_id,
                exc,
            )
            return True
        except Exception:
            logger.exception("is_user_globally_capped_failed tenant=%s user=%s", tenant_id, user_id)
            return True

    def is_template_on_cooldown(self, tenant_id: str, user_id: str, campaign_type: str) -> bool:
        window_start = utc_now() - timedelta(days=7)
        try:
            resp = (
                self.client.table(RECOVERY_EMAIL_TABLE)
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .eq("campaign_type", campaign_type)
                .in_("status", [RecoveryStatus.PROVIDER_ACCEPTED.value, RecoveryStatus.DELIVERED.value])
                .gte("provider_accepted_at", window_start.isoformat())
                .limit(1)
                .execute()
            )
            return len(resp.data or []) > 0
        except PostgrestAPIError as exc:
            logger.exception(
                "is_template_on_cooldown_api_error tenant=%s user=%s error=%s",
                tenant_id,
                user_id,
                exc,
            )
            return False
        except Exception:
            logger.exception("is_template_on_cooldown_failed tenant=%s user=%s", tenant_id, user_id)
            return False

    def mark_provider_accepted(self, send_id: str, provider_message_id: Optional[str]) -> bool:
        """
        Mark send as provider-accepted. Verifies the update succeeded before writing audit event.
        Returns True if the update was confirmed.
        """
        now = utc_now_iso()
        payload = {
            "status": RecoveryStatus.PROVIDER_ACCEPTED.value,
            "provider_message_id": provider_message_id,
            "provider_accepted_at": now,
            "sent_at": now,
            "updated_at": now,
        }

        try:
            resp = self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        except PostgrestAPIError as exc:
            logger.exception(
                "mark_provider_accepted_api_error send_id=%s error=%s",
                send_id,
                exc,
            )
            return False
        except Exception:
            logger.exception("mark_provider_accepted_failed send_id=%s", send_id)
            return False

        # Verify the update actually affected a row.
        if not resp.data or len(resp.data) == 0:
            logger.warning(
                "mark_provider_accepted_no_rows send_id=%s — row may have disappeared or RLS rejected",
                send_id,
            )
            return False

        # Only write the audit event if the DB update was confirmed.
        self.write_event(send_id, "provider_accepted", {"provider_message_id": provider_message_id})
        return True

    def mark_delivered(self, send_id: str) -> bool:
        """Mark send as delivered. Returns True if the update was confirmed."""
        now = utc_now_iso()
        payload = {
            "status": RecoveryStatus.DELIVERED.value,
            "delivered_at": now,
            "updated_at": now,
        }

        try:
            resp = self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        except PostgrestAPIError as exc:
            logger.exception("mark_delivered_api_error send_id=%s error=%s", send_id, exc)
            return False
        except Exception:
            logger.exception("mark_delivered_failed send_id=%s", send_id)
            return False

        if not resp.data or len(resp.data) == 0:
            logger.warning("mark_delivered_no_rows send_id=%s", send_id)
            return False

        self.write_event(send_id, "delivered", {})
        return True

    def mark_dispatch_failed(
        self,
        send_id: str,
        error: str,
        failure_stage: FailureStage,
        next_retry_at: Optional[str],
    ) -> bool:
        """Mark send as dispatch-failed. Returns True if the update was confirmed."""
        payload = {
            "status": RecoveryStatus.DISPATCH_FAILED.value,
            "failure_stage": failure_stage.value,
            "last_error": error[:500],
            "next_retry_at": next_retry_at,
            "updated_at": utc_now_iso(),
        }

        try:
            self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        except PostgrestAPIError as exc:
            logger.exception(
                "mark_dispatch_failed_api_error send_id=%s error=%s",
                send_id,
                exc,
            )
            return False
        except Exception:
            logger.exception("mark_dispatch_failed send_id=%s", send_id)
            return False

        self.write_event(send_id, "dispatch_failed", {"error": error, "stage": failure_stage.value})
        return True

    def mark_dead_lettered(self, send_id: str, error: str, failure_stage: FailureStage) -> bool:
        """Mark send as dead-lettered. Returns True if the update was confirmed."""
        payload = {
            "status": RecoveryStatus.DEAD_LETTERED.value,
            "failure_stage": failure_stage.value,
            "last_error": error[:500],
            "updated_at": utc_now_iso(),
        }

        try:
            self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        except PostgrestAPIError as exc:
            logger.exception(
                "mark_dead_lettered_api_error send_id=%s error=%s",
                send_id,
                exc,
            )
            return False
        except Exception:
            logger.exception("mark_dead_lettered send_id=%s", send_id)
            return False

        self.write_event(send_id, "dead_lettered", {"error": error, "stage": failure_stage.value})
        return True

    def write_dlq(
        self,
        send_id: str,
        tenant_id: str,
        user_id: str,
        campaign_type: str,
        error: str,
        dispatch_token: Optional[str],
    ) -> None:
        payload: Dict[str, Any] = {
            "send_id": send_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "campaign_type": campaign_type,
            "dispatch_token": dispatch_token,
            "last_error": error,
            "failed_at": utc_now_iso(),
        }

        try:
            self.client.table(RECOVERY_DLQ_TABLE).insert(payload).execute()
        except PostgrestAPIError as exc:
            logger.exception(
                "write_dlq_api_error send_id=%s error=%s",
                send_id,
                exc,
            )
        except Exception:
            logger.exception("write_dlq_failed send_id=%s", send_id)


