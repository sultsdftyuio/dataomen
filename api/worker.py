import hashlib
import logging
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Generator, List, Dict, Any

from api.services.churn_scoring_service import ChurnScoringService
from api.services.recovery_engine import RecoveryAutomationEngine
from api.tasks import send_recovery_email  # Added for Outbox Dispatching

logger = logging.getLogger("arcli_worker")

# ---------------------------------------------------------
# PIPELINE CONFIG
# ---------------------------------------------------------

MAX_TENANT_RUNTIME_SEC = 60
USER_BATCH_SIZE = 500
USER_PROFILE_CURSOR_FIELD = os.getenv("USER_PROFILE_CURSOR_FIELD", "id")

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

    def __init__(self, db_client, email_queue=None):
        self.db = db_client
        self.email_queue = email_queue

        # Core Engines
        self.churn_scoring = ChurnScoringService(db_client)
        self.recovery_engine = RecoveryAutomationEngine(
            db_client=db_client,
            email_queue=email_queue
        )

    # ---------------------------------------------------------
    # MAIN DAILY PIPELINE
    # ---------------------------------------------------------

    def run_daily_pipeline(self, target_date_str: str = None):
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
            target_date, run_id
        )

        start_time = time.time()

        try:
            tenants = self._fetch_active_tenants()

            if not tenants:
                logger.warning("no_active_tenants_found run_id=%s", run_id)
                return

            logger.info(
                "active_tenants_found count=%d run_id=%s", 
                len(tenants), run_id
            )

            processed = 0
            failed = 0

            for tenant_id in tenants:
                success = self._process_tenant_safe(
                    tenant_id=tenant_id,
                    target_date=target_date,
                    run_id=run_id
                )

                if success:
                    processed += 1
                else:
                    failed += 1

            duration = round(time.time() - start_time, 2)

            logger.info(
                "daily_risk_scan_completed run_id=%s duration=%ss "
                "processed_tenants=%d failed_tenants=%d",
                run_id, duration, processed, failed
            )

        except Exception:
            logger.exception("daily_pipeline_failed run_id=%s", run_id)
            raise

    # ---------------------------------------------------------
    # FETCH ACTIVE TENANTS
    # ---------------------------------------------------------

    def _fetch_active_tenants(self) -> List[str]:
        """
        ARCLI v2.0 DIRECTIVE: Relational Efficiency.
        Never scan the massive user_profiles table for unique tenants.
        Query the much smaller tenant_users mapping table instead.
        """
        resp = (
            self.db
            .table("tenant_users")
            .select("tenant_id")
            .execute()
        )

        tenant_ids = {
            row["tenant_id"]
            for row in (resp.data or [])
            if row.get("tenant_id")
        }

        return list(tenant_ids)

    # ---------------------------------------------------------
    # SAFE TENANT PROCESSING
    # ---------------------------------------------------------

    def _process_tenant_safe(
        self,
        tenant_id: str,
        target_date: str,
        run_id: str
    ) -> bool:
        """
        Isolated tenant processing. Prevents one bad tenant payload 
        from crashing the multi-tenant pipeline.
        """
        start = time.time()

        try:
            self._process_tenant(
                tenant_id=tenant_id,
                target_date=target_date,
                run_id=run_id
            )
            return True

        except Exception:
            logger.exception(
                "tenant_processing_failed tenant=%s run_id=%s", 
                tenant_id, run_id
            )
            return False

        finally:
            duration = round(time.time() - start, 2)

            if duration > MAX_TENANT_RUNTIME_SEC:
                logger.warning(
                    "slow_tenant_detected tenant=%s duration=%ss run_id=%s",
                    tenant_id, duration, run_id
                )

    # ---------------------------------------------------------
    # CORE TENANT PIPELINE
    # ---------------------------------------------------------

    def _process_tenant(
        self,
        tenant_id: str,
        target_date: str,
        run_id: str
    ):
        """
        Core tenant churn recovery workflow.
        """
        logger.info(
            "tenant_scan_started tenant=%s run_id=%s", 
            tenant_id, run_id
        )

        tenant_start = time.time()

        total_users_scanned = 0
        total_at_risk_users = 0
        total_emails_queued = 0

        score_duration_total = 0
        recovery_duration_total = 0

        # ---------------------------------------------------------
        # PROCESS USERS IN BATCHES (OOM Prevention)
        # ---------------------------------------------------------

        for users_batch in self._yield_users_in_batches(tenant_id=tenant_id):

            batch_size = len(users_batch)
            if batch_size == 0:
                continue

            total_users_scanned += batch_size

            # ---------------------------------------------------------
            # STEP 1 — CHURN SCORING
            # ---------------------------------------------------------
            score_start = time.time()

            at_risk_users = self.churn_scoring.calculate_batch_risk_scores(
                tenant_id=tenant_id,
                users=users_batch,
                target_date=target_date
            )

            score_duration_total += (time.time() - score_start)
            total_at_risk_users += len(at_risk_users)

            # ---------------------------------------------------------
            # STEP 2 — RECOVERY AUTOMATION (Idempotent execution expected)
            # ---------------------------------------------------------
            recovery_start = time.time()

            for user in at_risk_users:
                # Passing run_id down to the engine ensures we can attribute
                # the exact pipeline execution to the resulting email/revenue
                result = self.recovery_engine.evaluate_and_queue_campaign(
                    tenant_id=tenant_id,
                    user=user,
                    metadata={"pipeline_run_id": run_id}
                )

                if result and result.get("status") == "queued":
                    total_emails_queued += 1

            recovery_duration_total += (time.time() - recovery_start)

        # ---------------------------------------------------------
        # FINAL TENANT METRICS
        # ---------------------------------------------------------
        total_duration = round(time.time() - tenant_start, 2)

        logger.info(
            "tenant_scan_completed tenant=%s run_id=%s duration=%ss "
            "users_scanned=%d at_risk_users=%d emails_queued=%d "
            "score_duration=%ss recovery_duration=%ss",
            tenant_id, run_id, total_duration, total_users_scanned, 
            total_at_risk_users, total_emails_queued, 
            round(score_duration_total, 2), round(recovery_duration_total, 2)
        )

    # ---------------------------------------------------------
    # USER BATCH STREAMING
    # ---------------------------------------------------------

    def _yield_users_in_batches(
        self,
        tenant_id: str
    ) -> Generator[List[Dict[str, Any]], None, None]:
        """
        Streams users in batches using a deterministic keyset cursor.
        """
        cursor_value = None

        while True:
            query = (
                self.db
                .table("user_profiles")
                .select("*")
                .eq("tenant_id", tenant_id)
                .order(USER_PROFILE_CURSOR_FIELD, desc=False)
                .limit(USER_BATCH_SIZE)
            )

            if cursor_value is not None:
                query = query.gt(USER_PROFILE_CURSOR_FIELD, cursor_value)

            resp = query.execute()
            users = resp.data or []

            if not users:
                break

            yield users

            last_value = users[-1].get(USER_PROFILE_CURSOR_FIELD)
            if not last_value:
                logger.warning(
                    "user_profile_cursor_missing tenant=%s field=%s",
                    tenant_id, USER_PROFILE_CURSOR_FIELD
                )
                break

            if last_value == cursor_value:
                logger.warning(
                    "user_profile_cursor_stalled tenant=%s field=%s value=%s",
                    tenant_id, USER_PROFILE_CURSOR_FIELD, cursor_value
                )
                break

            cursor_value = last_value


# ============================================================================
# PHASE 3: DURABLE OUTBOX DISPATCHER
# ============================================================================

class OutboxDispatcher:
    """
    Arcli Outbox Poller (The Bridge)
    
    Responsibilities:
    - Sweep the `recovery_emails` table for new intents generated by Next.js or the Daily Pipeline.
    - Optimistically lock the rows to prevent duplicate queueing across multiple workers.
    - Push the safely claimed rows into Dramatiq for async delivery.
    """

    def __init__(self, db_client):
        self.db = db_client

    def poll_and_dispatch(self, batch_size: int = 100):
        """
        Polls the outbox. Should be run frequently (e.g., every 10-30 seconds via cron/loop).
        """
        logger.info("outbox_dispatcher_started batch_size=%d", batch_size)
        start_time = time.time()
        lease_cutoff = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        lease_expiration = (
            datetime.now(timezone.utc) + timedelta(minutes=15)
        ).isoformat().replace("+00:00", "Z")

        try:
            # 1. Fetch unassigned queued jobs
            resp = (
                self.db.table("recovery_emails")
                .select("id, tenant_id, user_id, campaign_type, email, message_key")
                .or_(
                    f"status.eq.queued,and(status.eq.processing,lease_expires_at.lt.{lease_cutoff})"
                )
                .order("queued_at", desc=False)
                .limit(batch_size)
                .execute()
            )

            jobs = resp.data or []
            if not jobs:
                return

            dispatched_count = 0

            for job in jobs:
                send_id = job["id"]
                tenant_id = job["tenant_id"]
                user_id = job.get("user_id")
                campaign_type = job.get("campaign_type")
                email = job.get("email")

                message_key = job.get("message_key")
                if not message_key:
                    message_key = _build_message_key(
                        tenant_id,
                        user_id,
                        campaign_type,
                        email,
                    )

                if not message_key:
                    logger.warning(
                        "outbox_dispatcher_missing_message_key tenant=%s send_id=%s",
                        tenant_id,
                        send_id,
                    )
                    continue

                # 2. Atomic Claim (Optimistic Locking)
                # We transition from 'queued' to 'processing'.
                # The explicit .eq("status", "queued") ensures that if another worker
                # picked this row a millisecond ago, our update returns 0 rows.
                claim_resp = (
                    self.db.table("recovery_emails")
                    .update(
                        {
                            "status": "processing",
                            "message_key": message_key,
                            "lease_expires_at": lease_expiration,
                        }
                    )
                    .eq("id", send_id)
                    .or_(
                        f"status.eq.queued,and(status.eq.processing,lease_expires_at.lt.{lease_cutoff})"
                    )
                    .execute()
                )

                # 3. Handoff to Queue
                # Only dispatch if the claim actually modified the row
                if claim_resp.data:
                    send_recovery_email.send(tenant_id=tenant_id, send_id=send_id)
                    dispatched_count += 1

            duration = round(time.time() - start_time, 2)
            logger.info(
                "outbox_dispatcher_completed dispatched=%d duration=%ss", 
                dispatched_count, duration
            )

        except Exception:
            logger.exception("outbox_dispatcher_failed")


def _build_message_key(
    tenant_id: str,
    user_id: str,
    campaign_type: str,
    email: str,
) -> str:
    if not tenant_id or not user_id or not campaign_type or not email:
        return ""

    normalized_email = str(email).strip().lower()
    raw = f"{tenant_id}:{user_id}:{campaign_type}:{normalized_email}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()