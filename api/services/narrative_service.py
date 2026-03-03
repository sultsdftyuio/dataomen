# api/services/narrative_service.py
import os
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from tenacity import retry, wait_exponential, stop_after_attempt

# SDK Imports
from openai import OpenAI
from anthropic import Anthropic

class BaseLLMProvider(ABC):
    """The Modular Strategy: Abstract LLM interface ensuring zero vendor lock-in."""
    @abstractmethod
    def generate_diagnostic(self, prompt: str) -> str:
        pass

class OpenAIProvider(BaseLLMProvider):
    def __init__(self):
        # Relies on OPENAI_API_KEY in your .env
        self.client = OpenAI() 

    def generate_diagnostic(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model="gpt-4o-mini", # Fast, cheap, capable reasoning
            temperature=0.0,     # Strict zero hallucination
            messages=[
                {"role": "system", "content": "You are a precise analytical data agent."},
                {"role": "user", "content": prompt}
            ]
        )
        return response.choices[0].message.content.strip()

class AnthropicProvider(BaseLLMProvider):
    def __init__(self):
        # Relies on ANTHROPIC_API_KEY in your .env
        self.client = Anthropic()

    def generate_diagnostic(self, prompt: str) -> str:
        response = self.client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=500,
            temperature=0.0,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        return response.content[0].text

class NarrativeService:
    def __init__(self):
        # Dependency Injection of our swappable modules
        self.primary_provider = OpenAIProvider()
        self.fallback_provider = AnthropicProvider()

    # If OpenAI hits a rate limit (429) or 500 error, retry up to 3 times
    # Wait 2^x * 1 seconds between each retry, up to 10 seconds max
    @retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
    def _execute_with_primary(self, prompt: str) -> str:
        return self.primary_provider.generate_diagnostic(prompt)

    def generate_anomaly_summary(self, metric: str, delta_percentage: float, top_drivers: List[Dict[str, Any]]) -> str:
        """
        Constructs the Contextual RAG prompt and safely queries the LLM with failover.
        """
        if not top_drivers:
             return f"The metric '{metric}' changed by {delta_percentage:.2f}%, but no specific dimensional drivers were found."

        # Strict Context Construction
        context_str = "\n".join([
            f"- Dimension: {d['dimension']} | Category: {d['category_name']} | "
            f"Delta: {d['absolute_delta']:.2f} ({d['percentage_change']:.2f}%)"
            for d in top_drivers
        ])

        prompt = f"""
        The metric '{metric}' changed by {delta_percentage:.2f}%.
        
        Context (Top Variance Drivers):
        {context_str}
        
        Instructions:
        1. Formulate a 2-sentence summary explaining the primary drivers of this anomaly.
        2. DO NOT hallucinate. DO NOT mention any metrics, dimensions, or categories not strictly present in the Context.
        """

        try:
            return self._execute_with_primary(prompt)
        except Exception as primary_error:
            print(f"Primary LLM (OpenAI) failed after retries: {primary_error}. Seamlessly falling back to Anthropic.")
            return self.fallback_provider.generate_diagnostic(prompt)