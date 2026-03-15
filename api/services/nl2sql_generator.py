import logging
import json
import re
import numpy as np
from numpy.linalg import norm
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

# Enterprise Security Upgrade: AST Parsing
import sqlglot
from sqlglot import exp

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
    confidence_score: float = Field(
        ...,
        description="A score between 0.0 and 1.0 indicating how confident the model is that the query accurately answers the prompt without hallucinated columns."
    )

class NL2SQLGenerator:
    """
    Phase 3 & 4: Enterprise Contextual RAG & Auto-Correcting NL2SQL Engine
    
    Upgraded Engineering:
    - Deep AST Security Parsing: Traverses the full tree to guarantee 100% read-only operations.
    - Semantic Fragment Injection: Prunes massive SaaS schemas using Vector + Keyword + Categorical overlap.
    - SaaS-Aware Generation: Built-in context for handling complex JSON/Struct types from Stripe and Shopify.
    - Compiler-Aware Correction: Analyzes DuckDB errors to provide precise hints to the LLM during retries.
    """

    def __init__(self, llm_client: Any = None):
        """
        Dependency injection for the LLM client (Modular Strategy).
        :param llm_client: Must implement 'embed', 'embed_batch', and 'generate_structured'.
        """
        self.llm = llm_client
        self.max_columns_per_context = 25  # Threshold to prevent token bloat and hallucination on massive SaaS schemas

    # --------------------------------------------------
    # Mathematical Foundations
    # --------------------------------------------------

    def _cosine_similarity(self, v1: np.ndarray, v2: np.ndarray) -> float:
        """Calculates strict vector similarity to match user intent with schema structure."""
        if norm(v1) == 0 or norm(v2) == 0:
            return 0.0
        return float(np.dot(v1, v2) / (norm(v1) * norm(v2)))

    # --------------------------------------------------
    # Fragment Retrieval Logic (Contextual RAG)
    # --------------------------------------------------

    async def _select_relevant_columns(
        self,
        prompt: str,
        columns: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """
        DETERMINISTIC + SEMANTIC PRUNING:
        Selects columns based on a weighted hybrid of vector similarity, keyword overlap, and analytical utility.
        """
        if len(columns) <= self.max_columns_per_context:
            return columns

        prompt_lower = prompt.lower()
        keywords = set(re.findall(r'\w+', prompt_lower))
        embedding_scores = {}

        # Strategy A: Vector Semantic Ranking (Hybrid Performance)
        if self.llm and hasattr(self.llm, "embed") and hasattr(self.llm, "embed_batch"):
            try:
                prompt_emb = np.array(await self.llm.embed(prompt))
                docs = []
                col_names = []

                for name, info in columns.items():
                    # Create a rich semantic document for each column including samples
                    samples_str = ", ".join([str(s) for s in info.get('samples', [])[:3]])
                    doc = f"Column: {name}. Type: {info.get('type')}. Description: {info.get('description','')}. Examples: {samples_str}"
                    docs.append(doc)
                    col_names.append(name)

                col_embs = await self.llm.embed_batch(docs)
                for i, emb in enumerate(col_embs):
                    sim = self._cosine_similarity(prompt_emb, np.array(emb))
                    embedding_scores[col_names[i]] = sim
            except Exception as e:
                logger.warning(f"Vector retrieval failed: {e}. Falling back to deterministic heuristics.")

        # Strategy B: Advanced Deterministic Scoring
        scored = []
        for col_name, info in columns.items():
            score = 0
            col_lower = col_name.lower()
            col_type = str(info.get("type", "")).upper()
            
            # 1. Exact Identity match (High Weight)
            if col_lower in keywords:
                score += 15
            
            # 2. Partial string match
            if any(k in col_lower for k in keywords if len(k) > 3):
                score += 5
            
            # 3. Semantic meta match (Description)
            description = info.get("description", "").lower()
            if any(k in description for k in keywords if len(k) > 3):
                score += 8
            
            # 4. Time-series / Forecasting intent heuristic
            if any(k in ["date", "time", "year", "month", "day", "trend", "predict", "forecast"] for k in keywords):
                if any(t in col_type for t in ["DATE", "TIMESTAMP", "TIME"]):
                    score += 10 # Heavily boost temporal columns if time is mentioned
            
            # 5. Continuous Metric heuristic (if user asks for sums, averages, stats)
            if any(k in ["total", "sum", "average", "revenue", "count", "metrics", "stats"] for k in keywords):
                if any(t in col_type for t in ["INT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC"]):
                    score += 8
                    
            # 6. ID/Foreign Key boost (Essential for SaaS joins like Stripe Customer -> Invoice)
            if col_lower.endswith("_id") or col_lower == "id":
                score += 4

            # 7. Aggregate Vector Score
            score += embedding_scores.get(col_name, 0) * 20
            
            scored.append((score, col_name, info))

        # Sort by relevance and take the top N fragments
        scored.sort(key=lambda x: x[0], reverse=True)
        top_fragments = scored[:self.max_columns_per_context]

        return {
            name: {
                "type": info.get("type", "UNKNOWN"),
                "samples": info.get("samples", [])[:5], # Max 5 samples for grounding
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
            
            # Handle standardized SaaS schema structure
            raw_meta = schema.get("schema_metadata", schema.get("schema", {}))
            if isinstance(raw_meta, dict) and "columns" in raw_meta:
                col_data = {col["name"]: {"type": col.get("type"), "samples": col.get("samples", [])} for col in raw_meta["columns"]}
            else:
                col_data = raw_meta # Fallback to flat dict

            if not col_data:
                continue

            relevant_columns = await self._select_relevant_columns(prompt, col_data)

            minimized.append({
                "table_identifier": f'"{table_id}"',
                "table_alias": friendly_name.replace(" ", "_").lower(),
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
            views_context = f"\nVERIFIED METRIC VIEWS (GOLD TIER):\nUse these pre-calculated CTEs for complex metrics:\n{views_json}\n"

        return f"""You are an elite Data Engineer and DuckDB SQL optimizer for a high-performance Analytical SaaS.
Your objective is to translate natural language into execution-ready, highly optimized, read-only DuckDB SQL.

SCHEMA CONTEXT (Sample-enriched semantic fragments):
{contextual_schema}
{views_context}

CRITICAL ENGINEERING RULES:
1. SECURITY BY DESIGN (READ-ONLY): You must NEVER output INSERT, UPDATE, DELETE, DROP, ALTER, or GRANT. `SELECT` or `WITH` statements only.
2. NO HALLUCINATIONS: You may ONLY select columns/tables present in the fragments above. If the data does not exist, use COALESCE or simple math, but do not invent column names.
3. DATA GROUNDING: Use the 'samples' provided in the schema to write correct filter values. Case sensitivity matters (e.g. if samples are ['ACTIVE', 'INACTIVE'], don't filter by 'active').
4. SAAS JSON/STRUCT HANDLING: Stripe and Shopify data often contains nested STRUCTs or LISTs. 
   - Use DuckDB's native UNNEST() for arrays.
   - Use dot notation (e.g., column_name.nested_field) for Structs.
5. MATHEMATICAL PRECISION & VECTORIZATION:
   - For trends/stats, do not use simple loops. Utilize DuckDB vectorized functions: `corr()`, `regr_slope()`, `stddev_pop()`, `approx_count_distinct()`.
   - Use `date_trunc('month', date_col)`, `strptime`, and `list_aggregate` natively.
6. TABLE REFERENCING: Table names are UUIDs; ALWAYS wrap them in double quotes exactly as shown in 'table_identifier' (e.g., FROM "123e4567-e89b...").
7. DIALECT: Output strict DuckDB SQL.

CHARTING RULES (Vega-Lite):
- If the prompt implies a visual, provide a declarative Vega-Lite JSON spec in `chart_spec`.
- Field names in Vega-Lite MUST match your SQL output aliases exactly.
- Use 'area' or 'line' marks for time-series, and 'bar' for categorical aggregations.
"""

    def _validate_security(self, sql: str) -> None:
        """
        Enterprise Deep-AST Security Validator.
        Uses sqlglot to traverse the full query tree and mathematically guarantee 
        it contains zero destructive operations.
        """
        try:
            # Parse the SQL specifically using DuckDB dialect rules
            parsed_statements = sqlglot.parse(sql, read="duckdb")
            
            for statement in parsed_statements:
                if statement is None:
                    continue
                    
                # 1. Root Level Check
                if not isinstance(statement, (exp.Select, exp.Subquery)):
                    logger.critical(f"AST Security Violation Blocked: Expected SELECT root, got {type(statement).__name__}")
                    raise ValueError("Security Violation: Only SELECT/WITH statements are permitted.")
                
                # 2. Deep Traversal Blocklist (Hunts for nested injection attacks)
                for node in statement.walk():
                    node_type = type(node[0])
                    if node_type in (
                        exp.Drop, exp.Delete, exp.Update, exp.Insert, 
                        exp.AlterTable, exp.Command, exp.Commit, exp.Rollback,
                        exp.Create, exp.Grant, exp.Pragma
                    ):
                        logger.critical(f"Deep AST Security Violation: Destructive node {node_type.__name__} found inside query.")
                        raise ValueError(f"Security Violation: Destructive operations ({node_type.__name__}) are strictly forbidden.")
                    
        except sqlglot.errors.ParseError as e:
            logger.error(f"SQL Syntax/AST Parse Error: {str(e)}")
            raise ValueError(f"Security Violation: Query is malformed or attempts obfuscation. Details: {str(e)}")

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
        Phase 3: Generates optimized DuckDB SQL based on Hybrid RAG context.
        """
        if not self.llm:
            logger.error("LLM Client not injected. Cannot generate SQL.")
            raise RuntimeError("LLM client dependency not injected into NL2SQL engine.")

        logger.info(f"Generating optimized SQL execution plan for prompt: '{prompt[:50]}...'")
        
        contextual_schema = await self._build_contextual_schema(prompt, schemas)
        system_prompt = self._build_system_prompt(contextual_schema, semantic_views)
        
        try:
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=prompt,
                history=history or [],
                response_model=NL2SQLOutput
            )
            
            # Enterprise AST security gate
            self._validate_security(result.sql_query)
            
            if result.confidence_score < 0.4:
                logger.warning(f"Low confidence SQL generation ({result.confidence_score}). Potential hallucination risk.")
            
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
        Phase 4: Intelligent Error Feedback Loop.
        Automatically fixes syntax or hallucination errors based on DuckDB compiler feedback.
        """
        logger.warning(f"Initiating SQL auto-correction for engine error: {error_msg}")
        
        contextual_schema = await self._build_contextual_schema(prompt, schemas)
        system_prompt = self._build_system_prompt(contextual_schema, semantic_views)
        
        # Determine hint based on common DuckDB compiler errors
        hint = ""
        error_lower = error_msg.lower()
        if "binder error" in error_lower or "column" in error_lower and "not found" in error_lower:
            hint = "HINT: You likely hallucinated a column name, or tried to access a nested JSON/Struct field without unnesting it. Check the exact schema provided."
        elif "parser error" in error_lower or "syntax error" in error_lower:
            hint = "HINT: You have a syntax error. Ensure you are using strict DuckDB SQL syntax, not Postgres or MySQL."
        elif "function" in error_lower and "does not exist" in error_lower:
            hint = "HINT: You used a function that doesn't exist in DuckDB. Use DuckDB natives like `date_trunc`, `approx_count_distinct`, or `list_aggregate`."
        
        correction_prompt = f"""
        The following DuckDB SQL query failed to execute:
        ```sql
        {failed_query}
        ```
        
        DUCKDB ENGINE ERROR:
        {error_msg}
        
        {hint}
        
        ORIGINAL USER INTENT:
        "{prompt}"
        
        TASK:
        1. Read the error message carefully.
        2. Look at the provided SCHEMA CONTEXT to find the correct column names and types.
        3. Fix the SQL query. 
        4. Output the corrected, highly-optimized SQL and a valid chart spec.
        """
        
        try:
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=correction_prompt,
                history=[],
                response_model=NL2SQLOutput
            )
            
            # Enterprise AST security gate
            self._validate_security(result.sql_query)
            return result.sql_query, result.chart_spec
            
        except Exception as e:
            logger.critical(f"Cascade failure in SQL auto-correction: {str(e)}")
            raise RuntimeError(f"Unable to self-correct the query. Terminal Database Error: {error_msg}")

# Note: The global singleton should be initialized with your actual LLM client instance
# in your application factory or dependency injection container.
# Example: nl2sql_generator = NL2SQLGenerator(llm_client=OpenAIClient())
nl2sql_generator = NL2SQLGenerator()