import logging
import os
import time
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
    Arcli Daily Churn Recovery Pipeline

    Responsibilities:
    - Iterate active tenants
    - Calculate churn risk
    - Trigger recovery workflows
    - Queue recovery emails
    - Track operational performance

    IMPORTANT:
    This orchestrator should remain THIN.
    Business logic belongs inside:
    - ChurnScoringService
    - RecoveryAutomationEngine
    """

    def __init__(self, db_client, email_queue=None):
        self.db = db_client
        self.email_queue = email_queue

        # Core MVP Engines
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

        Flow:
        1. Fetch active tenants
        2. Process each tenant independently
        3. Score churn risk
        4. Queue recovery campaigns
        """

        target_date = (
            target_date_str
            or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        )

        logger.info(
            f"daily_risk_scan_started target_date={target_date}"
        )

        start_time = time.time()

        try:
            tenants = self._fetch_active_tenants()

            if not tenants:
                logger.warning("no_active_tenants_found")
                return

            logger.info(
                f"active_tenants_found count={len(tenants)}"
            )

            processed = 0
            failed = 0

            for tenant_id in tenants:
                success = self._process_tenant_safe(
                    tenant_id=tenant_id,
                    target_date=target_date
                )

                if success:
                    processed += 1
                else:
                    failed += 1

            duration = round(time.time() - start_time, 2)

            logger.info(
                "daily_risk_scan_completed "
                f"duration={duration}s "
                f"processed_tenants={processed} "
                f"failed_tenants={failed}"
            )

        except Exception:
            logger.exception("daily_pipeline_failed")
            raise

    # ---------------------------------------------------------
    # FETCH ACTIVE TENANTS
    # ---------------------------------------------------------

    def _fetch_active_tenants(self) -> List[str]:
        """
        MVP Strategy:
        Fetch unique tenant IDs from user_profiles.

        Future:
        Move to dedicated tenants table:
        - id
        - status
        - stripe_connected
        - subscription_status
        """

        resp = (
            self.db
            .table("user_profiles")
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
        target_date: str
    ) -> bool:
        """
        Isolated tenant processing.

        Prevents one bad tenant from crashing
        the entire nightly pipeline.
        """

        start = time.time()

        try:
            self._process_tenant(
                tenant_id=tenant_id,
                target_date=target_date
            )
            return True

        except Exception:
            logger.exception(
                f"tenant_processing_failed tenant={tenant_id}"
            )
            return False

        finally:
            duration = round(time.time() - start, 2)

            if duration > MAX_TENANT_RUNTIME_SEC:
                logger.warning(
                    "slow_tenant_detected "
                    f"tenant={tenant_id} "
                    f"duration={duration}s"
                )

    # ---------------------------------------------------------
    # CORE TENANT PIPELINE
    # ---------------------------------------------------------

    def _process_tenant(
        self,
        tenant_id: str,
        target_date: str
    ):
        """
        Core tenant churn recovery workflow.

        Steps:
        1. Load users in batches
        2. Calculate churn risk
        3. Queue recovery campaigns
        4. Track pipeline metrics
        """

        logger.info(
            f"tenant_scan_started tenant={tenant_id}"
        )

        tenant_start = time.time()

        total_users_scanned = 0
        total_at_risk_users = 0
        total_emails_queued = 0

        score_duration_total = 0
        recovery_duration_total = 0

        # ---------------------------------------------------------
        # PROCESS USERS IN BATCHES
        # ---------------------------------------------------------

        for users_batch in self._yield_users_in_batches(
            tenant_id=tenant_id
        ):

            batch_size = len(users_batch)

            if batch_size == 0:
                continue

            total_users_scanned += batch_size

            # ---------------------------------------------------------
            # STEP 1 — CHURN SCORING
            # ---------------------------------------------------------

            score_start = time.time()

            at_risk_users = (
                self.churn_scoring.calculate_batch_risk_scores(
                    tenant_id=tenant_id,
                    users=users_batch,
                    target_date=target_date
                )
            )

            score_duration_total += (
                time.time() - score_start
            )

            total_at_risk_users += len(at_risk_users)

            # ---------------------------------------------------------
            # STEP 2 — RECOVERY AUTOMATION
            # ---------------------------------------------------------

            recovery_start = time.time()

            for user in at_risk_users:

                result = (
                    self.recovery_engine
                    .evaluate_and_queue_campaign(
                        tenant_id=tenant_id,
                        user=user
                    )
                )

                if (
                    result
                    and result.get("status") == "queued"
                ):
                    total_emails_queued += 1

            recovery_duration_total += (
                time.time() - recovery_start
            )

        # ---------------------------------------------------------
        # FINAL TENANT METRICS
        # ---------------------------------------------------------

        total_duration = round(
            time.time() - tenant_start,
            2
        )

        logger.info(
            "tenant_scan_completed "
            f"tenant={tenant_id} "
            f"duration={total_duration}s "
            f"users_scanned={total_users_scanned} "
            f"at_risk_users={total_at_risk_users} "
            f"emails_queued={total_emails_queued} "
            f"score_duration={round(score_duration_total, 2)}s "
            f"recovery_duration={round(recovery_duration_total, 2)}s"
        )

    # ---------------------------------------------------------
    # USER BATCH STREAMING
    # ---------------------------------------------------------

    def _yield_users_in_batches(
        self,
        tenant_id: str
    ) -> Generator[List[Dict[str, Any]], None, None]:
        """
        Streams users in batches.

        Prevents:
        - giant memory spikes
        - loading all users into RAM
        - slow large-tenant processing

        Future Improvements:
        - cursor pagination
        - async streaming
        - incremental syncs
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
                    tenant_id,
                    USER_PROFILE_CURSOR_FIELD,
                )
                break

            if last_value == cursor_value:
                logger.warning(
                    "user_profile_cursor_stalled tenant=%s field=%s value=%s",
                    tenant_id,
                    USER_PROFILE_CURSOR_FIELD,
                    cursor_value,
                )
                break

            cursor_value = last_value