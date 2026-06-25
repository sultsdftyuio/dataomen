"""
Arcli Worker — Daily Churn Recovery Pipeline

Contains: PipelineOrchestrator with tenant scanning,
batch user streaming, churn scoring, and recovery automation.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Generator, List, Optional

from api.recovery_common import ClaimOutcome
from api.services.churn_scoring_service import ChurnScoringService
from api.services.recovery_engine import RecoveryAutomationEngine

from api.worker.worker_core import (
    logger,
    MAX_TENANT_RUNTIME_SEC,
    USER_BATCH_SIZE,
    USER_PROFILE_CURSOR_FIELD,
    ALLOWED_CURSOR_FIELDS,
    METRICS,
    _apply_pipeline_backpressure,
    _normalize_cursor_field,
    _is_safe_column_name,
    _format_postgrest_value,
)


# ---------------------------------------------------------------------------
# PIPELINE ORCHESTRATOR
# ---------------------------------------------------------------------------
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
        self.user_profile_cursor_field = _normalize_cursor_field(
            USER_PROFILE_CURSOR_FIELD
        )

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

    # ------------------------------------------------------------------
    # MAIN DAILY PIPELINE
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # FETCH ACTIVE TENANTS
    # ------------------------------------------------------------------
    def _fetch_active_tenants(self) -> List[str]:
        resp = (
            self.db.table("tenants")
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

    # ------------------------------------------------------------------
    # SAFE TENANT PROCESSING
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # CORE TENANT PIPELINE
    # ------------------------------------------------------------------
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

        # ---------------------------------------------------------------
        # PROCESS USERS IN BATCHES (OOM Prevention)
        # ---------------------------------------------------------------
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

            # -----------------------------------------------------------
            # STEP 1 — CHURN SCORING
            # -----------------------------------------------------------
            score_start = time.monotonic()

            at_risk_users = self.churn_scoring.calculate_batch_risk_scores(
                tenant_id=tenant_id,
                users=users_batch,
                target_date=target_date,
            )

            score_duration_total += time.monotonic() - score_start
            total_at_risk_users += len(at_risk_users)

            # -----------------------------------------------------------
            # STEP 2 — RECOVERY AUTOMATION
            # -----------------------------------------------------------
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

            recovery_duration_total += time.monotonic() - recovery_start

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

        # ---------------------------------------------------------------
        # FINAL TENANT METRICS
        # ---------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # USER BATCH STREAMING
    # ------------------------------------------------------------------
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
            logger.warning(
                "user_batch_size_invalid size=%d fallback=1", USER_BATCH_SIZE
            )

        batch_limit = USER_BATCH_SIZE if USER_BATCH_SIZE > 0 else 1

        while True:
            query = (
                self.db.table("user_profiles")
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

            if (
                cursor_value is not None
                and last_value == cursor_value
                and last_id == cursor_id
            ):
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