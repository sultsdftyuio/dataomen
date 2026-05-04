import logging
import time
from datetime import datetime, timezone
from typing import List

from api.services.metrics_service import MetricsService
from api.services.anomaly_detector import AnomalyDetector
from api.services.alert_engine import AlertEngine

logger = logging.getLogger("arcli_worker")


MAX_TENANT_RUNTIME_SEC = 30


class PipelineOrchestrator:
    def __init__(self, db_client):
        self.db = db_client
        self.metrics_service = MetricsService(db_client)
        self.anomaly_detector = AnomalyDetector(db_client)
        self.alert_engine = AlertEngine(db_client)

    # ---------------------------------------------------------
    # MAIN PIPELINE
    # ---------------------------------------------------------
    def run_daily_pipeline(self, target_date_str: str = None):

        target_date = target_date_str or datetime.now(timezone.utc).strftime('%Y-%m-%d')

        logger.info(f"pipeline_started date={target_date}")
        start_time = time.time()

        try:
            tenants = self._fetch_active_tenants()

            if not tenants:
                logger.warning("no_active_tenants")
                return

            logger.info(f"tenants_found count={len(tenants)}")

            for tenant_id in tenants:
                self._process_tenant_safe(tenant_id, target_date)

            duration = round(time.time() - start_time, 2)

            logger.info(f"pipeline_completed duration={duration}s")

        except Exception:
            logger.error("pipeline_failed", exc_info=True)
            raise  # allow retry systems to kick in

    # ---------------------------------------------------------
    # TENANT FETCH
    # ---------------------------------------------------------
    def _fetch_active_tenants(self) -> List[str]:

        resp = self.db.table("metric_configs") \
            .select("tenant_id") \
            .eq("is_active", True) \
            .execute()

        return list({row["tenant_id"] for row in (resp.data or [])})

    # ---------------------------------------------------------
    # SAFE TENANT PROCESSING
    # ---------------------------------------------------------
    def _process_tenant_safe(self, tenant_id: str, target_date: str):

        start = time.time()

        try:
            self._process_tenant(tenant_id, target_date)

        except Exception:
            logger.error(f"tenant_failed tenant={tenant_id}", exc_info=True)

        finally:
            duration = round(time.time() - start, 2)

            if duration > MAX_TENANT_RUNTIME_SEC:
                logger.warning(f"slow_tenant tenant={tenant_id} duration={duration}s")

    # ---------------------------------------------------------
    # CORE TENANT PIPELINE
    # ---------------------------------------------------------
    def _process_tenant(self, tenant_id: str, target_date: str):

        logger.info(f"tenant_start id={tenant_id}")

        # ------------------------
        # STEP 1: AGGREGATION
        # ------------------------
        t0 = time.time()
        self.metrics_service.aggregate_daily_metrics(tenant_id, target_date)
        agg_time = round(time.time() - t0, 2)

        # ------------------------
        # STEP 2: DETECTION
        # ------------------------
        t1 = time.time()
        anomalies = self.anomaly_detector.analyze_metrics(tenant_id, target_date)
        detect_time = round(time.time() - t1, 2)

        # ------------------------
        # STEP 3: ALERTING
        # ------------------------
        t2 = time.time()
        alert_count = 0

        for anomaly in anomalies:
            result = self.alert_engine.process_anomaly(tenant_id, anomaly)
            if result and result.get("status") in ("created", "updated"):
                alert_count += 1

        alert_time = round(time.time() - t2, 2)

        # ------------------------
        # SUMMARY LOG
        # ------------------------
        logger.info(
            f"tenant_done id={tenant_id} "
            f"agg={agg_time}s detect={detect_time}s alert={alert_time}s "
            f"anomalies={len(anomalies)} alerts={alert_count}"
        )