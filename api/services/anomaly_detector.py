import logging
import statistics
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from collections import defaultdict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------
# GLOBAL DEFAULTS (FALLBACKS)
# ---------------------------------------------------------

DEFAULT_THRESHOLDS = {
    "revenue": 0.20,
    "signups": 0.30,
    "active_users": 0.25,
    "conversion_rate": 0.10,
    "logins": 0.20
}

MIN_REQUIRED_DAYS = 5
EPSILON = 1e-6


# ---------------------------------------------------------
# MAIN ENGINE
# ---------------------------------------------------------

class AnomalyDetector:
    def __init__(self, db_client):
        self.db = db_client
        self.default_min_volume = 10
        self.default_sensitivity = 2.0
        self.default_lookback = 14

    # ---------------------------------------------------------
    # ENTRY POINT
    # ---------------------------------------------------------
    def analyze_metrics(self, tenant_id: str, target_date: str) -> List[Dict[str, Any]]:

        current_metrics = self._fetch_current_metrics(tenant_id, target_date)
        if not current_metrics:
            logger.info("anomaly_skipped", extra={"tenant_id": tenant_id, "reason": "no_data"})
            return []

        configs = self._fetch_configs(tenant_id)
        max_lookback = max([c.get("lookback_days", self.default_lookback) for c in configs.values()] + [self.default_lookback])

        historical_data = self._fetch_historical_data(
            tenant_id,
            target_date,
            max_lookback
        )

        anomalies = []

        for metric_name, current_value in current_metrics.items():
            config = configs.get(metric_name, {})
            history = historical_data.get(metric_name, [])

            result = self._analyze_single_metric(
                metric_name,
                current_value,
                history,
                config
            )

            if result["is_anomaly"]:
                result.update({
                    "tenant_id": tenant_id,
                    "date": target_date
                })
                anomalies.append(result)

        logger.info("anomaly_detection_completed", extra={
            "tenant_id": tenant_id,
            "metrics_checked": len(current_metrics),
            "anomalies_found": len(anomalies)
        })

        return anomalies

    # ---------------------------------------------------------
    # CORE LOGIC (HYBRID ENGINE)
    # ---------------------------------------------------------
    def _analyze_single_metric(
        self,
        metric_name: str,
        current_value: float,
        history: List[float],
        config: Dict
    ) -> Dict[str, Any]:

        min_volume = config.get("min_volume", self.default_min_volume)
        sensitivity = config.get("sensitivity_multiplier", self.default_sensitivity)
        lookback = config.get("lookback_days", self.default_lookback)

        threshold_pct = config.get(
            "threshold_pct",
            DEFAULT_THRESHOLDS.get(metric_name, 0.20)
        )

        # ------------------------
        # PREP HISTORY
        # ------------------------
        history = history[-lookback:] if history else []

        if len(history) < MIN_REQUIRED_DAYS:
            return self._no_anomaly(metric_name, "insufficient_data")

        hist_max = max(history) if history else 0

        # ------------------------
        # VOLUME GUARD
        # ------------------------
        if current_value < min_volume and hist_max < min_volume:
            return self._no_anomaly(metric_name, "low_volume")

        # ------------------------
        # BASELINE (ROBUST)
        # ------------------------
        baseline = statistics.median(history)

        if baseline < EPSILON:
            return self._no_anomaly(metric_name, "low_baseline")

        # ------------------------
        # VARIANCE MODEL (Z-SCORE STYLE)
        # ------------------------
        variance = statistics.stdev(history) if len(history) >= 2 else 0.0
        safe_variance = max(variance, 0.1)

        upper_bound = baseline + (safe_variance * sensitivity)
        lower_bound = baseline - (safe_variance * sensitivity)

        stat_anomaly = current_value > upper_bound or current_value < lower_bound

        # ------------------------
        # % DEVIATION MODEL (FALLBACK / CROSS-CHECK)
        # ------------------------
        delta = current_value - baseline
        deviation_pct = abs(delta) / baseline

        pct_anomaly = deviation_pct > threshold_pct

        # ------------------------
        # FINAL DECISION (HYBRID)
        # ------------------------
        is_anomaly = stat_anomaly or pct_anomaly

        direction: Optional[str] = None
        if is_anomaly:
            direction = "drop" if delta < 0 else "spike"

        # ------------------------
        # OUTPUT (EXPLAINABLE)
        # ------------------------
        return {
            "metric_name": metric_name,
            "is_anomaly": is_anomaly,

            "current_value": self._round(current_value),
            "baseline": self._round(baseline),

            "expected_range": {
                "lower": self._round(lower_bound),
                "upper": self._round(upper_bound)
            },

            "delta": self._round(delta),
            "deviation_pct": self._round(deviation_pct * 100),

            "variance": self._round(safe_variance),
            "threshold_pct": threshold_pct,
            "sensitivity": sensitivity,

            "direction": direction,

            # Debug flags (VERY useful in prod)
            "signals": {
                "stat_model": stat_anomaly,
                "pct_model": pct_anomaly
            }
        }

    # ---------------------------------------------------------
    # DATA FETCHING
    # ---------------------------------------------------------
    def _fetch_current_metrics(self, tenant_id: str, date: str) -> Dict[str, float]:
        resp = self.db.table("metric_values") \
            .select("metric_name, value") \
            .eq("tenant_id", tenant_id) \
            .eq("date", date) \
            .execute()

        return {m["metric_name"]: m["value"] for m in (resp.data or [])}

    def _fetch_configs(self, tenant_id: str) -> Dict[str, Dict]:
        resp = self.db.table("metric_configs") \
            .select("metric_name, min_volume, sensitivity_multiplier, lookback_days, threshold_pct") \
            .eq("tenant_id", tenant_id) \
            .eq("is_active", True) \
            .execute()

        return {c["metric_name"]: c for c in (resp.data or [])}

    def _fetch_historical_data(self, tenant_id: str, end_date: str, days: int) -> Dict[str, List[float]]:
        from datetime import datetime

        end = datetime.strptime(end_date, "%Y-%m-%d")
        start = end - timedelta(days=days)

        resp = self.db.table("metric_values") \
            .select("metric_name, value, date") \
            .eq("tenant_id", tenant_id) \
            .gte("date", start.strftime("%Y-%m-%d")) \
            .lt("date", end_date) \
            .order("date", desc=False) \
            .execute()

        grouped = defaultdict(list)
        for row in (resp.data or []):
            grouped[row["metric_name"]].append(float(row["value"]))

        return grouped

    # ---------------------------------------------------------
    # HELPERS
    # ---------------------------------------------------------
    def _no_anomaly(self, metric_name: str, reason: str) -> Dict[str, Any]:
        return {
            "metric_name": metric_name,
            "is_anomaly": False,
            "reason": reason
        }

    def _round(self, value: float, digits: int = 2) -> float:
        try:
            return round(float(value), digits)
        except Exception:
            return 0.0