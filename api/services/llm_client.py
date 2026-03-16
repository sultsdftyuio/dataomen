# api/services/llm_client.py

import os
import logging
import asyncio
from typing import Optional, Dict, Any, List, TypeVar, Type
from pydantic import BaseModel
from openai import AsyncOpenAI, RateLimitError, APIConnectionError, APIError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

class LLMClient:
    """
    Enterprise-Grade LLM & Embedding Wrapper.
    Centralizes all AI interactions, ensuring uniform retry logic,
    cost tracking, and easy swapping of underlying models.
    """

    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("PRIMARY_LLM_MODEL", "gpt-5-nano")
        self.embedding_model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        self.MAX_RETRIES = 3
        
        if not self.api_key:
            logger.warning("OPENAI_API_KEY is missing. LLM features will fail.")
            self.client = None
        else:
            self.client = AsyncOpenAI(api_key=self.api_key)

    async def _execute_with_retries(self, coro_func, *args, **kwargs):
        """Centralized exponential backoff for all AI network calls."""
        if not self.client:
            raise RuntimeError("LLMClient is not configured. Missing OpenAI API key.")

        attempt = 0
        while attempt < self.MAX_RETRIES:
            try:
                return await coro_func(*args, **kwargs)
            except RateLimitError:
                attempt += 1
                wait_time = 2 ** attempt
                logger.warning(f"Rate Limit Hit. Retrying in {wait_time}s... ({attempt}/{self.MAX_RETRIES})")
                await asyncio.sleep(wait_time)
            except (APIConnectionError, APIError) as e:
                attempt += 1
                if attempt >= self.MAX_RETRIES:
                    logger.error(f"API Failure after {self.MAX_RETRIES} attempts: {e}")
                    raise
                await asyncio.sleep(1)

    # --- Text & SQL Generation ---

    async def generate_structured(
        self, 
        system_prompt: str, 
        prompt: str, 
        response_model: Type[T],
        history: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.0
    ) -> T:
        """Forces the LLM to return a perfectly formatted Pydantic object."""
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": prompt})

        async def _call():
            response = await self.client.beta.chat.completions.parse(
                model=self.model,
                messages=messages,
                response_format=response_model,
                temperature=temperature
            )
            return response.choices[0].message.parsed
            
        return await self._execute_with_retries(_call)

    # --- Vector Embeddings (For Semantic Pruning) ---

    async def embed(self, text: str) -> List[float]:
        """Generates a single vector embedding."""
        async def _call():
            res = await self.client.embeddings.create(input=[text], model=self.embedding_model)
            return res.data[0].embedding
        return await self._execute_with_retries(_call)

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generates embeddings for multiple strings concurrently."""
        if not texts: return []
        async def _call():
            res = await self.client.embeddings.create(input=texts, model=self.embedding_model)
            return [d.embedding for d in res.data]
        return await self._execute_with_retries(_call)

# Global Singleton
llm_client = LLMClient()