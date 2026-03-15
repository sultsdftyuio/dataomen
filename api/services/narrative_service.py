### api/services/narrative_service.py

import os
import json
import logging
import polars as pl
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Union
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# SDK Imports
from openai import AsyncOpenAI, OpenAIError
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Type Definitions & Schemas
# -----------------------------------------------------------------------------

class NarrativeResponse(BaseModel):
    """Ensures consistent, structured output for the frontend orchestrator."""
    summary: str
    insights: List[str]
    status: str = "success"

# -----------------------------------------------------------------------------
# Modular LLM Provider Interfaces
# -----------------------------------------------------------------------------

class BaseLLMProvider(ABC):
    """The Modular Strategy: Abstract LLM interface ensuring zero vendor lock-in."""
    @abstractmethod
    async def generate_text(self, system_prompt: str, user_prompt: str, temperature: float = 0.0) -> str:
        pass

class OpenAIProvider(BaseLLMProvider):
    def __init__(self, model: str = "gpt-4o-mini"):
        # Initialized with environment variables for multi-tenant security
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY")) 
        self.model = os.getenv("PRIMARY_LLM_MODEL", model)

    async def generate_text(self, system_prompt: str, user_prompt: str, temperature: float = 0.0) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        return response.choices[0].message.content.strip()

# -----------------------------------------------------------------------------
# Phase 8: Executive Narrative Service
# -----------------------------------------------------------------------------

class NarrativeService:
    """
    Phase 8: The Executive Storyteller.
    
    Transforms raw analytical result sets, AB test intel, and anomalies 
    into concise, strategic business narratives.
    
    Engineering Excellence:
    - Vectorized Pre-processing: Summarizes millions of rows into key statistical 
      shards via Polars before LLM injection.
    - Resilience: Implements exponential backoff and failover to ensure narrative 
      delivery even during LLM provider instability.
    """
    
    def __init__(self, primary_provider: BaseLLMProvider = None):
        self.primary_provider = primary_provider or OpenAIProvider()

    @retry(
        retry=retry_if_exception_type(OpenAIError),
        wait=wait_exponential(multiplier=1, min=2, max=10), 
        stop=stop_after_attempt(3)
    )
    async def _execute_generation(self, sys_prompt: str, user_prompt: str) -> str:
        """Centralized execution point with retry logic for network resilience."""
        return await self.primary_provider.generate_text(sys_prompt, user_prompt)

    def _generate_vectorized_summary(self, data: List[Dict[str, Any]]) -> str:
        """
        Computation (Execution): Statistical Pre-processor.
        Uses Polars (Vectorized) to calculate the mathematical 'shape' of the data.
        Compresses high-cardinality result sets into dense JSON stats for LLM context.
        """
        if not data:
            return "The result set is empty."

        try:
            df = pl.DataFrame(data)
            
            # Vectorized detection of numeric columns
            numeric_cols = [col for col, dtype in df.schema.items() 
                           if dtype in [pl.Float64, pl.Int64, pl.Float32, pl.Int32]]
            
            summary_stats = {}
            for col in numeric_cols:
                # Handle nulls gracefully during math operations to prevent NaN leakage
                valid_df = df.select(pl.col(col).drop_nulls())
                if not valid_df.is_empty():
                    summary_stats[col] = {
                        "total": float(valid_df[col].sum()),
                        "avg": float(valid_df[col].mean()),
                        "max": float(valid_df[col].max()),
                        "min": float(valid_df[col].min()),
                        "std_dev": float(valid_df[col].std()) if len(valid_df) > 1 else 0
                    }

            # Sample rows to give the LLM structural context without bloating tokens
            sample_rows = df.head(5).to_dicts()
            
            summary_json = json.dumps({
                "record_count": len(df),
                "columns": df.columns,
                "vectorized_metrics": summary_stats,
                "structural_sample": sample_rows
            }, indent=2)
            
            # Hard truncate at 3k characters to protect the LLM window
            return summary_json[:3000] 

        except Exception as e:
            logger.error(f"Vectorized summarization failed: {e}")
            return "Raw data summary unavailable; processing error encountered."

    # -------------------------------------------------------------------------
    # Public Narrative Methods
    # -------------------------------------------------------------------------

    async def generate_query_insight(self, query: str, data: List[Dict[str, Any]]) -> NarrativeResponse:
        """
        Generates a 'TL;DR' executive narrative for standard data queries.
        """
        data_context = self._generate_vectorized_summary(data)
        
        sys_prompt = (
            "You are a Lead Data Scientist at DataOmen. Your role is to transform "
            "SQL result statistics into high-level executive insights. Avoid technical jargon."
        )
        
        user_prompt = f"""
        USER QUESTION: "{query}"
        DATA STATS:
        {data_context}

        INSTRUCTIONS:
        1. Interpret the data's MEANING for the user's business.
        2. Identify the most significant trend or outlier.
        3. Format as a JSON with keys: "summary" (one punchy sentence) and "insights" (list of 2-3 specific points).
        """

        try:
            raw_response = await self._execute_generation(sys_prompt, user_prompt)
            # Attempt to parse JSON if LLM follows format, else wrap as text
            try:
                parsed = json.loads(raw_response)
                return NarrativeResponse(**parsed)
            except:
                return NarrativeResponse(
                    summary=raw_response.split('\n')[0],
                    insights=[line for line in raw_response.split('\n')[1:] if line.strip()]
                )
        except Exception as e:
            logger.error(f"Narrative generation failed: {e}")
            return NarrativeResponse(
                summary="Data analysis complete.",
                insights=["AI Narrative engine is currently cooling down. Please check raw results below."],
                status="error"
            )

    async def generate_anomaly_narrative(self, metric: str, variance: float, drivers: List[Dict[str, Any]]) -> NarrativeResponse:
        """
        Explains 'WHY' a metric deviated using mathematical variance drivers.
        """
        driver_str = "\n".join([f"- {d.get('dimension')}: {d.get('category')} ({d.get('percentage_change'):+.2f}%)" for d in drivers])
        
        sys_prompt = "You are a precise Root Cause Analysis agent. Analyze metric variances objectively."
        
        user_prompt = f"""
        ANOMALY: Metric '{metric}' shifted by {variance:+.2f}%.
        TOP DRIVERS:
        {driver_str}

        INSTRUCTIONS:
        - Explain the root cause based ONLY on the drivers provided. 
        - DO NOT hallucinate external market factors.
        - Provide a 1-sentence executive summary and 2 supporting bullet points.
        """

        raw_text = await self._execute_generation(sys_prompt, user_prompt)
        # Split text into summary and bullets for structured UI display
        lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
        return NarrativeResponse(
            summary=lines[0] if lines else "Anomaly detected.",
            insights=lines[1:4] if len(lines) > 1 else ["No specific drivers identified."]
        )

# Global Singleton for cross-service orchestration
narrative_service = NarrativeService()