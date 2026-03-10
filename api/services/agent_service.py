# api/services/agent_service.py

import logging
from typing import List, Dict, Any
from uuid import uuid4
from datetime import datetime, timezone
from croniter import croniter
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

# Models and Security
from models import Agent, Dataset
from api.database import SessionLocal  # Import factory for background threads
from api.services.tenant_security_provider import tenant_security

# Services
from api.services.anomaly_detector import AnomalyDetector
# Assuming you have Pydantic schemas for the API boundaries
from api.models.agent import AgentRuleCreate

logger = logging.getLogger(__name__)

class AgentService:
    def __init__(self):
        """
        Dependency Injection removed for Supabase. 
        We now use standard SQLAlchemy Sessions for all queries to ensure transaction safety.
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
                name=rule.name, # Assuming your pydantic model has this
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

    async def check_and_dispatch_agents(self, db: Session, background_tasks) -> Dict[str, Any]:
        """
        The Orchestration Heartbeat.
        Finds active agents, evaluates crons, and dispatches due tasks.
        """
        now = datetime.now(timezone.utc)
        active_agents = db.query(Agent).filter(Agent.is_active == True).all()

        dispatched_count = 0

        for agent in active_agents:
            # Skip if no cron is defined
            if not agent.cron_schedule:
                continue
                
            try:
                last_run = agent.last_run_at or agent.created_at
                
                cron = croniter(agent.cron_schedule, last_run)
                next_run = cron.get_next(datetime)

                # Ensure tz-awareness for comparison
                if next_run.tzinfo is None:
                    next_run = next_run.replace(tzinfo=timezone.utc)

                if now >= next_run:
                    logger.info(f"Agent {agent.id} is due. Dispatching.")
                    
                    # Background tasks lose the current request DB session.
                    # We pass the IDs and create a fresh session inside the worker wrapper.
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

        # Commit all last_run_at updates
        if dispatched_count > 0:
            db.commit()

        return {"status": "success", "agents_dispatched": dispatched_count}

    async def _run_agent_task_wrapper(self, agent_id: str, tenant_id: str, dataset_id: str, metric: str, time_col: str, threshold: float):
        """
        Creates a fresh database session for the background thread and enforces 
        tenant execution contexts (metering & limits).
        """
        db = SessionLocal()
        try:
            # Wrap the raw execution in our security provider to deduct usage credits
            await tenant_security.execute_in_context(
                db=db,
                tenant_id=tenant_id,
                operation_name="autonomous_agent_run",
                func=self._execute_anomaly_math,
                # kwargs downward
                tenant_id=tenant_id,
                dataset_id=dataset_id,
                metric=metric,
                time_col=time_col,
                threshold=threshold
            )
        finally:
            db.close()

    async def _execute_anomaly_math(self, tenant_id: str, dataset_id: str, metric: str, time_col: str, threshold: float):
        """
        The Core Background Worker task. Executes math instantly. If it flags, we trigger AI.
        """
        logger.info(f"--- STARTING BACKGROUND MATH TASK FOR TENANT {tenant_id} ---")
        
        # 1. Phase 2: Math-First Anomaly Detection (Fast & Cheap Vectorized execution)
        anomaly_result = self.anomaly_detector.detect_anomaly(
            tenant_id=tenant_id,
            dataset_id=dataset_id,
            metric_col=metric,
            time_col=time_col,
            threshold=threshold 
        )

        if anomaly_result:
            logger.warning(f"🚨 ANOMALY DETECTED: {anomaly_result['direction']} in {metric}")
            
            # TODO: Phase 3: Diagnostic RAG Pipeline (Context Gathering & LLM)
            # insight_summary = await diagnostic_service.analyze(anomaly_result)
            
            # TODO: Phase 4: Notification Routing
            # await notification_service.send_slack_alert(agent, insight_summary)
        else:
            logger.info(f"✅ Data looks normal. Exiting autonomous task cheaply.")

# Export singleton instance
agent_service = AgentService()