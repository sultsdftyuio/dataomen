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
    MatchValue,
    MatchAny
)

from api.services.llm_client import llm_client

logger = logging.getLogger(__name__)

class VectorService:
    """
    Phase 2 & 3: Semantic Schema Indexing & Document RAG Engine.
    
    This service treats the LLM's context window as a highly restricted resource.
    It manages two vector spaces:
    1. 'dataomen_schemas': Embeds table/column metadata to route structured NL2SQL.
    2. 'dataomen_documents': Embeds semantic chunks from PDFs/Text for unstructured RAG.
    
    Multi-tenant isolation is strictly enforced at the database level via payload filtering.
    """

    SCHEMA_COLLECTION = "dataomen_schemas"
    DOCUMENT_COLLECTION = "dataomen_documents"
    
    # text-embedding-3-small dimension
    EMBEDDING_DIMENSION = 1536  

    def __init__(self):
        # Graceful degradation if Qdrant isn't configured yet
        self.qdrant_url = os.getenv("QDRANT_URL")
        self.qdrant_api_key = os.getenv("QDRANT_API_KEY")
        
        if not self.qdrant_url:
            logger.warning("QDRANT_URL missing. Semantic RAG and Document routing will fall back to exact match/full context.")
            self.client = None
        else:
            self.client = AsyncQdrantClient(
                url=self.qdrant_url,
                api_key=self.qdrant_api_key,
                timeout=10.0
            )

    async def initialize_collections(self):
        """Ensures both vector collections exist with correct dimensions and tenant indexing."""
        if not self.client: return
        
        collections = await self.client.get_collections()
        existing_names = [c.name for c in collections.collections]

        # 1. Ensure Schema Collection
        if self.SCHEMA_COLLECTION not in existing_names:
            logger.info(f"Creating Qdrant collection: {self.SCHEMA_COLLECTION}")
            await self.client.create_collection(
                collection_name=self.SCHEMA_COLLECTION,
                vectors_config=VectorParams(size=self.EMBEDDING_DIMENSION, distance=Distance.COSINE),
            )
            await self.client.create_payload_index(
                collection_name=self.SCHEMA_COLLECTION, field_name="tenant_id", field_schema="keyword"
            )

        # 2. Ensure Document Collection
        if self.DOCUMENT_COLLECTION not in existing_names:
            logger.info(f"Creating Qdrant collection: {self.DOCUMENT_COLLECTION}")
            await self.client.create_collection(
                collection_name=self.DOCUMENT_COLLECTION,
                vectors_config=VectorParams(size=self.EMBEDDING_DIMENSION, distance=Distance.COSINE),
            )
            await self.client.create_payload_index(
                collection_name=self.DOCUMENT_COLLECTION, field_name="tenant_id", field_schema="keyword"
            )

    # -------------------------------------------------------------------------
    # Structured Data (Schema Routing)
    # -------------------------------------------------------------------------

    async def index_dataset_schema(self, tenant_id: str, dataset_id: str, schema_metadata: Dict[str, Any]):
        """Translates raw database schema into semantic text chunks and indexes them."""
        if not self.client: return

        chunks = []
        payloads = []
        
        for table_name, table_info in schema_metadata.items():
            description = table_info.get("description", "")
            columns = ", ".join([c.get("name", "") for c in table_info.get("columns", [])]) if isinstance(table_info.get("columns"), list) else ""
            
            semantic_text = f"Dataset: {dataset_id}. Table: {table_name}. Description: {description}. Available Columns: {columns}."
            chunks.append(semantic_text)
            
            payloads.append({
                "tenant_id": tenant_id,
                "dataset_id": dataset_id,
                "table_name": table_name,
                "semantic_text": semantic_text
            })

        if not chunks: return

        logger.info(f"[{tenant_id}] Embedding {len(chunks)} schema chunks for dataset {dataset_id}...")
        embeddings = await llm_client.embed_batch(chunks)
        
        points = [
            PointStruct(id=str(uuid.uuid4()), vector=emb, payload=pay)
            for emb, pay in zip(embeddings, payloads)
        ]

        await self.client.upsert(collection_name=self.SCHEMA_COLLECTION, points=points)

    async def search_relevant_schemas(
        self, 
        tenant_id: str, 
        prompt_embedding: List[float], 
        top_k: int = 5
    ) -> Dict[str, List[str]]:
        """Searches for the most relevant analytical tables."""
        if not self.client: return {}

        tenant_filter = Filter(must=[FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))])

        search_results = await self.client.search(
            collection_name=self.SCHEMA_COLLECTION,
            query_vector=prompt_embedding,
            query_filter=tenant_filter,
            limit=top_k,
            score_threshold=0.3
        )

        relevant_schemas: Dict[str, List[str]] = {}
        for hit in search_results:
            dataset_id = hit.payload.get("dataset_id")
            semantic_text = hit.payload.get("semantic_text")
            if dataset_id and semantic_text:
                if dataset_id not in relevant_schemas:
                    relevant_schemas[dataset_id] = []
                relevant_schemas[dataset_id].append(semantic_text)
        
        return relevant_schemas

    # -------------------------------------------------------------------------
    # Unstructured Data (Document RAG)
    # -------------------------------------------------------------------------

    async def search_documents(
        self, 
        tenant_id: str, 
        document_ids: List[str],
        prompt_embedding: List[float], 
        top_k: int = 5
    ) -> List[str]:
        """
        Retrieves the most semantically relevant text chunks from specific uploaded documents.
        Uses a strict tenant_id + document_ids intersection filter.
        """
        if not self.client or not document_ids:
            return []

        # STRICT SECURITY: Filter by Tenant AND the specific Document UUIDs the AI Planner requested
        strict_filter = Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                FieldCondition(key="document_id", match=MatchAny(any=document_ids))
            ]
        )

        logger.info(f"[{tenant_id}] Searching vector DB across {len(document_ids)} documents...")

        search_results = await self.client.search(
            collection_name=self.DOCUMENT_COLLECTION,
            query_vector=prompt_embedding,
            query_filter=strict_filter,
            limit=top_k,
            # Higher threshold for text to prevent AI hallucination from noisy/irrelevant chunks
            score_threshold=0.4 
        )

        # Extract just the raw text chunks to feed to the downstream LLM
        chunks = [hit.payload.get("chunk_text") for hit in search_results if hit.payload and "chunk_text" in hit.payload]
        
        logger.info(f"[{tenant_id}] Retrieved {len(chunks)} relevant document chunks for RAG context.")
        return chunks

    # -------------------------------------------------------------------------
    # Global Cleanup
    # -------------------------------------------------------------------------

    async def delete_asset_index(self, tenant_id: str, asset_id: str):
        """Removes a dataset or document from the vector index (e.g., when deleted by the user)."""
        if not self.client: return
        
        # We attempt to delete from both collections to ensure clean state
        for collection in [self.SCHEMA_COLLECTION, self.DOCUMENT_COLLECTION]:
            # Handle both payload keys (dataset_id or document_id) depending on the collection
            key = "dataset_id" if collection == self.SCHEMA_COLLECTION else "document_id"
            
            await self.client.delete(
                collection_name=collection,
                points_selector=Filter(
                    must=[
                        FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                        FieldCondition(key=key, match=MatchValue(value=asset_id)),
                    ]
                )
            )

# Global Singleton Service
vector_service = VectorService()