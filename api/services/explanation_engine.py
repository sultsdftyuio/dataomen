RULES_MATRIX = {
    "revenue": {
        "drop": {"cause": "fewer transactions", "recommendation": "check Stripe failures"}
    },
    "signups": {
        "drop": {"cause": "fewer signups", "recommendation": "check traffic sources"}
    },
    "conversion_rate": {
        "drop": {"cause": "funnel drop-off", "recommendation": "check onboarding steps"}
    },
    "active_users": {
        "drop": {"cause": "lower engagement", "recommendation": "check retention or recent changes"}
    },
    "logins": {
        "drop": {"cause": "authentication issues", "recommendation": "check auth systems or outages"}
    }
}


def generate_explanation(anomaly_data: dict) -> dict:
    metric = anomaly_data.get("metric_name", "unknown")
    formatted_metric = metric.replace("_", " ").title()

    if not anomaly_data.get("is_anomaly"):
        return {
            "isAnomaly": False,
            "message": f"✅ {formatted_metric} is stable. No issues detected."
        }

    direction = anomaly_data.get("direction")
    deviation = anomaly_data.get("deviation_pct", 0)
    current = anomaly_data.get("current_value")
    baseline = anomaly_data.get("baseline")

    if not direction:
        return {
            "isAnomaly": False,
            "message": "No anomaly detected."
        }

    verb = "dropped" if direction == "drop" else "spiked"

    message = f"🚨 {formatted_metric} {verb} {deviation}% today vs last 7-day average"

    if current is not None and baseline is not None:
        message += f" ({current} vs {baseline})"

    rule = RULES_MATRIX.get(metric, {}).get(direction, {
        "cause": "unexpected change detected",
        "recommendation": "review recent changes or logs"
    })

    return {
        "isAnomaly": True,
        "message": message,
        "cause": rule["cause"],
        "recommendation": rule["recommendation"]
    }