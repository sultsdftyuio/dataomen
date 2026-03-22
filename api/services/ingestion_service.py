import io
import uuid
import logging
import re
import time
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Union

import polars as pl
import fitz  # PyMuPDF for high-speed PDF parsing
import docx  # python-docx for MS Word parsing
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

# Import modular infrastructure components
from api.services.storage_manager import storage_manager
from api.services.vector_service import vector_service
from api.services.llm_client import llm_client
from qdrant_client.models import PointStruct, VectorParams, Distance
from models import Dataset

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Type Definitions
# -----------------------------------------------------------------------------

class ColumnMetadata:
    """Strict typing for our automatically inferred AI data dictionary."""
    def __init__(
        self, 
        name: str, 
        type: str, 
        description: str = "", 
        is_pii: bool = False, 
        is_primary_key: bool = False
    ):
        self.name = name
        self.type = type
        self.description = description
        self.is_pii = is_pii
        self.is_primary_key = is_primary_key

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type,
            "description": self.description,
            "is_pii": self.is_pii,
            "is_primary_key": self.is_primary_key
        }

class IngestionResult:
    def __init__(self, storage_path: str, row_count: int, size_bytes: int, columns: Optional[List[ColumnMetadata]] = None):
        self.storage_path = storage_path
        self.row_count = row_count
        self.size_bytes = size_bytes
        self.columns = columns or []

# -----------------------------------------------------------------------------
# Core Service Module
# -----------------------------------------------------------------------------

class DataIngestionService:
    """
    Phase 1+: Enterprise Hybrid Data Ingestion Engine.
    
    Upgraded Engineering:
    - Structured: Zero-Copy Polars -> Parquet -> Cloud Storage (Analytics)
    - Unstructured: Semantic Chunking -> LLM Embedding -> Qdrant Vector DB (RAG)
    """

    def __init__(self, pii_salt: str = "dataomen_secure_v1"):
        self.pii_salt = pii_salt
        self.DOCUMENT_COLLECTION = "dataomen_documents"
        
        # Regex patterns for high-sensitivity column detection
        self.pii_pattern = re.compile(
            r"(email|ssn|phone|address|password|card|secret|tax|zip|birth|ip_address)", 
            re.IGNORECASE
        )

    # -------------------------------------------------------------------------
    # Structured Data Methods (Polars & Analytics)
    # -------------------------------------------------------------------------

    def _map_dtype(self, dtype: pl.DataType) -> str:
        if dtype.is_integer(): return "INTEGER"
        if dtype.is_float(): return "FLOAT"
        if dtype.is_temporal(): return "TIMESTAMP"
        if dtype.is_boolean(): return "BOOLEAN"
        return "VARCHAR"

    def _normalize_columns(self, df: pl.DataFrame) -> pl.DataFrame:
        def clean_name(name: str) -> str:
            clean = re.sub(r'[^a-z0-9_]', '', name.lower().replace(' ', '_'))
            return clean if clean else "unnamed_column"

        new_names = [clean_name(col) for col in df.columns]
        return df.rename(dict(zip(df.columns, new_names)))

    def _flatten_nested_structures(self, df: pl.DataFrame) -> pl.DataFrame:
        struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
        while struct_cols:
            for col in struct_cols:
                df = df.unnest(col).rename({
                    child: f"{col}_{child}" for child in df[col].struct.fields if child in df.columns
                })
            struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
        return df

    def _apply_vectorized_sanitization(self, df: pl.DataFrame, pii_columns: List[str]) -> pl.DataFrame:
        if not pii_columns:
            return df
        expressions = []
        for col in pii_columns:
            expressions.append(
                pl.col(col).cast(pl.Utf8)
                .fill_null("NULL_VALUE")
                .add(self.pii_salt)
                .hash()
                .cast(pl.Utf8)
                .alias(col)
            )
        return df.with_columns(expressions)

    def _infer_metadata(self, df: pl.DataFrame) -> Tuple[List[ColumnMetadata], List[str]]:
        columns_meta = []
        pii_candidate_names = []
        
        for col_name in df.columns:
            dtype = df.schema[col_name]
            system_type = self._map_dtype(dtype)
            
            is_pii = bool(self.pii_pattern.search(col_name))
            if is_pii:
                pii_candidate_names.append(col_name)

            is_pk = False
            if col_name.lower() in ['id', 'uuid', df.columns[0].lower()] and "VARCHAR" in system_type:
                if df[col_name].n_unique() == df.height:
                    is_pk = True

            columns_meta.append(ColumnMetadata(
                name=col_name, type=system_type, description=f"Analytical field inferred from {col_name}",
                is_pii=is_pii, is_primary_key=is_pk
            ))

        return columns_meta, pii_candidate_names

    # -------------------------------------------------------------------------
    # Unstructured Data Methods (RAG & Documents)
    # -------------------------------------------------------------------------

    async def _ensure_document_collection(self):
        """Ensures the dedicated unstructured document vector collection exists."""
        if not vector_service.client: return
        collections = await vector_service.client.get_collections()
        if not any(c.name == self.DOCUMENT_COLLECTION for c in collections.collections):
            logger.info(f"Creating Qdrant collection: {self.DOCUMENT_COLLECTION}")
            await vector_service.client.create_collection(
                collection_name=self.DOCUMENT_COLLECTION,
                vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
            )
            # Multi-tenant security index
            await vector_service.client.create_payload_index(
                collection_name=self.DOCUMENT_COLLECTION,
                field_name="tenant_id",
                field_schema="keyword"
            )

    def _chunk_text(self, text: str, chunk_size_words: int = 400, overlap_words: int = 50) -> List[str]:
        """
        Semantic Chunker: Splits text into overlapping blocks to preserve context mid-sentence.
        Approximates tokens via word count for high-speed preprocessing.
        """
        words = text.split()
        if not words:
            return []
            
        chunks = []
        for i in range(0, len(words), chunk_size_words - overlap_words):
            chunk = " ".join(words[i:i + chunk_size_words])
            chunks.append(chunk)
            if i + chunk_size_words >= len(words):
                break
        return chunks

    async def _process_unstructured(
        self, 
        file_obj: io.BytesIO, 
        ext: str, 
        tenant_id: str, 
        dataset_name: str
    ) -> IngestionResult:
        """
        The Unstructured Ingestion Pipeline.
        Extracts raw text, chunks semantically, embeds using the LLM client, and sinks to Qdrant.
        """
        start_time = time.perf_counter()
        document_id = str(uuid.uuid4())
        text = ""

        # 1. The Parser: Library selection based on extension
        file_bytes = file_obj.read()
        if ext in ['txt', 'md']:
            text = file_bytes.decode('utf-8', errors='ignore')
        elif ext == 'pdf':
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            text = "\n".join([page.get_text() for page in doc])
        elif ext == 'docx':
            doc = docx.Document(io.BytesIO(file_bytes))
            text = "\n".join([para.text for para in doc.paragraphs])
            
        if not text.strip():
            raise HTTPException(status_code=400, detail="Document contains no extractable text.")
            
        # 2. The Chunker
        chunks = self._chunk_text(text, chunk_size_words=400, overlap_words=50)
        logger.info(f"[{tenant_id}] Extracted {len(chunks)} semantic chunks from {dataset_name}.")
        
        # 3. The Vectorizer (Batch Embedding)
        embeddings = await llm_client.embed_batch(chunks)
        
        # 4. The Sink (Push directly to Qdrant)
        if vector_service.client:
            await self._ensure_document_collection()
            
            points = [
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=embedding,
                    payload={
                        "tenant_id": tenant_id,
                        "document_id": document_id,
                        "dataset_name": dataset_name,
                        "chunk_text": chunk,
                        "source_type": ext
                    }
                )
                for embedding, chunk in zip(embeddings, chunks)
            ]
            
            await vector_service.client.upsert(
                collection_name=self.DOCUMENT_COLLECTION,
                points=points
            )
            
        elapsed = (time.perf_counter() - start_time) * 1000
        size_bytes = len(text.encode('utf-8'))
        
        logger.info(f"✅ [{tenant_id}] Document Ingested. ID: {document_id} | Chunks: {len(chunks)} | Time: {elapsed:.2f}ms")
        
        return IngestionResult(
            storage_path=f"qdrant://{self.DOCUMENT_COLLECTION}/{document_id}",
            row_count=len(chunks), # Representing chunks as pseudo-rows
            size_bytes=size_bytes,
            columns=[]
        )

    # -------------------------------------------------------------------------
    # Main Orchestration Endpoint
    # -------------------------------------------------------------------------

    async def process_and_upload(
        self, 
        db: Session,
        file: UploadFile, 
        tenant_id: str, 
        dataset_name: str,
        mask_pii: bool = True
    ) -> IngestionResult:
        """
        Hybrid Pipeline Orchestrator.
        Routes incoming files dynamically to the analytical engine (Polars) or RAG engine (Qdrant).
        """
        logger.info(f"[{tenant_id}] Routing ingestion pipeline for {dataset_name}...")
        
        try:
            file_obj = file.file
            ext = file.filename.split('.')[-1].lower()
            
            # --- ROUTE 1: UNSTRUCTURED DOCUMENT RAG ---
            if ext in ['pdf', 'docx', 'txt', 'md']:
                return await self._process_unstructured(file_obj, ext, tenant_id, dataset_name)
                
            # --- ROUTE 2: STRUCTURED ANALYTICAL ---
            elif ext in ['csv', 'json', 'parquet']:
                start_time = time.perf_counter()
                
                # Zero-Copy Hand-off
                if ext == 'csv':
                    df = pl.read_csv(file_obj, ignore_errors=True, infer_schema_length=10000)
                elif ext == 'json':
                    df = pl.read_json(file_obj)
                else: # parquet
                    df = pl.read_parquet(file_obj)

                if df.is_empty():
                    raise HTTPException(status_code=400, detail="Uploaded dataset contains no data.")

                df = self._normalize_columns(df)
                df = self._flatten_nested_structures(df)
                columns, pii_cols = self._infer_metadata(df)

                if mask_pii and pii_cols:
                    logger.debug(f"[{tenant_id}] Masking PII fields natively: {pii_cols}")
                    df = self._apply_vectorized_sanitization(df, pii_cols)

                dataset_id = str(uuid.uuid4())
                
                storage_uri = storage_manager.write_dataframe(
                    db=db, df=df, tenant_id=tenant_id, dataset_id=dataset_id
                )

                elapsed = (time.perf_counter() - start_time) * 1000
                size_bytes = df.estimated_size()
                logger.info(f"✅ [{tenant_id}] Structured Ingestion Complete. ID: {dataset_id} | Rows: {df.height} | Time: {elapsed:.2f}ms")

                return IngestionResult(
                    storage_path=storage_uri,
                    row_count=df.height,
                    size_bytes=size_bytes,
                    columns=columns
                )
            else:
                raise HTTPException(status_code=400, detail="Unsupported format. Supported: CSV, JSON, Parquet, PDF, DOCX, TXT, MD.")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[{tenant_id}] Fatal ingestion pipeline error: {e}")
            raise HTTPException(status_code=500, detail="Internal ingestion pipeline error.")
        finally:
            file.file.close()

# Export singleton
ingestion_service = DataIngestionService()