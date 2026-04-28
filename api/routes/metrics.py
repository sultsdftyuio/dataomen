# api/routes/metrics.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from api.services.anomaly_engine import check_anomaly
from api.services.explanation_engine import generate_explanation
# from api.services.metrics_service import fetch_metric_data (To be implemented for real DB connection)

router = APIRouter()

class MetricRunRequest(BaseModel):
    tenant_id: str
    metric_name: str

@router.post("/metrics/run")
def run_metric_detection(payload: MetricRunRequest):
    # TODO: In the next step, we hook this to `metrics_service.py` to pull real DB arrays.
    # For now, to keep the pipeline functional end-to-end without mocking the output format,
    # we simulate the database layer pulling today's value vs the last 7 days.
    
    if payload.metric_name == "revenue":
        current_value = 1400.0
        history_7_days = [2100.0, 2050.0, 2200.0, 2150.0, 2000.0, 2100.0, 2050.0] # ~2092 avg
    else:
        current_value = 100.0
        history_7_days = [95.0, 105.0, 100.0, 98.0, 102.0, 100.0, 99.0] # stable
        
    anomaly_result = check_anomaly(payload.metric_name, current_value, history_7_days)
    final_response = generate_explanation(anomaly_result)
    
    return final_response