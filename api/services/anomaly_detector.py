from typing import List, Dict, Optional

# ---------------------------------------------------------
# CONFIG
# ---------------------------------------------------------

THRESHOLDS = {
    "revenue": 0.20,
    "signups": 0.30,
    "active_users": 0.25,
    "conversion_rate": 0.10,
    "logins": 0.20
}

MIN_REQUIRED_DAYS = 5
EPSILON = 1e-6


# ---------------------------------------------------------
# CORE ENGINE
# ---------------------------------------------------------

def check_anomaly(
    metric_name: str,
    current_value: float,
    history: List[float]
) -> Dict:
    """
    Deterministic anomaly detection.

    Logic:
    - Uses trailing 7-day average baseline
    - Compares % deviation against metric threshold
    """

    # ------------------------
    # VALIDATION
    # ------------------------
    if not history or len(history) < MIN_REQUIRED_DAYS:
        return _no_anomaly("insufficient_data", metric_name)

    # Use last 7 days max
    window = history[-7:]
    baseline = sum(window) / len(window)

    if baseline < EPSILON:
        return _no_anomaly("low_baseline", metric_name)

    # ------------------------
    # CALCULATION
    # ------------------------
    delta = current_value - baseline
    deviation = abs(delta) / baseline

    threshold = THRESHOLDS.get(metric_name, 0.20)

    is_anomaly = deviation > threshold

    direction: Optional[str] = None
    if is_anomaly:
        direction = "drop" if delta < 0 else "spike"

    # ------------------------
    # OUTPUT
    # ------------------------
    return {
        "is_anomaly": is_anomaly,
        "metric_name": metric_name,

        "current_value": _safe_round(current_value),
        "baseline": _safe_round(baseline),

        "delta": _safe_round(delta),
        "deviation_pct": _safe_round(deviation * 100),

        "direction": direction,
        "threshold": threshold
    }


# ---------------------------------------------------------
# HELPERS
# ---------------------------------------------------------

def _no_anomaly(reason: str, metric_name: str) -> Dict:
    return {
        "is_anomaly": False,
        "metric_name": metric_name,
        "reason": reason
    }


def _safe_round(value: float, digits: int = 2) -> float:
    try:
        return round(float(value), digits)
    except Exception:
        return 0.0