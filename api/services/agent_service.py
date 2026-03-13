# api/services/agent_service.py

import logging
from typing import List, Dict, Any, Optional
from uuid import uuid4
from datetime import datetime, timezone
from croniter import croniter
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

# Models and Security
from models import Agent, Dataset
from api.database import SessionLocal  # Import factory for background threads
from api.services.tenant_security_provider import tenant_security

# Downstream Modular Services (The Multi-Agent Team)
from api.services.anomaly_detector import AnomalyDetector
from api.services.diagnostic_service import diagnostic_service     # Phase 1: RAG Diagnostics (The Analyst)
from api.services.notification_router import notification_router   # Phase 2: Action Space (The Voice)
from api.services.agent_memory import agent_memory                 # Phase 3: Stateful Memory (The Context)
from api.services.compute_engine import compute_engine             # Phase 5: ML Forecasting (The ML Expert)

# Pydantic schemas for the API boundaries
from api.models.agent import AgentRuleCreate

logger = logging.getLogger(__name__)

class AgentService:
    def __init__(self) -> None:
        """
        Hybrid Performance Paradigm: 
        Combining fast vectorized math with orchestrated agentic reasoning.
        """
        # Instantiate our highly optimized, vectorized mathematical detector
        self.anomaly_detector = AnomalyDetector()

    def create_agent(self, db: Session, tenant_id: str, rule: AgentRuleCreate) -> Agent:
        """Persists a new autonomous data agent strictly tied to the tenant."""
        try:
            # Verify dataset belongs to tenant before creating an agent on it
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
            logger.error(f"Failed to create agent for tenant {tenant_id}: {str(e)}")
            raise RuntimeError("Database error while creating agent.")

    def list_agents(self, db: Session, tenant_id: str) -> List[Agent]:
        """Retrieves all active agents specifically for the authenticated tenant."""
        return db.query(Agent).filter(
            Agent.tenant_id == tenant_id,
            Agent.is_active == True
        ).all()

    async def check_and_dispatch_agents(self, db: Session, background_tasks: Any) -> Dict[str, Any]:
        """
        The Orchestration Heartbeat.
        Finds active agents, evaluates crons, and dispatches due tasks.
        """
        now = datetime.now(timezone.utc)
        active_agents = db.query(Agent).filter(Agent.is_active == True).all()

        dispatched_count = 0

        for agent in active_agents:
            if not agent.cron_schedule:
                continue
                
            try:
                last_run = agent.last_run_at or agent.created_at
                
                # CRITICAL FIX: Ensure last_run is timezone-aware before passing to croniter
                if last_run.tzinfo is None:
                    last_run = last_run.replace(tzinfo=timezone.utc)
                
                cron = croniter(agent.cron_schedule, last_run)
                next_run = cron.get_next(datetime)

                # CRITICAL FIX: Ensure next_run is timezone-aware before comparing to `now`
                if next_run.tzinfo is None:
                    next_run = next_run.replace(tzinfo=timezone.utc)

                if now >= next_run:
                    logger.info(f"Agent {agent.id} is due. Dispatching.")
                    
                    background_tasks.add_task(
                        self._run_agent_task_wrapper, 
                        agent_id=str(agent.id), 
                        tenant_id=agent.tenant_id,
                        dataset_id=str(agent.dataset_id),
                        metric=agent.metric_column,
                        time_col=agent.time_column,
                        threshold=agent.sensitivity_threshold
                    )
                    
                    agent.last_run_at = now
                    dispatched_count += 1

            except Exception as cron_err:
                logger.error(f"Error evaluating schedule for agent {agent.id}: {str(cron_err)}")
                continue

        if dispatched_count > 0:
            db.commit()

        return {"status": "success", "agents_dispatched": dispatched_count}

    async def _run_agent_task_wrapper(self, agent_id: str, tenant_id: str, dataset_id: str, metric: str, time_col: str, threshold: float) -> None:
        """
        Creates a fresh database session for the background thread and enforces 
        tenant execution contexts (metering & limits).
        """
        db = SessionLocal()
        try:
            # FIX: We pass the conflicting parameters (like tenant_id) via *args positionally 
            # to avoid Python throwing a duplicate keyword argument Syntax/TypeError.
            await tenant_security.execute_in_context(
                db,                                   # Context: db
                tenant_id,                            # Context: tenant_id
                "autonomous_agent_run",               # Context: operation_name
                self._execute_autonomous_pipeline,    # Context: target function
                db,                                   # *args[0] -> db_session
                agent_id,                             # *args[1] -> agent_id
                tenant_id,                            # *args[2] -> tenant_id
                dataset_id,                           # *args[3] -> dataset_id
                metric,                               # *args[4] -> metric
                time_col,                             # *args[5] -> time_col
                threshold                             # *args[6] -> threshold
            )
        finally:
            db.close()

    async def _execute_autonomous_pipeline(self, db_session: Session, agent_id: str, tenant_id: str, dataset_id: str, metric: str, time_col: str, threshold: float) -> None:
        """
        Phase 5: Supervisor Orchestration.
        Orchestrates a multi-agent workflow to provide high-signal intelligence.
        """
        logger.info(f"--- [SUPERVISOR] INITIATING MULTI-AGENT TASK FOR TENANT {tenant_id} ---")
        
        # 1. PERCEPTION: Math Detector (Fast & Cheap)
        anomaly_result = self.anomaly_detector.detect_anomaly(
            tenant_id=tenant_id,
            dataset_id=dataset_id,
            metric_col=metric,
            time_col=time_col,
            threshold=threshold 
        )

        if not anomaly_result:
            logger.info(f"✅ Metric {metric} is stable. Closing task.")
            return

        try:
            # Fetch full agent context
            agent = db_session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                raise ValueError(f"Agent {agent_id} not found during pipeline execution.")

            # 2. CONTEXT: Memory Agent (Temporal Analysis)
            # Evaluates the baseline and identifies recurring patterns
            trend_analysis = await agent_memory.evaluate_trend(
                db=db_session,
                tenant_id=tenant_id,
                agent_name=agent.name,
                metric=metric,
                current_anomaly=anomaly_result
            )

            # 3. REASONING: Diagnostic Analyst Agent (Root Cause)
            # Writes exploratory SQL to find the 'Why' behind the anomaly
            diagnostic_summary = await diagnostic_service.analyze(
                tenant_id=tenant_id,
                dataset_id=dataset_id,
                metric=metric,
                anomaly_context=anomaly_result
            )

            # 4. PREDICTION: Forecasting Agent (Future Projection)
            # Uses ComputeEngine for vectorized ML projection (e.g., EMA/Linear Regression)
            prediction_insight = await self._get_ml_forecast(tenant_id, dataset_id, metric, time_col)

            # 5. SYNTHESIS: The Strategist
            # Merges all agent outputs into one high-signal notification
            final_report = self._synthesize_agent_reports(
                trend=getattr(trend_analysis, 'memory_context', 'No memory context available.'),
                diagnostic=diagnostic_summary,
                forecast=prediction_insight
            )

            # 6. ACTION: Notification Router
            await notification_router.dispatch_alert(
                tenant_id=tenant_id,
                agent_name=agent.name,
                insight_summary=final_report
            )

            # Update stateful tracking
            agent.last_anomaly_detected_at = datetime.now(timezone.utc)
            db_session.commit()
            
            logger.info(f"🚀 Pipeline complete. Alert dispatched for {agent.name}.")

        except Exception as e:
            db_session.rollback()
            logger.error(f"Critical failure in agent supervisor pipeline {agent_id}: {str(e)}")

    async def _get_ml_forecast(self, tenant_id: str, dataset_id: str, metric: str, time_col: str) -> str:
        """Invokes the Compute Engine Agent to project the metric's path."""
        try:
            # Delegate to the ML pipeline via semantic prompt
            forecast = await compute_engine.execute_ml_pipeline(
                tenant_id=tenant_id,
                dataset_ids=[dataset_id],
                prompt=f"Based on the last 30 days of {metric}, forecast the next 7 days. Is the current anomaly likely to persist?",
                schemas=[]  # Compute engine handles internal injection securely
            )
            return f"Projected Trend: {forecast.get('summary', 'Insufficient data for a confident forecast.')}"
        except Exception as e:
            logger.warning(f"Forecasting skipped/failed for tenant {tenant_id}: {e}")
            return "Forecasting currently unavailable."

    def _synthesize_agent_reports(self, trend: str, diagnostic: str, forecast: str) -> str:
        """Combines modular agent outputs into a unified, scannable report structure."""
        return (
            f"*Temporal Context:*\n{trend}\n\n"
            f"*Root Cause Analysis:*\n{diagnostic}\n\n"
            f"*Future Outlook:*\n{forecast}"
        )

# Export singleton instance
agent_service = AgentService()