# api/services/agent_service.py

import logging
import json
import os
import asyncio
from typing import Optional
import httpx
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
    3. (Phase 4) Orchestrating background autonomous anomaly detection via Edge Webhooks.
    """

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
    # Phase 4: Decoupled Worker Webhooks & Orchestration
    # -------------------------------------------------------------------------

    async def check_and_dispatch_agents(self, db: Session, background_tasks) -> dict:
        """
        The heartbeat scanner. Finds active autonomous agents and offloads
        their ML pipelines to the Edge Worker webhook queue.
        """
        logger.info("Scanning for active monitoring agents to dispatch...")
        try:
            # Find all active agents configured for autonomous monitoring
            # (Identified by having a metric_column assigned - phase 5 extension)
            monitoring_agents = db.query(Agent).filter(
                Agent.is_active == True,
                # Safe fallback if metric_column isn't strictly defined yet
                Agent.dataset_id.isnot(None) 
            ).all()

            dispatched_count = 0
            for agent in monitoring_agents:
                # Update last run timestamp immediately to prevent race conditions
                agent.last_run_at = datetime.now(timezone.utc)
                db.commit()

                # Dispatch asynchronously without blocking the heartbeat response
                # Note: FastAPI background_tasks expects a function, then args/kwargs
                background_tasks.add_task(
                    self._execute_autonomous_pipeline,
                    tenant_id=agent.tenant_id,
                    agent_id=str(agent.id),
                    dataset_id=str(agent.dataset_id) if agent.dataset_id else None,
                    metric=getattr(agent, "metric_column", "id"), # Safe attribute getter
                    time_col=getattr(agent, "time_column", "created_at"),
                    threshold=getattr(agent, "sensitivity_threshold", 2.5)
                )
                dispatched_count += 1

            logger.info(f"Dispatched {dispatched_count} agents to Edge Webhooks.")
            return {"status": "success", "dispatched": dispatched_count}
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Database error during agent dispatch: {e}")
            return {"status": "error", "message": "Failed to fetch agents for dispatch."}
        except Exception as e:
            logger.error(f"Unexpected error during heartbeat dispatch: {e}")
            return {"status": "error", "message": str(e)}

    async def _execute_autonomous_pipeline(self, **kwargs) -> None:
        """
        Phase 4: Industrial-Grade Execution
        Serializes pipeline parameters and dispatches them securely to our 
        Cloudflare Edge Worker (or async queue). The worker handles the heavy ML 
        vectorization and synthesis independently.
        """
        tenant_id = kwargs.get("tenant_id")
        agent_id  = kwargs.get("agent_id")
        
        logger.info(f"[{tenant_id}] Offloading autonomous pipeline for Agent {agent_id} to Edge Queue.")

        # Configuration injected via environment variables
        edge_worker_url = os.environ.get("EDGE_WORKER_URL", "https://edge.arcli.tech")
        internal_secret = os.environ.get("INTERNAL_ROUTING_SECRET", "local-dev-secret")

        payload = {
            "tenant_id":  tenant_id,
            "agent_id":   agent_id,
            "dataset_id": kwargs.get("dataset_id"),
            "metric":     kwargs.get("metric"),
            "time_col":   kwargs.get("time_col"),
            "threshold":  kwargs.get("threshold", 2.5),
            "action":     "trigger_ml_anomaly_pipeline"
        }

        try:
            # Fire and forget HTTP dispatch (Sub-50ms return)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{edge_worker_url}/webhooks/internal/ml-dispatch",
                    json=payload,
                    headers={
                        "x-internal-secret": internal_secret,
                        "Content-Type": "application/json"
                    },
                    timeout=5.0
                )
                
            if response.status_code >= 400:
                logger.error(
                    f"[{tenant_id}] Edge Worker rejected dispatch. Status: {response.status_code}. "
                    f"Response: {response.text}"
                )
            else:
                logger.info(f"[{tenant_id}] ML Pipeline successfully queued on the Edge.")
                
        except httpx.RequestError as exc:
            logger.critical(f"[{tenant_id}] Failed to reach Edge Worker for ML dispatch: {exc}")
        except Exception as e:
            logger.error(f"[{tenant_id}] Unexpected error offloading pipeline: {e}")

# Singleton Export
agent_service = AgentService()