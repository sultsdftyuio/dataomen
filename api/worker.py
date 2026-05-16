import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Generator, List, Dict, Any

from api.services.churn_scoring_service import ChurnScoringService
from api.services.recovery_engine import RecoveryAutomationEngine

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