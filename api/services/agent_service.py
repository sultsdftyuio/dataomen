# api/services/agent_service.py

import logging
import os
import asyncio
from typing import Optional
from uuid import UUID
import httpx
from datetime import datetime, timezone, timedelta
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, Field
from qdrant_client.models import Filter, FieldCondition, MatchValue

# Models and Security
from models import Agent, Dataset
from api.services.vector_service import vector_service

logger = logging.getLogger(__name__)

HEARTBEAT_MIN_INTERVAL_SECONDS = int(os.getenv("AGENT_HEARTBEAT_MIN_INTERVAL_SECONDS", "60"))
EDGE_DISPATCH_MAX_RETRIES = max(1, int(os.getenv("EDGE_DISPATCH_MAX_RETRIES", "3")))
EDGE_DISPATCH_BACKOFF_SECONDS = float(os.getenv("EDGE_DISPATCH_BACKOFF_SECONDS", "0.5"))

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

    async def verify_document_ownership(self, tenant_id: str, document_id: str) -> bool:
        """
        Verifies that a document exists in vector storage for the given tenant.
        Uses payload-level tenant_id/document_id filters across all document collections.
        """
        if not vector_service.client:
            raise RuntimeError("Vector service is unavailable; cannot verify document ownership.")

        collections = await vector_service.client.get_collections()
        candidate_collections = [
            c.name for c in collections.collections
            if getattr(c, "name", "").startswith("dataomen_documents")
        ]

        if not candidate_collections:
            return False

        doc_filter = Filter(must=[
            FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
            FieldCondition(key="document_id", match=MatchValue(value=document_id)),
        ])

        for collection_name in candidate_collections:
            try:
                points, _ = await vector_service.client.scroll(
                    collection_name=collection_name,
                    scroll_filter=doc_filter,
                    limit=1,
                    with_payload=False,
                    with_vectors=False,
                )
                if points:
                    return True
            except Exception as e:
                logger.warning(
                    f"[{tenant_id}] Document ownership check failed on collection "
                    f"{collection_name}: {e}"
                )

        return False

    async def create_agent(self, db: Session, tenant_id: str, payload: AgentCreatePayload) -> Agent:
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

            if not payload.dataset_id and not payload.document_id:
                raise ValueError("Agent provisioning requires exactly one source (dataset_id or document_id).")
            
            dataset_uuid: Optional[UUID] = None
            document_uuid: Optional[UUID] = None

            if payload.dataset_id:
                try:
                    dataset_uuid = UUID(payload.dataset_id)
                except ValueError as exc:
                    raise ValueError("dataset_id must be a valid UUID.") from exc

                valid_asset = db.query(Dataset.id).filter(
                    Dataset.id == dataset_uuid,
                    Dataset.tenant_id == tenant_id,
                ).first()

                if not valid_asset:
                    logger.warning(f"[{tenant_id}] Unauthorized or missing dataset requested: {dataset_uuid}")
                    raise ValueError(f"Dataset {dataset_uuid} not found or unauthorized.")

            if payload.document_id:
                try:
                    document_uuid = UUID(payload.document_id)
                except ValueError as exc:
                    raise ValueError("document_id must be a valid UUID.") from exc

                has_access = await self.verify_document_ownership(tenant_id, str(document_uuid))
                if not has_access:
                    logger.warning(f"[{tenant_id}] Unauthorized or missing document requested: {document_uuid}")
                    raise ValueError(f"Document {document_uuid} not found or unauthorized.")

            # 2. Database Insertion
            new_agent = Agent(
                tenant_id=tenant_id,
                name=payload.name,
                description=payload.description,
                role_description=payload.role_description,
                
                # Phase 1: Singular direct mapping
                dataset_id=dataset_uuid,
                document_id=document_uuid,
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

    def create_monitoring_agent(
        self,
        db: Session,
        tenant_id: str,
        name: str,
        dataset_id: str,
        metric_column: str,
        time_column: str,
        cron_schedule: str,
        sensitivity_threshold: float,
        role_description: Optional[str] = None,
    ) -> Agent:
        """Create a monitoring agent with explicit monitoring configuration fields."""
        try:
            dataset_uuid = UUID(dataset_id)
        except ValueError as exc:
            raise ValueError("dataset_id must be a valid UUID.") from exc

        owned_dataset = db.query(Dataset.id).filter(
            Dataset.id == dataset_uuid,
            Dataset.tenant_id == tenant_id,
        ).first()
        if not owned_dataset:
            raise ValueError("Dataset not found or unauthorized.")

        try:
            new_agent = Agent(
                tenant_id=tenant_id,
                name=name,
                description="Autonomous monitoring agent",
                role_description=role_description or "Autonomous metric monitor",
                dataset_id=dataset_uuid,
                document_id=None,
                temperature=0.0,
                is_active=True,
                metric_column=metric_column,
                time_column=time_column,
                cron_schedule=cron_schedule,
                sensitivity_threshold=sensitivity_threshold,
            )
            db.add(new_agent)
            db.commit()
            db.refresh(new_agent)
            return new_agent
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"[{tenant_id}] Failed to create monitoring agent: {e}", exc_info=True)
            raise RuntimeError("Database error during monitoring agent provisioning.")

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
            now = datetime.now(timezone.utc)
            due_cutoff = now - timedelta(seconds=HEARTBEAT_MIN_INTERVAL_SECONDS)

            monitoring_agents = (
                db.query(Agent)
                .filter(
                    Agent.is_active.is_(True),
                    Agent.dataset_id.isnot(None),
                    Agent.metric_column.isnot(None),
                    Agent.time_column.isnot(None),
                    or_(Agent.last_run_at.is_(None), Agent.last_run_at <= due_cutoff),
                )
                .with_for_update(skip_locked=True)
                .all()
            )

            dispatched_count = 0
            for agent in monitoring_agents:
                agent.last_run_at = now

            db.commit()

            for agent in monitoring_agents:
                background_tasks.add_task(
                    self._execute_autonomous_pipeline,
                    tenant_id=agent.tenant_id,
                    agent_id=str(agent.id),
                    dataset_id=str(agent.dataset_id) if agent.dataset_id else None,
                    metric=agent.metric_column or "id",
                    time_col=agent.time_column or "created_at",
                    threshold=agent.sensitivity_threshold or 2.5,
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
        edge_worker_url = os.environ.get("EDGE_WORKER_URL")
        internal_secret = os.environ.get("INTERNAL_ROUTING_SECRET")

        if not edge_worker_url or not internal_secret:
            logger.error(f"[{tenant_id}] Missing EDGE_WORKER_URL or INTERNAL_ROUTING_SECRET; skipping dispatch.")
            return

        payload = {
            "tenant_id":  tenant_id,
            "agent_id":   agent_id,
            "dataset_id": kwargs.get("dataset_id"),
            "metric":     kwargs.get("metric"),
            "time_col":   kwargs.get("time_col"),
            "threshold":  kwargs.get("threshold", 2.5),
            "action":     "trigger_ml_anomaly_pipeline"
        }

        for attempt in range(1, EDGE_DISPATCH_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=2.0)) as client:
                    response = await client.post(
                        f"{edge_worker_url}/webhooks/internal/ml-dispatch",
                        json=payload,
                        headers={
                            "x-internal-secret": internal_secret,
                            "Content-Type": "application/json",
                        },
                    )

                if response.status_code < 400:
                    logger.info(f"[{tenant_id}] ML Pipeline successfully queued on the Edge.")
                    return

                is_retriable = response.status_code >= 500 or response.status_code == 429
                if not is_retriable or attempt == EDGE_DISPATCH_MAX_RETRIES:
                    logger.error(
                        f"[{tenant_id}] Edge Worker rejected dispatch. status={response.status_code} "
                        f"attempt={attempt}/{EDGE_DISPATCH_MAX_RETRIES} body={response.text}"
                    )
                    return

            except httpx.RequestError as exc:
                if attempt == EDGE_DISPATCH_MAX_RETRIES:
                    logger.critical(
                        f"[{tenant_id}] Failed to reach Edge Worker for ML dispatch after "
                        f"{EDGE_DISPATCH_MAX_RETRIES} attempts: {exc}"
                    )
                    return
            except Exception as e:
                logger.error(f"[{tenant_id}] Unexpected error offloading pipeline: {e}", exc_info=True)
                return

            await asyncio.sleep(EDGE_DISPATCH_BACKOFF_SECONDS * (2 ** (attempt - 1)))

# Global singleton
agent_service = AgentService()