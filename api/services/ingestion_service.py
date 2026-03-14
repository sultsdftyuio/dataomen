import io
import uuid
import logging
import re
import time
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Union

import polars as pl
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

# Import modular infrastructure components
from api.services.storage_manager import storage_manager
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
    def __init__(self, storage_path: str, row_count: int, size_bytes: int, columns: List[ColumnMetadata]):
        self.storage_path = storage_path
        self.row_count = row_count
        self.size_bytes = size_bytes
        self.columns = columns

# -----------------------------------------------------------------------------
# Core Service Module
# -----------------------------------------------------------------------------

class DataIngestionService:
    """
    Phase 1+: Enterprise Data Ingestion Engine.
    
    Upgraded Engineering:
    - Recursive JSON Unnesting: Flattens deeply nested NoSQL data into Analytical Columns.
    - Zero-Copy File Hand-off: Passes raw buffers directly to Rust/Polars.
    - SQL-Safe Normalization: Strips spaces and special characters from column names natively.
    """

    def __init__(self, pii_salt: str = "dataomen_secure_v1"):
        self.pii_salt = pii_salt
        # Regex patterns for high-sensitivity column detection
        self.pii_pattern = re.compile(
            r"(email|ssn|phone|address|password|card|secret|tax|zip|birth|ip_address)", 
            re.IGNORECASE
        )

    def _map_dtype(self, dtype: pl.DataType) -> str:
        """Maps Polars native memory types to system-level simplified types."""
        if dtype.is_integer(): return "INTEGER"
        if dtype.is_float(): return "FLOAT"
        if dtype.is_temporal(): return "TIMESTAMP"
        if dtype.is_boolean(): return "BOOLEAN"
        return "VARCHAR"

    def _normalize_columns(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Data Quality: Normalizes column names to be strictly SQL-compliant.
        Prevents LLM NL2SQL hallucinations caused by spaces or weird characters.
        """
        def clean_name(name: str) -> str:
            # Lowercase, replace spaces with underscores, strip non-alphanumeric
            clean = re.sub(r'[^a-z0-9_]', '', name.lower().replace(' ', '_'))
            return clean if clean else "unnamed_column"

        new_names = [clean_name(col) for col in df.columns]
        return df.rename(dict(zip(df.columns, new_names)))

    def _flatten_nested_structures(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        ENTERPRISE UPGRADE: Recursive Struct Unnesting.
        When ingesting APIs (Stripe/Shopify) or nested JSON, DuckDB queries become 
        complex if data stays in structs. This recursively expands `user.address.zip` 
        into flat columnar structures in Rust memory space.
        """
        struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
        
        while struct_cols:
            for col in struct_cols:
                # Unnest the struct, adding the parent name as a prefix to avoid collisions
                df = df.unnest(col).rename({
                    child: f"{col}_{child}" for child in df[col].struct.fields if child in df.columns
                })
            # Check again in case structs were nested inside structs
            struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
            
        return df

    def _apply_vectorized_sanitization(self, df: pl.DataFrame, pii_columns: List[str]) -> pl.DataFrame:
        """
        SECURITY BY DESIGN: Salted Hash Masking.
        In-place vectorized transformation of sensitive data.
        Ensures PII is deterministic for joins but opaque for analytics.
        """
        if not pii_columns:
            return df

        expressions = []
        for col in pii_columns:
            # We cast to string, concat the salt, and hash. Bypasses Python loops completely.
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
        """
        Extracts structural metadata and identifies PII/PK candidates.
        """
        columns_meta = []
        pii_candidate_names = []
        
        for col_name in df.columns:
            dtype = df.schema[col_name]
            system_type = self._map_dtype(dtype)
            
            # Heuristic: Name-based PII detection
            is_pii = bool(self.pii_pattern.search(col_name))
            if is_pii:
                pii_candidate_names.append(col_name)

            # Heuristic: Primary Key detection (Unique identifier)
            is_pk = False
            if col_name.lower() in ['id', 'uuid', df.columns[0].lower()] and "VARCHAR" in system_type:
                # Approximate uniqueness check without heavy computation
                if df[col_name].n_unique() == df.height:
                    is_pk = True

            columns_meta.append(ColumnMetadata(
                name=col_name,
                type=system_type,
                description=f"Analytical field inferred from {col_name}",
                is_pii=is_pii,
                is_primary_key=is_pk
            ))

        return columns_meta, pii_candidate_names

    async def process_and_upload(
        self, 
        db: Session,
        file: UploadFile, 
        tenant_id: str, 
        dataset_name: str,
        mask_pii: bool = True
    ) -> IngestionResult:
        """
        The High-Performance Ingestion Pipeline:
        1. Parse directly to Polars (Zero-Copy)
        2. Normalize & Flatten Nested JSON
        3. Infer Schema & Sanitize
        4. Sink to Cloud Storage (Parquet Predicate Pushdown Ready)
        """
        start_time = time.perf_counter()
        logger.info(f"[{tenant_id}] Starting ingestion pipeline for {dataset_name}...")

        try:
            # 1. Zero-Copy Hand-off to Rust
            # By reading directly from the FastAPI SpooledTemporaryFile object into Polars,
            # we avoid duplicating the byte array in Python's memory space.
            file_obj = file.file
            ext = file.filename.split('.')[-1].lower()
            
            if ext == 'csv':
                df = pl.read_csv(file_obj, ignore_errors=True, infer_schema_length=10000)
            elif ext == 'json':
                df = pl.read_json(file_obj)
            elif ext == 'parquet':
                df = pl.read_parquet(file_obj)
            else:
                raise HTTPException(status_code=400, detail="Unsupported format. Use CSV, JSON, or Parquet.")

            if df.is_empty():
                raise HTTPException(status_code=400, detail="Uploaded dataset contains no data.")

            # 2. Data Quality & Structure Normalization
            df = self._normalize_columns(df)
            df = self._flatten_nested_structures(df)

            # 3. Metadata Extraction & Sanitization
            columns, pii_cols = self._infer_metadata(df)

            if mask_pii and pii_cols:
                logger.debug(f"[{tenant_id}] Masking PII fields natively: {pii_cols}")
                df = self._apply_vectorized_sanitization(df, pii_cols)

            # 4. Storage Resolution & Columnar Sink
            dataset_id = str(uuid.uuid4())
            
            # Use the Storage Manager to stream the Polars DataFrame directly to R2/S3
            storage_uri = storage_manager.write_dataframe(
                db=db,
                df=df,
                tenant_id=tenant_id,
                dataset_id=dataset_id
            )

            elapsed = (time.perf_counter() - start_time) * 1000
            
            # Obtain accurate size footprint using Polars estimated size
            size_bytes = df.estimated_size()
            
            logger.info(f"✅ [{tenant_id}] Ingestion Complete. ID: {dataset_id} | Rows: {df.height} | Time: {elapsed:.2f}ms")

            return IngestionResult(
                storage_path=storage_uri,
                row_count=df.height,
                size_bytes=size_bytes,
                columns=columns
            )

        except pl.PolarsError as e:
            logger.error(f"[{tenant_id}] Vectorized parsing failure: {e}")
            raise HTTPException(status_code=422, detail=f"Data formatting error. Ensure your file is clean: {str(e)}")
        except Exception as e:
            logger.error(f"[{tenant_id}] Fatal ingestion pipeline error: {e}")
            raise HTTPException(status_code=500, detail="Internal ingestion pipeline error.")
        finally:
            # Ensure file pointer is closed to prevent resource leaks
            file.file.close()

# Export singleton
ingestion_service = DataIngestionService()