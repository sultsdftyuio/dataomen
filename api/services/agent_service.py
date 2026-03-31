# api/services/agent_service.py

import logging
import asyncio
import json
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, Field

# Models and Security
from models import Agent, Dataset
from api.database import SessionLocal 
from api.services.tenant_security_provider import tenant_security

# Core Intelligence Ecosystem
from api.services.llm_client import llm_client
from api.services.anomaly_detector import AnomalyDetector
from api.services.diagnostic_service import diagnostic_service     
from api.services.notification_router import notification_router   
from api.services.agent_memory import agent_memory                 
from api.services.compute_engine import compute_engine             

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Phase 1: Specialized Copilot API Boundaries (1-to-1 Constraint)
# -------------------------------------------------------------------------

class AgentCreatePayload(BaseModel):
    """
    The exact schema matching our React frontend's CreateAgentForm.
    Phase 1 Update: Strictly enforces a 1-to-1 connector limit.
    """
    name: str = Field(..., description="The display name of the Agent.")
    description: str = Field(..., description="A short summary of its capabilities.")
    role_description: str = Field(..., description="The system prompt / explicit instructions for the AI.")
    dataset_id: Optional[str] = Field(None, description="UUID of the single allowed structured data connection.")
    document_id: Optional[str] = Field(None, description="UUID of the single allowed unstructured data (Vector RAG).")
    temperature: float = Field(0.0, ge=0.0, le=1.0, description="0.0 for strict math/SQL, higher for creative writing.")


class SynthesizedReport(BaseModel):
    """Output schema for background autonomous tasks."""
    headline: str = Field(..., description="A punchy, one-sentence TL;DR of the situation.")
    executive_summary: str = Field(..., description="A concise narrative synthesis of the 'What', 'Why', and 'When'.")
    severity_level: str = Field(..., description="Low, Medium, or High based on business impact.")
    recommended_action: str = Field(..., description="A specific, data-backed step for the user to take.")

# -------------------------------------------------------------------------
# The Specialized Agent Service
# -------------------------------------------------------------------------

class AgentService:
    """
    Enterprise Specialized Agent Service.
    
    Responsibilities:
    1. Provisioning new isolated AI Copilots with strict 1-to-1 RAG/SQL access.
    2. Retrieving Agent profiles for the Chat Orchestrator / Query Planner.
    3. (Legacy) Managing background autonomous anomaly detection tasks.
    """
    
    def __init__(self) -> None:
        self.anomaly_detector = AnomalyDetector()

    def create_agent(self, db: Session, tenant_id: str, payload: AgentCreatePayload) -> Agent:
        """
        Provisions a new highly-specialized AI Copilot.
        Strictly validates that the requested dataset/document belongs to the tenant.
        Enforces Mutual Exclusivity (only one data source allowed).
        """
        logger.info(f"[{tenant_id}] Provisioning new specialized agent: {payload.name}")
        
        try:
            # 1. 1-to-1 Constraint & Security Validation
            if payload.dataset_id and payload.document_id:
                raise ValueError("An agent can only map to ONE data source (dataset or document), not both.")
            
            source_id = payload.dataset_id or payload.document_id
            
            if source_id:
                # Ensure no cross-tenant ID injection
                valid_asset = db.query(Dataset.id).filter(
                    Dataset.id == source_id,
                    Dataset.tenant_id == tenant_id
                ).first()
                
                if not valid_asset:
                    logger.warning(f"[{tenant_id}] Unauthorized or missing asset requested: {source_id}")
                    raise ValueError(f"Data source {source_id} not found or unauthorized.")

            # 2. Database Insertion
            new_agent = Agent(
                tenant_id=tenant_id,
                name=payload.name,
                description=payload.description,
                role_description=payload.role_description,
                
                # Phase 1: Singular direct mapping
                dataset_id=payload.dataset_id,
                document_id=payload.document_id,
                temperature=payload.temperature,
                is_active=True
            )
            
            db.add(new_agent)
            db.commit()
            db.refresh(new_agent)
            
            logger.info(f"✅ [{tenant_id}] Agent {new_agent.id} successfully deployed with strict 1-to-1 isolation.")
            return new_agent
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"[{tenant_id}] Failed to create agent: {str(e)}")
            raise RuntimeError("Database error during agent provisioning.")

    def get_agent_context(self, db: Session, tenant_id: str, agent_id: str) -> Optional[Agent]:
        """
        Retrieves the Agent persona. Used by the `ChatOrchestrator` to inject 
        the `role_description` and filter down the RAG vector search limits.
        """
        return db.query(Agent).filter(
            Agent.id == agent_id,
            Agent.tenant_id == tenant_id,
            Agent.is_active == True
        ).first()

    # -------------------------------------------------------------------------
    # Legacy Autonomous Background Tasks (Supervisor Swarm)
    # -------------------------------------------------------------------------
    # Kept intact to ensure no breaking changes to your background workers

    async def _execute_autonomous_pipeline(self, db_session: Session, **kwargs) -> None:
        """The Supervisor Loop: Orchestrates sub-agents and synthesizes final intelligence."""
        tenant_id = kwargs["tenant_id"]
        metric = kwargs["metric"]
        agent_id = kwargs["agent_id"]
        
        anomaly_result = await asyncio.to_thread(
            self.anomaly_detector.detect_anomaly,
            tenant_id=tenant_id, dataset_id=kwargs["dataset_id"],
            metric_col=metric, time_col=kwargs["time_col"], threshold=kwargs["threshold"]
        )

        if not anomaly_result:
            return

        try:
            agent = db_session.query(Agent).filter(Agent.id == agent_id).first()
            
            trend = await agent_memory.evaluate_trend(
                db=db_session, tenant_id=tenant_id, agent_name=agent.name,
                metric=metric, current_anomaly=anomaly_result
            )

            diagnostic_summary = await diagnostic_service.analyze(
                tenant_id=tenant_id, dataset_id=kwargs["dataset_id"],
                metric=metric, anomaly_context=anomaly_result
            )

            forecast = await self._get_ml_forecast(tenant_id, kwargs["dataset_id"], metric, kwargs["time_col"])

            final_report = await self._synthesize_intelligence(
                agent_name=agent.name, metric=metric,
                trend_ctx=getattr(trend, 'memory_context', 'No memory context.'),
                diag_ctx=diagnostic_summary,
                forecast_ctx=forecast
            )

            await notification_router.dispatch_alert(
                tenant_id=tenant_id,
                agent_name=agent.name,
                insight_summary=f"**{final_report.headline}**\n\n{final_report.executive_summary}\n\n**Action:** {final_report.recommended_action}"
            )

            agent.last_anomaly_detected_at = datetime.now(timezone.utc)
            db_session.commit()

        except Exception as e:
            db_session.rollback()
            logger.error(f"Supervisor pipeline crash for agent {agent_id}: {e}")

    async def _synthesize_intelligence(self, **ctx) -> SynthesizedReport:
        system_prompt = (
            "You are the Executive Supervisor for an autonomous analytical swarm. "
            "Synthesize raw inputs from sub-agents (Memory, Diagnostic, Forecasting) "
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
            temperature=0.2 
        )

    async def _get_ml_forecast(self, tenant_id: str, dataset_id: str, metric: str, time_col: str) -> str:
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