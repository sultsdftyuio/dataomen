import logging
from typing import List, Dict, Any
from uuid import uuid4
from datetime import datetime, timezone
from croniter import croniter

# Models and Services
from api.models.agent import AgentRuleCreate, AgentRuleInDB
from api.services.anomaly_detector import AnomalyDetector

logger = logging.getLogger(__name__)

class AgentService:
    def __init__(self, supabase_client):
        """
        Dependency Injection of the Supabase client.
        Multi-tenant isolation is enforced at the query level or via RLS policies.
        """
        self.supabase = supabase_client
        
        # Instantiate our highly optimized, vectorized mathematical detector
        self.anomaly_detector = AnomalyDetector()

    async def create_agent(self, tenant_id: str, rule: AgentRuleCreate) -> AgentRuleInDB:
        """Persists a new autonomous data agent to Supabase."""
        new_agent_data = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            "dataset_id": rule.dataset_id,
            "metric_column": rule.metric_column,
            "time_column": rule.time_column,
            "cron_schedule": rule.cron_schedule,
            "sensitivity_threshold": rule.sensitivity_threshold,
            "notification_channels": [channel.model_dump() for channel in rule.notification_channels],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        }

        try:
            response = self.supabase.table("agent_rules").insert(new_agent_data).execute()
            if not response.data:
                raise ValueError("Failed to insert agent rule.")
            return AgentRuleInDB(**response.data[0])
        except Exception as e:
            logger.error(f"Failed to create agent for tenant {tenant_id}: {str(e)}")
            raise e

    async def list_agents(self, tenant_id: str) -> List[AgentRuleInDB]:
        """Retrieves all active agents specifically for the authenticated tenant."""
        try:
            response = self.supabase.table("agent_rules") \
                .select("*") \
                .eq("tenant_id", tenant_id) \
                .eq("is_active", True) \
                .execute()
            return [AgentRuleInDB(**row) for row in response.data]
        except Exception as e:
            logger.error(f"Failed to fetch agents for tenant {tenant_id}: {str(e)}")
            raise e

    async def check_and_dispatch_agents(self, background_tasks) -> Dict[str, Any]:
        """
        The Orchestration Heartbeat: Finds active agents, evaluates crons, 
        and dispatches due tasks to the background worker.
        """
        now = datetime.now(timezone.utc)
        
        try:
            response = self.supabase.table("agent_rules").select("*").eq("is_active", True).execute()
            active_agents = response.data
        except Exception as e:
            logger.error(f"Heartbeat failed to fetch agents: {str(e)}")
            return {"status": "error", "message": "Database error"}

        dispatched_count = 0

        for agent in active_agents:
            try:
                last_run_str = agent.get("last_run_at") or agent.get("created_at")
                last_run = datetime.fromisoformat(last_run_str.replace("Z", "+00:00"))
                
                cron = croniter(agent["cron_schedule"], last_run)
                next_run = cron.get_next(datetime)

                if now >= next_run:
                    logger.info(f"Agent {agent['id']} is due. Dispatching.")
                    
                    background_tasks.add_task(
                        self._run_agent_task, 
                        agent_id=agent['id'], 
                        tenant_id=agent['tenant_id'],
                        dataset_id=agent['dataset_id'],
                        metric=agent['metric_column'],
                        time_col=agent['time_column'],
                        threshold=agent.get('sensitivity_threshold', 2.0)
                    )
                    
                    self.supabase.table("agent_rules") \
                        .update({"last_run_at": now.isoformat()}) \
                        .eq("id", agent["id"]) \
                        .execute()
                    
                    dispatched_count += 1

            except Exception as cron_err:
                logger.error(f"Error evaluating schedule for agent {agent.get('id')}: {str(cron_err)}")
                continue

        return {"status": "success", "agents_dispatched": dispatched_count}

    async def _run_agent_task(self, agent_id: str, tenant_id: str, dataset_id: str, metric: str, time_col: str, threshold: float):
        """
        The Background Worker task. Executes math instantly. If it flags, we trigger AI.
        """
        logger.info(f"--- STARTING BACKGROUND TASK FOR AGENT {agent_id} ---")
        
        try:
            # 1. Phase 2: Math-First Anomaly Detection (Fast & Cheap)
            anomaly_result = self.anomaly_detector.detect_anomaly(
                tenant_id=tenant_id,
                dataset_id=dataset_id,
                metric_col=metric,
                time_col=time_col,
                threshold=threshold 
            )

            if anomaly_result:
                logger.warning(f"🚨 ANOMALY DETECTED for Agent {agent_id}: {anomaly_result['direction']} in {metric}")
                
                # We have a mathematical anomaly. Time to invoke Phase 3!
                # 2. Phase 3: Diagnostic RAG Pipeline (Context Gathering & LLM)
                # insight_summary = await diagnostic_service.analyze(anomaly_result)
                
                # 3. Phase 4: Notification Routing
                # await notification_service.send_slack_alert(agent, insight_summary)
                pass
            else:
                logger.info(f"✅ Data looks normal for Agent {agent_id}. Exiting task cheaply.")
                
        except Exception as e:
             logger.error(f"Task failed for agent {agent_id}: {str(e)}")