# api/services/vector_service.py

import os
import logging
import uuid
from typing import Dict, List, Any, Optional

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, 
    VectorParams, 
    PointStruct, 
    Filter, 
    FieldCondition, 
    MatchValue
)

from api.services.llm_client import llm_client

logger = logging.getLogger(__name__)

class VectorService:
    """
    Phase 2: Semantic Schema Indexing & RAG Optimization.
    
    This service treats the LLM's context window as a highly restricted resource.
    Instead of dumping entire database schemas into the LLM (which bloats tokens 
    and causes hallucinations), this service embeds table/column metadata into a 
    vector database (Qdrant). 
    
    At query time, it retrieves ONLY the most semantically relevant tables.
    """

    COLLECTION_NAME = "dataomen_schemas"
    # text-embedding-3-small dimension
    EMBEDDING_DIMENSION = 1536  

    def __init__(self):
        # Graceful degradation if Qdrant isn't configured yet
        self.qdrant_url = os.getenv("QDRANT_URL")
        self.qdrant_api_key = os.getenv("QDRANT_API_KEY")
        
        if not self.qdrant_url:
            logger.warning("QDRANT_URL missing. Semantic RAG falls back to exact match/full schema.")
            self.client = None
        else:
            self.client = AsyncQdrantClient(
                url=self.qdrant_url,
                api_key=self.qdrant_api_key,
                timeout=10.0
            )

    async def initialize_collection(self):
        """Ensures the vector collection exists with the correct dimensions."""
        if not self.client: return
        
        collections = await self.client.get_collections()
        if not any(c.name == self.COLLECTION_NAME for c in collections.collections):
            logger.info(f"Creating Qdrant collection: {self.COLLECTION_NAME}")
            await self.client.create_collection(
                collection_name=self.COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=self.EMBEDDING_DIMENSION, 
                    distance=Distance.COSINE
                ),
            )
            # Create a payload index on tenant_id for high-performance multi-tenant filtering
            await self.client.create_payload_index(
                collection_name=self.COLLECTION_NAME,
                field_name="tenant_id",
                field_schema="keyword"
            )

    # -------------------------------------------------------------------------
    # Phase 2.1: Semantic Schema Indexing
    # -------------------------------------------------------------------------

    async def index_dataset_schema(self, tenant_id: str, dataset_id: str, schema_metadata: Dict[str, Any]):
        """
        Translates raw database schema into semantic text chunks, vectorizes them 
        in parallel batches, and indexes them into Qdrant.
        """
        if not self.client:
            logger.warning("Skipping schema indexing: Qdrant client not initialized.")
            return

        chunks = []
        payloads = []
        
        # Flatten the schema into semantic descriptions
        for table_name, table_info in schema_metadata.items():
            description = table_info.get("description", "")
            columns = ", ".join(table_info.get("columns", []))
            
            # Create a dense, semantic chunk optimized for LLM embedding understanding
            semantic_text = (
                f"Dataset: {dataset_id}. Table: {table_name}. "
                f"Description: {description}. "
                f"Available Columns: {columns}."
            )
            chunks.append(semantic_text)
            
            payloads.append({
                "tenant_id": tenant_id,
                "dataset_id": dataset_id,
                "table_name": table_name,
                "semantic_text": semantic_text
            })

        if not chunks:
            return

        logger.info(f"[{tenant_id}] Embedding {len(chunks)} schema chunks for dataset {dataset_id}...")
        
        # Vectorization over Loops: Embed all chunks in a single parallel network call
        embeddings = await llm_client.embed_batch(chunks)
        
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=embedding,
                payload=payload
            )
            for embedding, payload in zip(embeddings, payloads)
        ]

        # Upsert to Vector DB
        await self.client.upsert(
            collection_name=self.COLLECTION_NAME,
            points=points
        )
        logger.info(f"[{tenant_id}] Successfully indexed {len(points)} vectors into Qdrant.")

    async def delete_dataset_index(self, tenant_id: str, dataset_id: str):
        """Removes a dataset from the vector index (e.g., when deleted by the user)."""
        if not self.client: return
        
        await self.client.delete(
            collection_name=self.COLLECTION_NAME,
            points_selector=Filter(
                must=[
                    FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                    FieldCondition(key="dataset_id", match=MatchValue(value=dataset_id)),
                ]
            )
        )

    # -------------------------------------------------------------------------
    # Phase 2.2: Contextual RAG Routing
    # -------------------------------------------------------------------------

    async def search_relevant_schemas(
        self, 
        tenant_id: str, 
        prompt_embedding: List[float], 
        top_k: int = 5
    ) -> Dict[str, List[str]]:
        """
        Searches the vector database for the most relevant tables to answer the prompt.
        
        Returns:
            Dict mapping dataset_id to a list of relevant table descriptions.
        """
        if not self.client:
            return {}

        # Multi-Tenant Security by Design: Hard filter preventing cross-tenant leakage
        tenant_filter = Filter(
            must=[FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))]
        )

        search_results = await self.client.search(
            collection_name=self.COLLECTION_NAME,
            query_vector=prompt_embedding,
            query_filter=tenant_filter,
            limit=top_k,
            score_threshold=0.3  # Ensure only highly semantically relevant tables match
        )

        # Group retrieved schemas by dataset_id so the orchestrator can inject them
        relevant_schemas: Dict[str, List[str]] = {}
        
        for hit in search_results:
            dataset_id = hit.payload.get("dataset_id")
            semantic_text = hit.payload.get("semantic_text")
            
            if dataset_id and semantic_text:
                if dataset_id not in relevant_schemas:
                    relevant_schemas[dataset_id] = []
                relevant_schemas[dataset_id].append(semantic_text)

        hit_count = sum(len(texts) for texts in relevant_schemas.values())
        logger.info(f"[{tenant_id}] RAG retrieved {hit_count} relevant tables for query execution.")
        
        return relevant_schemas

# Global Singleton Service
vector_service = VectorService()