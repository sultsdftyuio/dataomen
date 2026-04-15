"""
ARCLI.TECH - Intelligence Layer
Component: Omni-Graph Query Planner & Semantic Budget Governor
Strategy: Semantic Routing, Schema Pruning, Contextual RAG & Semantic Budgeting
"""

import logging
import ast
import json
import time
import asyncio
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_

# Arcli Core Infrastructure
from api.services.llm_client import LLMClient, llm_client as default_llm
from models import Dataset, Agent, SemanticMetric

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# DATA CONTRACTS
# -------------------------------------------------------------------------

class StrategyStep(BaseModel):
    """Planner IR step: explicit op + args contract with legacy compatibility fields."""
    op: Optional[str] = Field(default=None, description="Canonical op: scan|project|join|filter|aggregate|sort|limit.")
    args: Dict[str, Any] = Field(default_factory=dict, description="Typed operation payload.")
    output_schema: Optional[List[str]] = Field(default=None, description="Optional projected output schema for lineage/debugging.")

    # Legacy fields kept for backward compatibility while migrating prompts/plans.
    operation: Optional[str] = Field(default=None, description="Deprecated alias for `op`.")
    target: Optional[str] = Field(default=None, description="Canonical join target identifier (prefer dataset UUID).")
    on: Optional[str] = Field(default=None, description="Canonical join predicate, e.g. 'base.customer_id = orders.customer_id'.")
    columns: List[str] = Field(default_factory=list, description="Target columns or expressions for this operation.")
    description: str = Field(default="", description="Plain-English reasoning for this execution step.")

    # Backward compatibility fields for older prompts/plans.
    target_dataset: Optional[str] = Field(default=None, description="Deprecated alias for `target`.")
    join_keys: Optional[Dict[str, str]] = Field(default=None, description="Deprecated alias for `on`.")
    aggregation_intent: Optional[str] = Field(default=None, description="Explicit SQL aggregation intent. Example: 'SUM(revenue) GROUP BY date'.")

class QueryPlan(BaseModel):
    """
    The Strategic Blueprint for the AI Data Copilot.
    Strictly typed for declarative orchestration and guaranteed JSON compliance.
    """
    intent_summary: str = Field(
        ..., 
        description="A precise, 1-sentence summary of the user's analytical goal."
    )
    execution_intent: str = Field(
        ..., 
        description="MUST BE EXACTLY ONE OF: 'ANALYTICAL' (SQL math/aggregations), 'DOCUMENT_RAG' (Text extraction), or 'HYBRID'."
    )
    
    # Omni-Graph Support
    target_dataset_ids: List[str] = Field(
        default_factory=list, 
        description="List of exact UUIDs of the structured datasets required to fulfill the intent."
    )
    document_ids: List[str] = Field(
        default_factory=list, 
        description="List of exact UUIDs of unstructured documents, if applicable."
    )
    
    # Semantic Query Layer
    context_filters: Dict[str, Any] = Field(
        default_factory=dict, 
        description="Global filters extracted from context (e.g., {'tier': 'Enterprise', 'date_range': 'last_30_days'})."
    )
    
    requested_governed_metrics: List[str] = Field(
        default_factory=list, 
        description="Names of Governed Metrics (e.g., 'True ROAS') mapped from the Semantic Catalog."
    )
    analytical_strategy: List[StrategyStep] = Field(
        default_factory=list, 
        description="Structured, step-by-step logical operations the execution engine must follow."
    )
    confidence_score: float = Field(
        ..., 
        description="0.0 to 1.0 confidence that the provided schema fully answers the query."
    )
    is_budget_exceeded: bool = Field(
        default=False, 
        description="Flag triggered if the required Omni-Graph join exceeds the Semantic Budget."
    )

# -------------------------------------------------------------------------
# THE INTELLIGENCE ORCHESTRATOR
# -------------------------------------------------------------------------

class QueryPlanner:
    """
    Phase 3: Semantic Router & Strategy Engine.
    
    Engineering Upgrades (v2.0):
    1. Async Event-Loop Safety & Thread-pooling.
    2. Zero-Trust Security on target datasets (Registry verification).
    3. Progressive Semantic Schema Pruning (Preserves Foreign/Primary Keys).
    4. Safe SQL Hydration & Prompt Injection mitigation.
    5. Explicit Omni-Graph Join Constraints & Structural Join Hints.
    6. Selectivity-aware Cost Modeling (Partition pruning & Index awareness).
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or default_llm
        self.MAX_SCHEMA_TOKENS = 8000
        self.MAX_JOIN_DEPTH = 2
        self.MAX_DATASETS = 3

    def _sanitize_text(self, val: str) -> str:
        """Prevents Prompt Injection via dirty schema strings."""
        return str(val).replace("{", "").replace("}", "").replace("<", "").replace(">", "")

    def _prune_schema(self, schema_context: Dict[str, Any], max_cols: int = 150) -> Dict[str, Any]:
        """Preserves semantic signal & critical relation keys while enforcing token budget."""
        pruned_schema = {}
        
        for ds_id, ds_meta in schema_context.items():
            if not isinstance(ds_meta, dict):
                continue
            
            columns_meta = ds_meta.get("columns", {})
            if not isinstance(columns_meta, dict):
                continue

            cols = list(columns_meta.items())

            # Rank by importance_score but ALWAYS preserve PKs, FKs, and standard ID columns
            def get_retention_score(col_tuple) -> float:
                name, meta = col_tuple
                if not isinstance(meta, dict):
                    return 0.0
                
                is_critical_key = (
                    meta.get("foreign_key_candidate") is True or
                    bool(meta.get("foreign_keys")) or
                    meta.get("is_primary_key") is True or 
                    meta.get("is_primary_key_candidate") is True or
                    name.lower() == "id" or
                    name.lower().endswith("_id")
                )
                return float('inf') if is_critical_key else float(meta.get("importance_score", 0))

            cols_sorted = sorted(cols, key=get_retention_score, reverse=True)
            
            # Sanitize keys/values for security
            clean_cols = {}
            for k, v in cols_sorted[:max_cols]:
                clean_k = self._sanitize_text(k)
                if isinstance(v, dict):
                    clean_cols[clean_k] = {self._sanitize_text(sk): self._sanitize_text(sv) for sk, sv in v.items()}
                else:
                    clean_cols[clean_k] = self._sanitize_text(v)
            
            pruned_schema[ds_id] = {
                **ds_meta,
                "columns": clean_cols
            }
            
        return pruned_schema

    async def plan_execution(
        self, 
        db: Session, 
        tenant_id: str, 
        agent: Agent, 
        natural_query: str,
        schema_hints: Dict[str, Any]
    ) -> QueryPlan:
        """
        Analyzes a natural language question against authorized schemas.
        Generates a secure, performant routing strategy.
        """
        start_time = time.perf_counter()
        logger.info(f"🧠 [{tenant_id}] Planning Omni-Graph execution for agent '{agent.id}'")

        # 1. Zero-Trust Trust Boundary: Discard LLM-influenced UI hints and load ground-truth from DB.
        target_ids = list(schema_hints.keys())
        if agent.dataset_id and str(agent.dataset_id) not in target_ids:
            target_ids.append(str(agent.dataset_id))

        trusted_registry = await asyncio.to_thread(
            self._fetch_trusted_registry, db, tenant_id, target_ids
        )

        # 2. Semantic Budgeting (Token Efficiency & Pruning against Ground-Truth)
        schema_string = json.dumps(trusted_registry, separators=(',', ':'))
        estimated_tokens = len(schema_string) / 4.0 
        
        if estimated_tokens > self.MAX_SCHEMA_TOKENS:
            logger.warning(f"[{tenant_id}] Schema Context ({estimated_tokens:.0f} tokens). Enforcing progressive pruning.")
            active_schema_context = self._prune_schema(trusted_registry, max_cols=150)
        else:
            active_schema_context = trusted_registry

        # 3. Extract Governed Metrics Safely (Offload sync DB I/O)
        governed_metrics = await asyncio.to_thread(
            self._fetch_governed_metrics, db, tenant_id, agent.dataset_id
        )
        metrics_context = [
            {
                "name": m.metric_name, 
                "description": m.description,
                "grain": getattr(m, 'grain', 'N/A'),
                "formula_hint": getattr(m, 'compiled_sql', '')[:200]
            } for m in governed_metrics
        ]

        # 4. Inject Structured Join Path Reasoning (Only from Trusted Registry)
        join_hints = []
        seen_join_hints = set()
        for ds_id, ds in trusted_registry.items():
            if not isinstance(ds, dict):
                continue

            fk_relations = []

            top_level_fks = ds.get("foreign_keys", [])
            if isinstance(top_level_fks, list):
                fk_relations.extend([fk for fk in top_level_fks if isinstance(fk, dict)])

            cols = ds.get("columns", {})
            if isinstance(cols, dict):
                for c, v in cols.items():
                    if not isinstance(v, dict):
                        continue

                    col_fks = v.get("foreign_keys", [])
                    if isinstance(col_fks, list) and col_fks:
                        for fk in col_fks:
                            if not isinstance(fk, dict):
                                continue
                            fk_relations.append({
                                "column": fk.get("column", c),
                                "target_table": fk.get("target_table"),
                                "target_column": fk.get("target_column", "id"),
                            })
                    elif v.get("foreign_key_candidate"):
                        inferred_target = c[:-3] if c.lower().endswith("_id") else str(c)
                        fk_relations.append({
                            "column": c,
                            "target_table": v.get("foreign_key_target_table") or inferred_target,
                            "target_column": v.get("foreign_key_target_column", "id"),
                        })

            for fk in fk_relations:
                src_col = fk.get("column")
                target_table = fk.get("target_table")
                target_col = fk.get("target_column", "id")

                if not src_col or not target_table:
                    continue

                hint_key = (str(ds_id), str(src_col), str(target_table), str(target_col))
                if hint_key in seen_join_hints:
                    continue

                seen_join_hints.add(hint_key)
                join_hints.append({
                    "from": f"{ds_id}.{src_col}",
                    "to": f"{target_table}.{target_col}",
                    "confidence": 1.0,  # Derived from trusted metadata
                })

        # 5. First Execution Pass via Structured RAG
        system_prompt = self._build_system_prompt(agent, active_schema_context, metrics_context, join_hints)

        try:
            plan = await self._call_llm_planner(natural_query, system_prompt)
        except Exception as e:
            logger.warning(f"[{tenant_id}] LLM Plan Failed, retrying with strict pruned schema. Error: {str(e)}")
            # Retry loop with extreme schema pruning
            try:
                pruned_schema = self._prune_schema(trusted_registry, max_cols=50)
                retry_prompt = self._build_system_prompt(agent, pruned_schema, metrics_context, join_hints)
                plan = await self._call_llm_planner(natural_query, retry_prompt)
            except Exception as nested_e:
                logger.error(f"❌ [{tenant_id}] Query planning completely failed: {str(nested_e)}")
                return self._generate_fallback_plan(agent)

        # 6. Zero-Trust Output Validation & Selectivity-Aware Budgeting
        plan = self._normalize_strategy_steps(plan)
        
        # Hard filter datasets against explicitly authorized inputs
        plan.target_dataset_ids = [ds_id for ds_id in plan.target_dataset_ids if ds_id in trusted_registry]
        
        # Always enforce the agent's core dataset if applicable
        if agent.dataset_id and str(agent.dataset_id) not in plan.target_dataset_ids:
            plan.target_dataset_ids.append(str(agent.dataset_id))
            
        # Selectivity-Aware Cost Modeling (Index & Partition awareness)
        estimated_cost = 0
        for ds_id in plan.target_dataset_ids:
            ds = trusted_registry.get(ds_id, {})
            row_cnt = int(ds.get("row_count", 0) or 1000)
            col_cnt = max(len(ds.get("columns", {})), 1)

            filters_keys = [k.lower() for k in plan.context_filters.keys()]

            has_partition_filter = any(key in ['date', 'time', 'timestamp', 'created_at'] for key in filters_keys)
            has_index_filter = any('id' in key or 'uuid' in key for key in filters_keys)

            avg_selectivity = ds.get("avg_selectivity")
            if isinstance(avg_selectivity, (int, float)):
                base_selectivity = max(0.01, min(float(avg_selectivity), 1.0))
            else:
                density = col_cnt / max(row_cnt, 1)
                base_selectivity = max(0.05, min(density, 1.0))

            filter_factor = 1.0
            if has_partition_filter:
                filter_factor *= 0.5
            if has_index_filter:
                filter_factor *= 0.25

            selectivity = max(0.01, min(base_selectivity * filter_factor, 1.0))

            # Penalize multi-way joins
            join_penalty = 1.0 + (0.5 * len(plan.target_dataset_ids))
            effective_rows = max(1, row_cnt * selectivity)
            
            estimated_cost += (effective_rows * col_cnt * join_penalty)

        if estimated_cost > 1e8 or len(plan.target_dataset_ids) > self.MAX_DATASETS:
            plan.is_budget_exceeded = True
            plan.confidence_score *= 0.7
            logger.warning(f"[{tenant_id}] Execution cost exceeded (Cost: {estimated_cost:.0f}). Confidence penalized.")

        if not plan.target_dataset_ids:
            plan.confidence_score *= 0.5

        if plan.execution_intent not in ["ANALYTICAL", "DOCUMENT_RAG", "HYBRID"]:
            plan.confidence_score = 0.0

        # Intent Validation Layer: Downgrade analytical intent if no datasets present
        if plan.execution_intent == "ANALYTICAL" and not plan.target_dataset_ids:
            plan.execution_intent = "DOCUMENT_RAG"

        duration = time.perf_counter() - start_time
        logger.info(f"✅ [{tenant_id}] Strategy planned in {duration:.3f}s | Intent: {plan.execution_intent} | Confidence: {plan.confidence_score:.2f}")
        
        return plan

    async def _call_llm_planner(self, natural_query: str, system_prompt: str) -> QueryPlan:
        return await self.llm_client.generate_structured(
            system_prompt=system_prompt,
            prompt=f"USER INTENT: {self._sanitize_text(natural_query)}\nGenerate the optimal execution QueryPlan.",
            response_model=QueryPlan,
            temperature=0.0
        )

    def _normalize_strategy_steps(self, plan: QueryPlan) -> QueryPlan:
        """Normalizes legacy step payloads into canonical op/args contracts."""
        for step in plan.analytical_strategy:
            op = str(step.op or step.operation or "").strip().lower()
            if not op:
                step.op = "fallback"
                step.args = step.args or {}
                continue

            step.op = op

            if step.args:
                # Canonical args already provided by planner output.
                continue

            if op == "join":
                target_id = step.target or step.target_dataset

                join_expr = step.on
                if not join_expr and step.join_keys:
                    pair = next(iter(step.join_keys.items()), None)
                    if pair and pair[0] and pair[1]:
                        join_expr = f"{pair[0]} = {pair[1]}"

                if not join_expr and step.columns:
                    first_col = step.columns[0]
                    if isinstance(first_col, str) and "=" in first_col:
                        join_expr = first_col

                if target_id and join_expr and "=" in join_expr:
                    left_expr, right_expr = [v.strip() for v in join_expr.split("=", 1)]
                    step.args = {
                        "target_dataset_id": target_id,
                        "condition": {
                            "source_column": left_expr.split(".")[-1],
                            "target_column": right_expr.split(".")[-1],
                            "join_type": "LEFT",
                        },
                    }
                else:
                    step.args = {}

            elif op == "project":
                step.args = {"columns": list(step.columns)}

            elif op == "filter":
                parsed_predicates = []
                for token in step.columns:
                    parsed = self._parse_filter_token(token)
                    if parsed:
                        parsed_predicates.append(parsed)
                if parsed_predicates:
                    step.args = {
                        "expression": {
                            "combinator": "AND",
                            "predicates": parsed_predicates,
                        }
                    }
                else:
                    step.args = {}

            elif op == "sort":
                keys = []
                for token in step.columns:
                    parts = token.strip().split()
                    col_name = parts[0].split(".")[-1] if parts else ""
                    direction = parts[1].upper() if len(parts) > 1 else "ASC"
                    if col_name and direction in {"ASC", "DESC"}:
                        keys.append({"column": col_name, "direction": direction})
                step.args = {"keys": keys}

            elif op == "limit":
                if step.columns:
                    try:
                        step.args = {"value": int(step.columns[0])}
                    except Exception:
                        step.args = {}
                else:
                    step.args = {}

            elif op == "aggregate":
                step.args = {
                    "group_by": list(step.columns),
                    "metrics": [],
                }

        return plan

    def _parse_filter_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Converts simple legacy filter strings into typed predicate objects."""
        op_candidates = [">=", "<=", "!=", "=", ">", "<"]
        for op in op_candidates:
            if op in token:
                left, right = [v.strip() for v in token.split(op, 1)]
                if not left:
                    return None
                return {
                    "left": {"column": left.split(".")[-1]},
                    "operator": op,
                    "right": {"value": self._parse_literal_token(right)},
                }
        return None

    def _parse_literal_token(self, token: str) -> Any:
        cleaned = token.strip()
        if cleaned.startswith("'") and cleaned.endswith("'"):
            return cleaned[1:-1]
        if cleaned.startswith('"') and cleaned.endswith('"'):
            return cleaned[1:-1]
        lowered = cleaned.lower()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
        if lowered == "null":
            return None
        try:
            return ast.literal_eval(cleaned)
        except Exception:
            return cleaned

    async def get_duckdb_execution_context(
        self, 
        db: Session, 
        tenant_id: str, 
        plan: QueryPlan
    ) -> str:
        """
        Translates the abstract QueryPlan into physical DuckDB instructions.
        Crucially enforces Tenant Isolation on LLM-requested datasets.
        """
        if not plan.target_dataset_ids:
            return "-- No structured datasets targeted for this query execution."

        datasets = await asyncio.to_thread(
            self._fetch_authorized_datasets, db, tenant_id, plan.target_dataset_ids
        )
        
        if not datasets: 
            return "-- Datasets configuration missing or unauthorized."
        
        context_blocks = []
        for ds in datasets:
            parquet_path = f"read_parquet('{ds.file_path}/**/*.parquet')"
            cols = ds.schema_metadata.get("columns", {}) if ds.schema_metadata else {}
            col_desc = ", ".join([f"{name} {meta.get('type')}" for name, meta in cols.items()])
            
            # Anti-Collision alias builder using deterministic hash
            slug = "".join(e for e in ds.name.lower() if e.isalnum())
            table_alias = f"{slug}_{abs(hash(ds.id)) % 10000}"
            
            block = (
                f"-- Dataset: {ds.integration_name or ds.name}\n"
                f"-- Omni-Graph Alias: {table_alias}\n"
                f"-- Physical Source: {parquet_path}\n"
                f"-- Schema Bounds: {col_desc}"
            )
            context_blocks.append(block)
            
        if plan.context_filters:
            safe_filters = []
            for k, v in plan.context_filters.items():
                safe_k = "".join(c for c in str(k) if c.isalnum() or c == "_")
                safe_v = str(v).replace("'", "''") 
                safe_filters.append(f"{safe_k} = '{safe_v}'")
                
            filter_str = " AND ".join(safe_filters)
            context_blocks.append(f"-- GLOBAL STATE FILTERS TO APPLY: {filter_str}")
        
        return "\n\n".join(context_blocks)

    # -------------------------------------------------------------------------
    # INTERNAL HELPERS (Data Access & Formatting)
    # -------------------------------------------------------------------------

    def _fetch_trusted_registry(self, db: Session, tenant_id: str, dataset_ids: List[str]) -> Dict[str, Any]:
        datasets = self._fetch_authorized_datasets(db, tenant_id, dataset_ids)
        return {str(ds.id): (ds.schema_metadata or {}) for ds in datasets}

    def _fetch_governed_metrics(self, db: Session, tenant_id: str, dataset_id: Optional[str]) -> List[SemanticMetric]:
        return db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id,
            or_(
                SemanticMetric.dataset_id == dataset_id,
                SemanticMetric.dataset_id.is_(None)
            )
        ).all()

    def _fetch_authorized_datasets(self, db: Session, tenant_id: str, dataset_ids: List[str]) -> List[Dataset]:
        return db.query(Dataset).filter(
            Dataset.id.in_(dataset_ids),
            Dataset.tenant_id == tenant_id
        ).all()

    def _build_system_prompt(
        self, 
        agent: Agent, 
        schema_context: Dict[str, Any], 
        metrics_context: List[Dict[str, Any]], 
        join_hints: List[Dict[str, Any]]
    ) -> str:
        return f"""
You are the Arcli Execution Orchestrator.
Your objective is to map a user's analytical intent to the exact physical tables and governed semantic metrics provided.
        
AGENT DOMAIN: 
{self._sanitize_text(agent.role_description or 'Data Assistant')}
        
AUTHORIZED PHYSICAL SCHEMAS (TRUSTED REGISTRY):
{json.dumps(schema_context, separators=(',', ':'))}

GOVERNED SEMANTIC METRICS (THE GOLDEN CATALOG):
{json.dumps(metrics_context, separators=(',', ':'))}

JOIN HINTS (OMNI-GRAPH TOPOLOGY):
{json.dumps(join_hints, separators=(',', ':'))}

COMMANDMENTS:
1. CLASSIFICATION: 
   - 'ANALYTICAL': Math, revenue, time-series, or multi-source correlations.
   - 'DOCUMENT_RAG': Explanations, text synthesis.
2. GOLDEN METRICS OVER RAW SQL: If an intent matches a Semantic Metric, list it in `requested_governed_metrics`.
3. GLOBAL FILTERS: Extract overarching constraints (e.g., 'Only show US data') into `context_filters`.
4. OMNI-GRAPH AWARENESS: Utilize provided JOIN HINTS if multi-schema correlation is required.
5. DETERMINISTIC STRATEGY: Create explicit logic steps using this strict shape:
    - `op`: one of scan|project|join|filter|aggregate|sort|limit
    - `args`: typed payload for that op
    - `output_schema`: optional array of output columns
    - JOIN args format: {{"target_dataset_id":"<uuid>","condition":{{"source_column":"customer_id","target_column":"id","join_type":"LEFT"}}}}
    - FILTER args format: {{"expression":{{"combinator":"AND","predicates":[{{"left":{{"column":"status"}},"operator":"=","right":{{"value":"active"}}}}]}}}}
    - AGGREGATE args format: {{"group_by":["region"],"metrics":[{{"name":"total_revenue","function":"SUM","column":"revenue"}}]}}
6. BOUNDARY ENFORCEMENT: Never invent tables or columns. Drop confidence < 0.4 if the schema cannot fulfill the request.
7. EXECUTION LIMITS: MAX_DATASETS = {self.MAX_DATASETS}, MAX_JOIN_DEPTH = {self.MAX_JOIN_DEPTH}. Do not formulate plans exceeding these operational limits.
"""

    def _generate_fallback_plan(self, agent: Agent) -> QueryPlan:
        return QueryPlan(
            intent_summary="Fallback execution triggered due to contextual evaluation failure.",
            execution_intent="DOCUMENT_RAG",
            target_dataset_ids=[str(agent.dataset_id)] if agent.dataset_id else [],
            document_ids=[str(agent.document_id)] if agent.document_id else [],
            context_filters={},
            requested_governed_metrics=[],
            analytical_strategy=[
                StrategyStep(op="fallback", args={}, description="Execute fail-safe extraction query.")
            ],
            confidence_score=0.1,
            is_budget_exceeded=False
        )

# Global Singleton Instantiation
query_planner = QueryPlanner()