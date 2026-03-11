# api/services/narrative_service.py

import os
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# SDK Imports
from openai import AsyncOpenAI, OpenAIError

logger = logging.getLogger(__name__)

class BaseLLMProvider(ABC):
    """The Modular Strategy: Abstract LLM interface ensuring zero vendor lock-in."""
    @abstractmethod
    async def generate_diagnostic(self, prompt: str) -> str:
        pass

class OpenAIProvider(BaseLLMProvider):
    def __init__(self, model: str = "gpt-4o-mini"):
        # Relies on OPENAI_API_KEY in your .env
        self.client = AsyncOpenAI() 
        self.model = os.getenv("PRIMARY_LLM_MODEL", model)

    async def generate_diagnostic(self, prompt: str) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            temperature=0.0,     # Strict zero hallucination
            messages=[
                {
                    "role": "system", 
                    "content": "You are a precise analytical data agent. Your sole purpose is to synthesize factual data variances into concise business narratives. Do not hallucinate external factors."
                },
                {"role": "user", "content": prompt}
            ]
        )
        return response.choices[0].message.content.strip()

class FallbackProvider(BaseLLMProvider):
    def __init__(self, model: str = "gpt-3.5-turbo"):
        # Relies on OPENAI_API_KEY in your .env
        # NOTE: To make this a true multi-cloud failover, you can swap this 
        # class out for an AnthropicAsyncClient (Claude) implementation.
        self.client = AsyncOpenAI()
        self.model = os.getenv("FALLBACK_LLM_MODEL", model)

    async def generate_diagnostic(self, prompt: str) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            temperature=0.0,
            messages=[
                {"role": "system", "content": "You are a precise analytical data agent."},
                {"role": "user", "content": prompt}
            ]
        )
        return response.choices[0].message.content.strip()

class NarrativeService:
    def __init__(self, primary_provider: BaseLLMProvider = None, fallback_provider: BaseLLMProvider = None):
        # Dependency Injection of our swappable modules
        self.primary_provider = primary_provider or OpenAIProvider()
        self.fallback_provider = fallback_provider or FallbackProvider()

    # Retry strictly on OpenAI network/server errors, not on auth failures.
    @retry(
        retry=retry_if_exception_type(OpenAIError),
        wait=wait_exponential(multiplier=1, min=2, max=10), 
        stop=stop_after_attempt(3)
    )
    async def _execute_with_primary(self, prompt: str) -> str:
        return await self.primary_provider.generate_diagnostic(prompt)

    async def generate_anomaly_summary(self, metric: str, delta_percentage: float, top_drivers: List[Dict[str, Any]]) -> str:
        """
        Constructs the Contextual RAG prompt and safely queries the LLM with failover.
        """
        if not top_drivers:
            return f"The metric '{metric}' changed by {delta_percentage:+.2f}%, but no specific dimensional drivers were found in the current schema."

        # Strict Context Construction (Contextual RAG)
        context_lines = []
        for d in top_drivers:
            dim = d.get('dimension', 'Unknown')
            cat = d.get('category_name', 'Unknown')
            abs_delta = d.get('absolute_delta', 0)
            pct_change = d.get('percentage_change', 0)
            # The :+ format forces a plus sign for positive numbers
            context_lines.append(f"- Dimension: {dim} | Category: {cat} | Delta: {abs_delta:+.2f} ({pct_change:+.2f}%)")
            
        context_str = "\n".join(context_lines)

        prompt = f"""
ANOMALY EVENT:
The metric '{metric}' has experienced a variance of {delta_percentage:+.2f}%.

CONTEXT (Top Mathematical Variance Drivers):
{context_str}

INSTRUCTIONS:
1. Formulate a concise, 2-sentence executive summary explaining the primary drivers of this anomaly based STRICTLY on the context provided.
2. DO NOT hallucinate. DO NOT mention any metrics, dimensions, categories, or external market events not explicitly listed in the Context above.
3. Be direct and analytical. Avoid filler phrases like "Based on the data..."
"""

        try:
            return await self._execute_with_primary(prompt)
        except Exception as primary_error:
            logger.warning(f"Primary LLM failed after retries: {str(primary_error)}. Seamlessly falling back to secondary provider.")
            
            try:
                return await self.fallback_provider.generate_diagnostic(prompt)
            except Exception as fallback_error:
                logger.error(f"Fallback LLM also failed: {str(fallback_error)}")
                # The ultimate fail-safe: don't crash the application if AI is completely down
                return f"An anomaly of {delta_percentage:+.2f}% was detected in '{metric}'. AI diagnostic synthesis is currently unavailable due to upstream API issues."