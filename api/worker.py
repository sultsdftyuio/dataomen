import logging
import os
import time
import uuid
import threading
from datetime import datetime, timezone, timedelta
from typing import Generator, List, Dict, Any, Optional

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from supabase import Client, create_client, ClientOptions
from sqlalchemy import text
from api.database import SessionLocal

from api.recovery_common import (
    ClaimOutcome,
    FailureStage,
    OutboxClaimRow,
    RECOVERY_EMAIL_TABLE,
    RecoveryStatus,
    apply_outbox_backpressure,
    claim_outbox_batch,
    dispatch_backoff_seconds,
)
from api.services.churn_scoring_service import ChurnScoringService
from api.services.recovery_engine import RecoveryAutomationEngine

logger = logging.getLogger("arcli_worker")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
dramatiq.set_broker(RedisBroker(url=REDIS_URL))

SUPABASE_TIMEOUT_SEC = float(os.getenv("SUPABASE_TIMEOUT_SEC", "15.0"))

_thread_local = threading.local()

_TENANT_STATUS_RANKS = {
    "PROVISIONING": 10,
    "INTEGRATION": 20,
    "ACTIVE": 30,
    "FAILED": 40,
}


def _upsert_tenant_status(tenant_id: str, status: str) -> None:
    try:
        supabase = _get_supabase_client()
    except Exception:
        logger.exception("tenant_status_update_failed tenant_id=%s status=%s", tenant_id, status)
        return

    try:
        current_resp = (
            supabase.table("tenants")
            .select("status")
            .eq("tenant_id", tenant_id)
            .limit(1)
            .execute()
        )

        current_status = None
        if current_resp.data:
            current_status = str(current_resp.data[0].get("status") or "").strip() or None

        if _tenant_status_rank(current_status) >= _tenant_status_rank(status):
            logger.debug(
                "tenant_status_update_skipped tenant_id=%s current_status=%s requested_status=%s",
                tenant_id,
                current_status,
                status,
            )
            return

        supabase.table("tenants").update({"status": status}).eq("tenant_id", tenant_id).execute()
    except Exception:
        logger.exception("tenant_status_update_failed tenant_id=%s status=%s", tenant_id, status)


def _get_supabase_client() -> Client:
    if hasattr(_thread_local, "supabase_client"):
        return _thread_local.supabase_client

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        logger.critical("supabase_credentials_missing_service_role")
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY and URL are required for background workers.")

    options = ClientOptions(postgrest_client_timeout=SUPABASE_TIMEOUT_SEC)

    client = create_client(supabase_url, supabase_key, options=options)
    _thread_local.supabase_client = client
    return client


def _extract_tenant_id(payload: Any) -> Optional[str]:
    if payload is None:
        return None

    if isinstance(payload, str):
        tenant_id = payload.strip()
        return tenant_id or None

    if isinstance(payload, dict):
        tenant_id = payload.get("tenant_id") or payload.get("tenantId") or payload.get("id")
        if tenant_id:
            return str(tenant_id)
        return None

    if isinstance(payload, list):
        for item in payload:
            tenant_id = _extract_tenant_id(item)
            if tenant_id:
                return tenant_id

    return None


def log_critical_error(error: Exception) -> None:
    logger.exception("signup_provisioning_critical_error error=%s", repr(error))


def mark_tenant_failed(user_id: str) -> None:
    supabase = _get_supabase_client()

    try:
        mapping_resp = (
            supabase.table("tenant_users")
            .select("tenant_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        tenant_id = None
        if mapping_resp.data:
            tenant_id = str(mapping_resp.data[0].get("tenant_id") or "").strip() or None
        if tenant_id:
            _upsert_tenant_status(tenant_id, "FAILED")

        supabase.rpc(
            "mark_tenant_failed",
            {
                "target_user_id": user_id,
            },
        ).execute()
    except Exception:
        logger.exception("tenant_failure_mark_failed user_id=%s", user_id)


@dramatiq.actor(max_retries=4, min_backoff=5_000, max_backoff=120_000)
def setup_stripe_customer_async(tenant_id: str, user_id: str) -> None:
    logger.info(
        "stripe_customer_setup_started tenant=%s user=%s",
        tenant_id,
        user_id,
    )
    _upsert_tenant_status(tenant_id, "INTEGRATION")


def handle_user_signup(user_id: str) -> Optional[str]:
    try:
        supabase = _get_supabase_client()

        response = supabase.rpc(
            "provision_initial_workspace",
            {
                "target_user_id": user_id,
                "default_name": "My Workspace",
            },
        ).execute()

        tenant_id = _extract_tenant_id(response.data)
        if tenant_id is None:
            raise RuntimeError("Workspace provisioning returned no tenant_id")

        _upsert_tenant_status(tenant_id, "PROVISIONING")
        setup_stripe_customer_async.delay(tenant_id=tenant_id, user_id=user_id)
        return tenant_id

    except Exception as error:
        mark_tenant_failed(user_id)
        log_critical_error(error)
        return None


class MetricsSink:
    def increment(self, name: str, value: int = 1, tags: Optional[Dict[str, str]] = None) -> None:
        logger.debug("metric_increment name=%s value=%s tags=%s", name, value, tags)

    def timing(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        logger.debug("metric_timing name=%s value=%s tags=%s", name, round(value, 6), tags)


METRICS = MetricsSink()

# ---------------------------------------------------------
# PIPELINE CONFIG
# ---------------------------------------------------------

MAX_TENANT_RUNTIME_SEC = int(os.getenv("MAX_TENANT_RUNTIME_SEC", "60"))
USER_BATCH_SIZE = int(os.getenv("USER_BATCH_SIZE", "500"))
USER_PROFILE_CURSOR_FIELD = os.getenv("USER_PROFILE_CURSOR_FIELD", "id").strip() or "id"
ALLOWED_CURSOR_FIELDS = {"id", "created_at"}
MAX_USERS_PER_TENANT_RUN = int(os.getenv("MAX_USERS_PER_TENANT_RUN", "10000"))
MAX_EMAILS_PER_TENANT_RUN = int(os.getenv("MAX_EMAILS_PER_TENANT_RUN", "500"))

PIPELINE_BATCH_TARGET_DURATION_SEC = float(os.getenv("PIPELINE_BATCH_TARGET_DURATION_SEC", "0.35"))
PIPELINE_BATCH_MIN_SLEEP_SEC = float(os.getenv("PIPELINE_BATCH_MIN_SLEEP_SEC", "0.02"))
PIPELINE_BATCH_MAX_SLEEP_SEC = float(os.getenv("PIPELINE_BATCH_MAX_SLEEP_SEC", "0.4"))

# api/worker.py
@dramatiq.actor(max_retries=3, time_limit=30000)
@dramatiq.actor(max_retries=3, time_limit=30000)
def process_dodo_webhook(webhook_id: str):
    # Use the SessionLocal context manager to ensure safe connection pooling
    with SessionLocal() as db:
        try:
            # 1. Use text() and named parameters (:webhook_id)
            # 2. Use .mappings().fetchone() to allow dict-like access
            event = db.execute(text("""
                SELECT payload, tenant_id FROM dodo_webhook_events 
                WHERE webhook_id = :webhook_id AND status = 'pending'
                FOR UPDATE SKIP LOCKED;
            """), {"webhook_id": webhook_id}).mappings().fetchone()
            
            if not event:
                return

            tenant_id = event["tenant_id"]
            payload = event["payload"]
            event_type = payload.get("type")
            data = payload.get("data", {})

            # 1. New Subscription or Successful Renewal
            if event_type in ["subscription.active", "subscription.renewed"]:
                db.execute(text("""
                    UPDATE tenants 
                    SET billing_status = 'active', 
                        dodo_customer_id = :customer_id,
                        dodo_subscription_id = :subscription_id,
                        current_period_end = :current_period_end
                    WHERE id = :tenant_id
                """), {
                    "customer_id": data.get("customer_id"), 
                    "subscription_id": data.get("subscription_id"),
                    "current_period_end": data.get("current_period_end"), 
                    "tenant_id": tenant_id
                })

            # 2. Payment Failure (Grace Period Logic)
            elif event_type == "subscription.payment_failed":
                db.execute(text("""
                    UPDATE tenants 
                    SET billing_status = 'past_due'
                    WHERE id = :tenant_id
                """), {"tenant_id": tenant_id})

            # 3. Cancellation (Downgrade to Free/Locked)
            elif event_type == "subscription.canceled":
                db.execute(text("""
                    UPDATE tenants 
                    SET billing_status = 'canceled',
                        dodo_subscription_id = NULL
                    WHERE id = :tenant_id
                """), {"tenant_id": tenant_id})

            # Mark as completed
            db.execute(
                text("UPDATE dodo_webhook_events SET status = 'completed' WHERE webhook_id = :webhook_id"), 
                {"webhook_id": webhook_id}
            )
            db.commit()

        except Exception as e:
            db.rollback()
            # Safety catch: record the failure in the DB
            db.execute(
                text("UPDATE dodo_webhook_events SET status = 'failed' WHERE webhook_id = :webhook_id"), 
                {"webhook_id": webhook_id}
            )
            db.commit()
            raise e
# ---------------------------------------------------------
# PIPELINE ORCHESTRATOR
# ---------------------------------------------------------

class PipelineOrchestrator:
    """
    Arcli Daily Churn Recovery Pipeline (Deterministic Engine)

    Responsibilities:
    - Iterate active tenants efficiently
    - Calculate deterministic churn risk
    - Trigger idempotent recovery workflows
    - Maintain strict run traceability
    """

    def __init__(self, db_client, email_queue: Optional[Any] = None) -> None:
        self.db = db_client
        self.email_queue = email_queue
        self.user_profile_cursor_field = _normalize_cursor_field(USER_PROFILE_CURSOR_FIELD)

        if not _is_safe_column_name(self.user_profile_cursor_field):
            logger.warning(
                "user_profile_cursor_invalid field=%s fallback=id",
                self.user_profile_cursor_field,
            )
            self.user_profile_cursor_field = "id"
        elif self.user_profile_cursor_field not in ALLOWED_CURSOR_FIELDS:
            logger.warning(
                "user_profile_cursor_not_allowed field=%s fallback=id",
                self.user_profile_cursor_field,
            )
            self.user_profile_cursor_field = "id"
        elif self.user_profile_cursor_field != "id":
            logger.info(
                "user_profile_cursor_non_id field=%s",
                self.user_profile_cursor_field,
            )

        # Core Engines
        self.churn_scoring = ChurnScoringService(db_client)
        self.recovery_engine = RecoveryAutomationEngine(
            db_client=db_client,
            email_queue=email_queue,
        )

    # ---------------------------------------------------------
    # MAIN DAILY PIPELINE
    # ---------------------------------------------------------

    def run_daily_pipeline(self, target_date_str: Optional[str] = None) -> None:
        """
        Main nightly churn recovery pipeline.
        Enforces a strict run_id for full operational traceability.
        """
        run_id = str(uuid.uuid4())
        target_date = (
            target_date_str
            or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        )

        logger.info(
            "daily_risk_scan_started target_date=%s run_id=%s",
            target_date,
            run_id,
        )

        start_time = time.monotonic()

        try:
            tenants = self._fetch_active_tenants()

            if not tenants:
                logger.warning("no_active_tenants_found run_id=%s", run_id)
                return

            logger.info(
                "active_tenants_found count=%d run_id=%s",
                len(tenants),
                run_id,
            )

            processed = 0
            failed = 0

            for tenant_id in tenants:
                success = self._process_tenant_safe(
                    tenant_id=tenant_id,
                    target_date=target_date,
                    run_id=run_id,
                )

                if success:
                    processed += 1
                else:
                    failed += 1

            duration = round(time.monotonic() - start_time, 2)

            logger.info(
                "daily_risk_scan_completed run_id=%s duration=%ss "
                "processed_tenants=%d failed_tenants=%d",
                run_id,
                duration,
                processed,
                failed,
            )

        except Exception:
            logger.exception("daily_pipeline_failed run_id=%s", run_id)
            raise

    # ---------------------------------------------------------
    # FETCH ACTIVE TENANTS
    # ---------------------------------------------------------

    def _fetch_active_tenants(self) -> List[str]:
        resp = (
            self.db
            .table("tenants")
            .select("tenant_id")
            .eq("status", "ACTIVE")
            .execute()
        )

        tenant_ids = [
            row["tenant_id"]
            for row in (resp.data or [])
            if row.get("tenant_id")
        ]

        tenant_ids.sort()
        return tenant_ids

    # ---------------------------------------------------------
    # SAFE TENANT PROCESSING
    # ---------------------------------------------------------

    def _process_tenant_safe(
        self,
        tenant_id: str,
        target_date: str,
        run_id: str,
    ) -> bool:
        """
        Isolated tenant processing. Prevents one bad tenant payload
        from crashing the multi-tenant pipeline.
        """
        start = time.monotonic()

        try:
            self._process_tenant(
                tenant_id=tenant_id,
                target_date=target_date,
                run_id=run_id,
            )
            return True

        except Exception:
            logger.exception(
                "tenant_processing_failed tenant=%s run_id=%s",
                tenant_id,
                run_id,
            )
            return False

        finally:
            duration = round(time.monotonic() - start, 2)

            if duration > MAX_TENANT_RUNTIME_SEC:
                logger.warning(
                    "slow_tenant_detected tenant=%s duration=%ss run_id=%s",
                    tenant_id,
                    duration,
                    run_id,
                )

    # ---------------------------------------------------------
    # CORE TENANT PIPELINE
    # ---------------------------------------------------------

    def _process_tenant(
        self,
        tenant_id: str,
        target_date: str,
        run_id: str,
    ) -> None:
        """
        Core tenant churn recovery workflow.
        """
        logger.info(
            "tenant_scan_started tenant=%s run_id=%s",
            tenant_id,
            run_id,
        )

        tenant_start = time.monotonic()
        tenant_deadline = tenant_start + max(1, MAX_TENANT_RUNTIME_SEC)
        timed_out = False

        total_users_scanned = 0
        total_at_risk_users = 0
        total_emails_queued = 0

        score_duration_total = 0.0
        recovery_duration_total = 0.0

        # ---------------------------------------------------------
        # PROCESS USERS IN BATCHES (OOM Prevention)
        # ---------------------------------------------------------

        for users_batch in self._yield_users_in_batches(tenant_id=tenant_id):

            if time.monotonic() >= tenant_deadline:
                timed_out = True
                logger.warning(
                    "tenant_runtime_exceeded tenant=%s run_id=%s max_runtime=%ss",
                    tenant_id,
                    run_id,
                    MAX_TENANT_RUNTIME_SEC,
                )
                break

            batch_start = time.monotonic()

            batch_size = len(users_batch)
            if batch_size == 0:
                continue

            total_users_scanned += batch_size

            # ---------------------------------------------------------
            # STEP 1 — CHURN SCORING
            # ---------------------------------------------------------
            score_start = time.monotonic()

            at_risk_users = self.churn_scoring.calculate_batch_risk_scores(
                tenant_id=tenant_id,
                users=users_batch,
                target_date=target_date,
            )

            score_duration_total += (time.monotonic() - score_start)
            total_at_risk_users += len(at_risk_users)

            # ---------------------------------------------------------
            # STEP 2 — RECOVERY AUTOMATION (Idempotent execution expected)
            # ---------------------------------------------------------
            recovery_start = time.monotonic()

            recovery_results = self.recovery_engine.evaluate_and_queue_batch(
                tenant_id=tenant_id,
                users=at_risk_users,
                metadata={"pipeline_run_id": run_id},
            )

            for result in recovery_results:
                if not result:
                    continue

                status = getattr(result, "status", None)
                if status is None and isinstance(result, dict):
                    status = result.get("status")
                if hasattr(status, "value"):
                    status = status.value
                if status == ClaimOutcome.CLAIMED.value:
                    total_emails_queued += 1
                    continue

                if status == ClaimOutcome.RATE_LIMITED.value:
                    METRICS.increment("recovery.rate_limited", 1, {"tenant": tenant_id})
                elif status == ClaimOutcome.SUPPRESSED.value:
                    METRICS.increment("recovery.suppressed", 1, {"tenant": tenant_id})
                elif status == ClaimOutcome.COOLDOWN.value:
                    METRICS.increment("recovery.cooldown", 1, {"tenant": tenant_id})
                elif status == ClaimOutcome.DUPLICATE.value:
                    METRICS.increment("recovery.duplicate", 1, {"tenant": tenant_id})
                elif status == ClaimOutcome.ERROR.value:
                    METRICS.increment("recovery.error", 1, {"tenant": tenant_id})

            recovery_duration_total += (time.monotonic() - recovery_start)

            batch_duration = time.monotonic() - batch_start
            _apply_pipeline_backpressure(
                batch_duration=batch_duration,
                batch_size=batch_size,
                tenant_id=tenant_id,
                run_id=run_id,
            )

            if time.monotonic() >= tenant_deadline:
                timed_out = True
                logger.warning(
                    "tenant_runtime_exceeded tenant=%s run_id=%s max_runtime=%ss",
                    tenant_id,
                    run_id,
                    MAX_TENANT_RUNTIME_SEC,
                )
                break

        # ---------------------------------------------------------
        # FINAL TENANT METRICS
        # ---------------------------------------------------------
        total_duration = round(time.monotonic() - tenant_start, 2)

        logger.info(
            "tenant_scan_completed tenant=%s run_id=%s duration=%ss "
            "users_scanned=%d at_risk_users=%d emails_queued=%d "
            "score_duration=%ss recovery_duration=%ss timed_out=%s",
            tenant_id,
            run_id,
            total_duration,
            total_users_scanned,
            total_at_risk_users,
            total_emails_queued,
            round(score_duration_total, 2),
            round(recovery_duration_total, 2),
            timed_out,
        )

    # ---------------------------------------------------------
    # USER BATCH STREAMING
    # ---------------------------------------------------------

    def _yield_users_in_batches(
        self,
        tenant_id: str,
    ) -> Generator[List[Dict[str, Any]], None, None]:
        """
        Streams users in batches using a deterministic keyset cursor.
        The cursor field must be immutable and indexed; non-unique cursor fields
        are stabilized with a secondary `id` ordering to prevent pagination drift.
        """
        cursor_field = self.user_profile_cursor_field
        use_tiebreaker = cursor_field != "id"
        cursor_value = None
        cursor_id = None

        if USER_BATCH_SIZE <= 0:
            logger.warning("user_batch_size_invalid size=%d fallback=1", USER_BATCH_SIZE)

        batch_limit = USER_BATCH_SIZE if USER_BATCH_SIZE > 0 else 1

        while True:
            query = (
                self.db
                .table("user_profiles")
                .select("id, email, last_seen_at, tenant_id")
                .eq("tenant_id", tenant_id)
                .order(cursor_field, desc=False)
            )

            if use_tiebreaker:
                query = query.order("id", desc=False)

            query = query.limit(batch_limit)

            if cursor_value is not None:
                if use_tiebreaker:
                    if cursor_id is None:
                        logger.warning(
                            "user_profile_cursor_missing_tiebreaker tenant=%s field=%s",
                            tenant_id,
                            cursor_field,
                        )
                        break

                    cursor_value_filter = _format_postgrest_value(cursor_value)
                    cursor_id_filter = _format_postgrest_value(cursor_id)
                    query = query.or_(
                        f"{cursor_field}.gt.{cursor_value_filter},"
                        f"and({cursor_field}.eq.{cursor_value_filter},id.gt.{cursor_id_filter})"
                    )
                else:
                    query = query.gt(cursor_field, cursor_value)

            resp = query.execute()
            users = resp.data or []

            if not users:
                break

            yield users

            last_value = users[-1].get(cursor_field)
            last_id = users[-1].get("id")

            if last_value is None or (use_tiebreaker and last_id is None):
                logger.warning(
                    "user_profile_cursor_missing tenant=%s field=%s",
                    tenant_id,
                    cursor_field,
                )
                break

            if cursor_value is not None and last_value == cursor_value and last_id == cursor_id:
                logger.warning(
                    "user_profile_cursor_stalled tenant=%s field=%s value=%s id=%s",
                    tenant_id,
                    cursor_field,
                    cursor_value,
                    cursor_id,
                )
                break

            cursor_value = last_value
            cursor_id = last_id


# ============================================================================
# PHASE 3: DURABLE OUTBOX DISPATCHER
# ============================================================================

class OutboxDispatcher:
    """
    Arcli Outbox Poller (The Bridge)

    Responsibilities:
    - Sweep the `recovery_emails` outbox for new intents generated by Next.js or the Daily Pipeline.
    - Claim rows via the SQL RPC (SKIP LOCKED + leases) for safe multi-worker concurrency.
    - Push the safely claimed rows into Dramatiq for async delivery.
    """

    def __init__(self, db_client) -> None:
        self.db = db_client

    def poll_and_dispatch(self, batch_size: int = 100) -> None:
        """
        Polls the outbox. Should be run frequently (e.g., every 10-30 seconds via cron/loop).
        """
        logger.info("outbox_dispatcher_started batch_size=%d", batch_size)
        start_time = time.monotonic()

        rows = _claim_outbox_batch(self.db, batch_size)
        if not rows:
            return

        from api.tasks import send_recovery_email

        dispatched_count = 0

        for row in rows:
            send_id = row.id
            tenant_id = row.tenant_id
            dispatch_token = row.dispatch_token
            dispatch_attempt = row.dispatch_attempt

            try:
                send_recovery_email.send(
                    tenant_id=tenant_id,
                    send_id=send_id,
                    dispatch_token=dispatch_token,
                    dispatch_attempt=dispatch_attempt,
                )

                self.db.table(RECOVERY_EMAIL_TABLE).update({
                    "status": RecoveryStatus.DISPATCHED_TO_QUEUE.value,
                    "dispatched_at": datetime.now(timezone.utc).isoformat(),
                    "dispatch_token": dispatch_token,
                    "dispatch_attempt": dispatch_attempt,
                    "last_error": None,
                }).eq("id", send_id).execute()

                dispatched_count += 1

            except Exception as exc:
                logger.error(
                    "outbox_dispatcher_dispatch_failed tenant=%s send_id=%s attempt=%d",
                    tenant_id,
                    send_id,
                    dispatch_attempt,
                )
                _handle_dispatch_failure(self.db, send_id, dispatch_attempt, str(exc))

        duration = round(time.monotonic() - start_time, 2)
        METRICS.increment("recovery.outbox.dispatched", dispatched_count)
        METRICS.timing("recovery.outbox.duration", duration)

        logger.info(
            "outbox_dispatcher_completed dispatched=%d duration=%ss",
            dispatched_count,
            duration,
        )

        apply_outbox_backpressure(dispatched_count, batch_size)


def _claim_outbox_batch(db_client, limit: int) -> List[OutboxClaimRow]:
    return claim_outbox_batch(
        db_client,
        limit,
        logger_obj=logger,
        log_label="outbox_claim_failed",
        invalid_log_label="outbox_claim_invalid_response",
        on_error=lambda: METRICS.increment("recovery.outbox.claim_failed", 1),
        on_invalid=lambda: METRICS.increment("recovery.outbox.claim_invalid", 1),
    )


def _handle_dispatch_failure(db_client, send_id: str, attempt: int, error_msg: str) -> None:
    next_retry = (datetime.now(timezone.utc) + timedelta(seconds=dispatch_backoff_seconds(attempt))).isoformat()
    try:
        db_client.table(RECOVERY_EMAIL_TABLE).update({
            "status": RecoveryStatus.DISPATCH_FAILED.value,
            "failure_stage": FailureStage.DISPATCH.value,
            "dispatch_attempt": attempt,
            "next_retry_at": next_retry,
            "last_error": str(error_msg)[:500],
        }).eq("id", send_id).execute()
    except Exception:
        logger.exception("outbox_dispatcher_dlq_update_failed send_id=%s", send_id)


def _tenant_status_rank(status: Optional[str]) -> int:
    if not status:
        return 0
    return _TENANT_STATUS_RANKS.get(status.strip().upper(), 0)


def _normalize_cursor_field(raw_field: str) -> str:
    field = (raw_field or "").strip()
    return field if field else "id"


def _is_safe_column_name(name: str) -> bool:
    if not name:
        return False
    return name.replace("_", "").isalnum()


def _format_postgrest_value(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    safe = str(value).replace('"', '\\"')
    return f"\"{safe}\""


def _apply_pipeline_backpressure(
    batch_duration: float,
    batch_size: int,
    tenant_id: str,
    run_id: str,
) -> None:
    if PIPELINE_BATCH_TARGET_DURATION_SEC <= 0:
        return
    if batch_duration >= PIPELINE_BATCH_TARGET_DURATION_SEC:
        return

    fullness = min(1.0, batch_size / max(1, USER_BATCH_SIZE))
    sleep_for = (PIPELINE_BATCH_TARGET_DURATION_SEC - batch_duration) * fullness
    sleep_for = min(PIPELINE_BATCH_MAX_SLEEP_SEC, max(PIPELINE_BATCH_MIN_SLEEP_SEC, sleep_for))

    if sleep_for <= 0:
        return

    logger.debug(
        "pipeline_backpressure_sleep tenant=%s run_id=%s sleep=%ss batch_duration=%ss batch_size=%d",
        tenant_id,
        run_id,
        round(sleep_for, 3),
        round(batch_duration, 3),
        batch_size,
    )
    time.sleep(sleep_for)


