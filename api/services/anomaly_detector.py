THRESHOLDS = {
    "revenue": 0.20,
    "signups": 0.30,
    "active_users": 0.25,
    "conversion_rate": 0.10,
    "logins": 0.20
}

def check_anomaly(metric_name: str, current_value: float, history_7_days: list[float]) -> dict:
    if len(history_7_days) < 7:
        return {"is_anomaly": False, "reason": "insufficient_data"}

    baseline = sum(history_7_days[-7:]) / 7

    if baseline < 1e-6:
        return {"is_anomaly": False, "reason": "low_baseline"}

    deviation = abs(current_value - baseline) / baseline
    threshold = THRESHOLDS.get(metric_name, 0.20)

    is_anomaly = deviation > threshold

    direction = None
    if is_anomaly:
        direction = "drop" if current_value < baseline else "spike"

    return {
        "is_anomaly": is_anomaly,
        "metric_name": metric_name,
        "current_value": round(current_value, 2),
        "baseline": round(baseline, 2),
        "delta": round(current_value - baseline, 2),
        "deviation_pct": round(deviation * 100, 1),
        "direction": direction
    }