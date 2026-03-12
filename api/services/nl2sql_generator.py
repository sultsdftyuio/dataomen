# api/services/nl2sql_generator.py

import logging
import json
import re
import numpy as np
from numpy.linalg import norm
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

# Setup structured logger for high-performance monitoring
logger = logging.getLogger(__name__)

class NL2SQLOutput(BaseModel):
    """
    Structured output schema for the LLM to guarantee parsable execution plans.
    Enforces the 'Reasoning' step before generation to improve mathematical accuracy.
    """
    reasoning: str = Field(
        ..., 
        description="Step-by-step logic explaining the SQL strategy, join path, and DuckDB functions used."
    )
    sql_query: str = Field(
        ..., 
        description="The highly optimized, read-only DuckDB SQL query."
    )
    chart_spec: Optional[Dict[str, Any]] = Field(
        None, 
        description="A valid, declarative Vega-Lite JSON specification if a visual is requested. Must map to SQL aliases."
    )

class NL2SQLGenerator:
    """
    Phase 3: Hybrid Contextual RAG & NL2SQL Engine
    
    This engine translates natural language into blazing-fast DuckDB SQL queries.
    It employs a 'Semantic Fragment Injection' strategy:
    1. Retrieval: Uses Vector Embeddings + Keyword Overlap to prune massive schemas.
    2. Grounding: Injects real categorical samples into the prompt to prevent filter hallucinations.
    3. Orchestration: Supports Gold-Tier Semantic Views (pre-built metrics).
    """

    def __init__(self, llm_client: Any = None):
        """
        Dependency injection for the LLM client (Modular Strategy).
        :param llm_client: Must implement 'embed', 'embed_batch', and 'generate_structured'.
        """
        self.llm = llm_client
        self.max_columns_per_context = 20  # Threshold to prevent token bloat and hallucination

    # --------------------------------------------------
    # Mathematical Foundations
    # --------------------------------------------------

    def _cosine_similarity(self, v1: np.ndarray, v2: np.ndarray) -> float:
        """Calculates strict vector similarity to match user intent with schema structure."""
        if norm(v1) == 0 or norm(v2) == 0:
            return 0.0
        return float(np.dot(v1, v2) / (norm(v1) * norm(v2)))

    # --------------------------------------------------
    # Fragment Retrieval Logic
    # --------------------------------------------------

    async def _select_relevant_columns(
        self,
        prompt: str,
        columns: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """
        DETERMINISTIC + SEMANTIC PRUNING:
        Selects columns based on a weighted hybrid of vector similarity and keyword overlap.
        Includes categorical samples to ground the LLM in real data values.
        """
        if len(columns) <= self.max_columns_per_context:
            return columns

        keywords = set(re.findall(r'\w+', prompt.lower()))
        embedding_scores = {}

        # Strategy A: Vector Semantic Ranking (Hybrid Performance)
        if hasattr(self.llm, "embed") and hasattr(self.llm, "embed_batch"):
            try:
                prompt_emb = np.array(await self.llm.embed(prompt))
                docs = []
                col_names = []

                for name, info in columns.items():
                    # Create a semantic document for each column
                    doc = f"column {name} type {info.get('type')} description {info.get('description','')}"
                    docs.append(doc)
                    col_names.append(name)

                col_embs = await self.llm.embed_batch(docs)
                for i, emb in enumerate(col_embs):
                    sim = self._cosine_similarity(prompt_emb, np.array(emb))
                    embedding_scores[col_names[i]] = sim
            except Exception as e:
                logger.warning(f"Vector retrieval failed: {e}. Falling back to deterministic heuristics.")

        # Strategy B: Deterministic Scoring
        scored = []
        for col_name, info in columns.items():
            score = 0
            
            # Identity match (High Weight)
            if col_name.lower() in keywords:
                score += 10
            
            # Semantic meta match
            description = info.get("description", "").lower()
            if any(k in description for k in keywords):
                score += 5
            
            # Time-series intent heuristic
            col_type = str(info.get("type", "")).upper()
            if any(k in ["date", "time", "year", "month", "day", "trend"] for k in keywords) and "DATE" in col_type:
                score += 6
            
            # Aggregate Vector Score
            score += embedding_scores.get(col_name, 0) * 15
            
            scored.append((score, col_name, info))

        # Sort by relevance and take the top N fragments
        scored.sort(key=lambda x: x[0], reverse=True)
        top_fragments = scored[:self.max_columns_per_context]

        return {
            name: {
                "type": info.get("type", "UNKNOWN"),
                "samples": info.get("samples", []), # Essential for categorical grounding
                "description": info.get("description", "")
            }
            for _, name, info in top_fragments
        }

    async def _build_contextual_schema(self, prompt: str, schemas: List[Dict[str, Any]]) -> str:
        """
        Builds the heavily compressed, sample-enriched JSON context block for the LLM.
        """
        minimized = []
        for schema in schemas:
            table_id = schema.get("id", "unknown_dataset")
            friendly_name = schema.get("name", "Unknown Dataset")
            
            # Support both legacy structure and new enriched metadata
            raw_meta = schema.get("schema_metadata", schema.get("schema", {}))
            if isinstance(raw_meta, dict) and "columns" in raw_meta:
                col_data = raw_meta["columns"]
            else:
                col_data = raw_meta # Fallback to flat dict

            relevant_columns = await self._select_relevant_columns(prompt, col_data)

            minimized.append({
                "table_name": f'"{table_id}"',
                "friendly_name": friendly_name,
                "relevant_columns": relevant_columns
            })
            
        return json.dumps(minimized, indent=2)

    def _build_system_prompt(self, contextual_schema: str, semantic_views: Optional[Dict[str, Any]] = None) -> str:
        """
        Constructs the high-constraint system prompt.
        Enforces Vectorization, Security by Design, and Mathematical Precision.
        """
        views_context = ""
        if semantic_views:
            views_json = json.dumps(semantic_views, indent=2)
            views_context = f"\nVERIFIED METRIC VIEWS (GOLD TIER - PREFER THESE):\nUse these pre-calculated CTEs for complex metrics:\n{views_json}\n"

        return f"""You are a Lead Data Engineer and DuckDB SQL optimizer for a high-performance Analytical SaaS.
Your objective is to translate natural language into execution-ready, read-only DuckDB SQL.

SCHEMA CONTEXT (Sample-enriched fragments):
{contextual_schema}
{views_context}

CRITICAL ENGINEERING RULES:
1. SECURITY BY DESIGN (READ-ONLY): You must NEVER output INSERT, UPDATE, DELETE, DROP, or ALTER. `SELECT` or `WITH` statements only.
2. NO HALLUCINATIONS: You may ONLY select columns/tables present in the fragments above.
3. DATA GROUNDING: Use the 'samples' provided in the schema to write correct filter values (e.g. if samples are ['ACTIVE', 'INACTIVE'], don't use 'active').
4. MATHEMATICAL PRECISION & VECTORIZATION:
   - For trends/stats, do not use simple loops. Utilize DuckDB vectorized functions: `corr()`, `regr_slope()`, `stddev_pop()`, `approx_count_distinct()`.
   - Use `date_trunc`, `strptime`, and `list_aggregate` natively.
5. TABLE REFERENCING: Table names are UUIDs; ALWAYS wrap them in double quotes: "dataset_uuid".

CHARTING RULES (Vega-Lite):
- If the prompt implies a visual, provide a declarative Vega-Lite JSON spec in `chart_spec`.
- Field names in Vega-Lite MUST match your SQL output aliases exactly.
"""

    def _validate_security(self, sql: str) -> None:
        """
        Security Layer: Advanced AST-adjacent validation.
        Strips literals to prevent false positives and blocks multi-statement injection.
        """
        stripped = sql.strip()
        
        # 1. Read-only start
        if not re.match(r'^(?i)(SELECT|WITH)\b', stripped):
            raise ValueError("Security Violation: Query must initiate with SELECT or WITH.")
            
        # 2. Prevent semicolon injection
        if ';' in stripped.rstrip(';'):
            raise ValueError("Security Violation: Multi-statement execution is prohibited.")
            
        # 3. Strip literals to evaluate code structure only
        no_literals = re.sub(r"'.*?'", "''", stripped)
        
        # 4. Strict mutation block
        dangerous = re.compile(
            r'\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|EXECUTE|TRUNCATE|COPY)\b', 
            re.IGNORECASE
        )
        if dangerous.search(no_literals):
            raise ValueError("Security Violation: Destructive DML/DDL operation detected.")

    # --------------------------------------------------
    # Public Interface
    # --------------------------------------------------

    async def generate_sql(
        self, 
        prompt: str, 
        schemas: List[Dict[str, Any]], 
        semantic_views: Optional[Dict[str, Any]] = None,
        history: List[Dict[str, Any]] = None
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Generates optimized DuckDB SQL based on Hybrid RAG context.
        """
        if not self.llm:
            raise RuntimeError("LLM client dependency not injected.")

        logger.info(f"Generating optimized SQL execution plan for prompt: '{prompt[:50]}...'")
        
        # Build deterministic context
        contextual_schema = await self._build_contextual_schema(prompt, schemas)
        system_prompt = self._build_system_prompt(contextual_schema, semantic_views)
        
        try:
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=prompt,
                history=history or [],
                response_model=NL2SQLOutput
            )
            
            # Final security gate
            self._validate_security(result.sql_query)
            
            return result.sql_query, result.chart_spec
            
        except Exception as e:
            logger.error(f"NL2SQL Generation failed: {str(e)}")
            raise RuntimeError(f"Could not generate analytical execution plan: {str(e)}")

    async def correct_sql(
        self, 
        failed_query: str, 
        error_msg: str, 
        prompt: str,
        schemas: List[Dict[str, Any]],
        semantic_views: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Phase 4: Error Feedback Loop.
        Automatically fixes syntax or hallucination errors based on compiler feedback.
        """
        logger.warning(f"Initiating SQL auto-correction for engine error: {error_msg}")
        
        contextual_schema = await self._build_contextual_schema(prompt, schemas)
        system_prompt = self._build_system_prompt(contextual_schema, semantic_views)
        
        correction_prompt = f"""
        The following DuckDB SQL query failed:
        {failed_query}
        
        ERROR MESSAGE:
        {error_msg}
        
        ORIGINAL INTENT:
        "{prompt}"
        
        TASK:
        Fix the SQL query. Ensure all column names match the schema fragments.
        Output corrected SQL and a valid chart spec.
        """
        
        try:
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=correction_prompt,
                history=[],
                response_model=NL2SQLOutput
            )
            
            self._validate_security(result.sql_query)
            return result.sql_query, result.chart_spec
            
        except Exception as e:
            logger.critical(f"Cascade failure in SQL auto-correction: {str(e)}")
            raise RuntimeError("Unable to self-correct the query based on database feedback.")

# Global Singleton Export
nl2sql_generator = NL2SQLGenerator()