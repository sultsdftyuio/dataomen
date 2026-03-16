# api/services/agent_service.py

import logging
import asyncio
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from croniter import croniter
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, Field

# Models and Security
from models import Agent, Dataset
from api.database import SessionLocal 
from api.services.tenant_security_provider import tenant_security

# Core Intelligence Ecosystem (Singletons)
from api.services.llm_client import llm_client
from api.services.anomaly_detector import AnomalyDetector
from api.services.diagnostic_service import diagnostic_service     
from api.services.notification_router import notification_router   
from api.services.agent_memory import agent_memory                 
from api.services.compute_engine import compute_engine             

# Pydantic schemas for the API boundaries
from api.models.agent import AgentRuleCreate

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Supervisor Output Schema
# -------------------------------------------------------------------------

class SynthesizedReport(BaseModel):
    """
    The final output of the Supervisor Orchestration.
    Combines trend, root cause, and forecast into a strategic brief.
    """
    headline: str = Field(..., description="A punchy, one-sentence TL;DR of the situation.")
    executive_summary: str = Field(..., description="A concise narrative synthesis of the 'What', 'Why', and 'When'.")
    severity_level: str = Field(..., description="Low, Medium, or High based on business impact.")
    recommended_action: str = Field(..., description="A specific, data-backed step for the user to take.")

# -------------------------------------------------------------------------
# The Autonomous Agent Supervisor
# -------------------------------------------------------------------------

class AgentService:
    """
    Phase 5+: The Autonomous Agent Supervisor.
    
    Orchestrates a multi-agent swarm:
    1. Math Detector (Perception)
    2. Memory Agent (Temporal Baseline)
    3. Diagnostic Agent (Root Cause Logic)
    4. Forecasting Agent (Predictive Path)
    5. Supervisor (LLM Synthesis & Reasoning)
    """
    
    def __init__(self) -> None:
        self.anomaly_detector = AnomalyDetector()

    def create_agent(self, db: Session, tenant_id: str, rule: AgentRuleCreate) -> Agent:
        """Persists a new autonomous data agent strictly tied to the tenant."""
        try:
            dataset = db.query(Dataset).filter(
                Dataset.id == rule.dataset_id,
                Dataset.tenant_id == tenant_id
            ).first()
            
            if not dataset:
                raise ValueError("Dataset not found or access denied.")

            new_agent = Agent(
                tenant_id=tenant_id,
                dataset_id=rule.dataset_id,
                name=rule.name, 
                metric_column=rule.metric_column,
                time_column=rule.time_column,
                cron_schedule=rule.cron_schedule,
                sensitivity_threshold=rule.sensitivity_threshold,
                is_active=True
            )
            
            db.add(new_agent)
            db.commit()
            db.refresh(new_agent)
            return new_agent
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Failed to create agent: {str(e)}")
            raise RuntimeError("Database error during agent registration.")

    async def check_and_dispatch_agents(self, db: Session, background_tasks: Any) -> Dict[str, Any]:
        """The Orchestration Heartbeat. Dispatches due tasks to the background worker."""
        now = datetime.now(timezone.utc)
        active_agents = db.query(Agent).filter(Agent.is_active == True).all()
        dispatched_count = 0

        for agent in active_agents:
            if not agent.cron_schedule: continue
            try:
                last_run = agent.last_run_at or agent.created_at
                if last_run.tzinfo is None: last_run = last_run.replace(tzinfo=timezone.utc)
                
                cron = croniter(agent.cron_schedule, last_run)
                next_run = cron.get_next(datetime)
                if next_run.tzinfo is None: next_run = next_run.replace(tzinfo=timezone.utc)

                if now >= next_run:
                    background_tasks.add_task(
                        self._run_agent_task_wrapper, 
                        agent_id=str(agent.id), tenant_id=agent.tenant_id,
                        dataset_id=str(agent.dataset_id), metric=agent.metric_column,
                        time_col=agent.time_column, threshold=agent.sensitivity_threshold
                    )
                    agent.last_run_at = now
                    dispatched_count += 1
            except Exception as e:
                logger.error(f"Schedule eval error for agent {agent.id}: {e}")

        if dispatched_count > 0: db.commit()
        return {"status": "success", "agents_dispatched": dispatched_count}

    async def _run_agent_task_wrapper(self, **kwargs) -> None:
        """Executes in a background thread with fresh DB session and tenant context."""
        db = SessionLocal()
        try:
            await tenant_security.execute_in_context(
                db, kwargs["tenant_id"], "autonomous_agent_run",
                self._execute_autonomous_pipeline, db, **kwargs
            )
        finally:
            db.close()

    async def _execute_autonomous_pipeline(self, db_session: Session, **kwargs) -> None:
        """
        The Supervisor Loop: Orchestrates sub-agents and synthesizes final intelligence.
        """
        tenant_id = kwargs["tenant_id"]
        metric = kwargs["metric"]
        agent_id = kwargs["agent_id"]
        
        # 1. PERCEPTION: Math Detector (Fast & cheap vectorized scan)
        anomaly_result = await asyncio.to_thread(
            self.anomaly_detector.detect_anomaly,
            tenant_id=tenant_id, dataset_id=kwargs["dataset_id"],
            metric_col=metric, time_col=kwargs["time_col"], threshold=kwargs["threshold"]
        )

        if not anomaly_result:
            logger.info(f"✅ Metric {metric} stable for tenant {tenant_id}.")
            return

        try:
            agent = db_session.query(Agent).filter(Agent.id == agent_id).first()
            
            # 2. CONTEXT & REASONING (Sub-Agent Swarm)
            # Memory Baseline eval
            trend = await agent_memory.evaluate_trend(
                db=db_session, tenant_id=tenant_id, agent_name=agent.name,
                metric=metric, current_anomaly=anomaly_result
            )

            # Diagnostic Root Cause (RAG)
            diagnostic_summary = await diagnostic_service.analyze(
                tenant_id=tenant_id, dataset_id=kwargs["dataset_id"],
                metric=metric, anomaly_context=anomaly_result
            )

            # Future Forecast
            forecast = await self._get_ml_forecast(tenant_id, kwargs["dataset_id"], metric, kwargs["time_col"])

            # 3. SUPERVISION: Synthesis via llm_client (The Brain)
            # We use Strict Structured Outputs to ensure the notification is professional
            final_report = await self._synthesize_intelligence(
                agent_name=agent.name, metric=metric,
                trend_ctx=getattr(trend, 'memory_context', 'No memory context.'),
                diag_ctx=diagnostic_summary,
                forecast_ctx=forecast
            )

            # 4. ACTION: Dispatch and Update State
            await notification_router.dispatch_alert(
                tenant_id=tenant_id,
                agent_name=agent.name,
                insight_summary=f"**{final_report.headline}**\n\n{final_report.executive_summary}\n\n**Action:** {final_report.recommended_action}"
            )

            agent.last_anomaly_detected_at = datetime.now(timezone.utc)
            db_session.commit()
            logger.info(f"🚀 Supervisor cycle complete. Insight dispatched for {agent.name}.")

        except Exception as e:
            db_session.rollback()
            logger.error(f"Supervisor pipeline crash for agent {agent_id}: {e}")

    async def _synthesize_intelligence(self, **ctx) -> SynthesizedReport:
        """
        Uses the global llm_client to bridge sub-agent outputs into a cohesive business brief.
        """
        system_prompt = (
            "You are the Executive Supervisor for an autonomous analytical swarm. "
            "Your job is to synthesize raw inputs from sub-agents (Memory, Diagnostic, Forecasting) "
            "into a single, high-signal report for a business user."
        )
        
        user_prompt = f"""
        AGENT: {ctx['agent_name']}
        METRIC: {ctx['metric']}
        
        SUB-AGENT INPUTS:
        - TEMPORAL MEMORY: {ctx['trend_ctx']}
        - ROOT CAUSE DIAGNOSIS: {ctx['diag_ctx']}
        - PREDICTIVE FORECAST: {ctx['forecast_ctx']}
        
        TASK:
        Generate a structured executive report. Be specific, actionable, and professional.
        """

        return await llm_client.generate_structured(
            system_prompt=system_prompt,
            prompt=user_prompt,
            response_model=SynthesizedReport,
            temperature=0.2 # Lower temperature for analytical grounding
        )

    async def _get_ml_forecast(self, tenant_id: str, dataset_id: str, metric: str, time_col: str) -> str:
        """Invokes Compute Engine for vectorized ML projection."""
        try:
            forecast = await compute_engine.execute_ml_pipeline(
                tenant_id=tenant_id, dataset_ids=[dataset_id],
                prompt=f"Project {metric} for the next 7 periods based on current trend.",
                schemas=[]
            )
            return forecast.get('summary', 'Insufficient historical data for a forecast.')
        except Exception:
            return "Predictive modeling currently unavailable."

# Singleton Export
agent_service = AgentService()