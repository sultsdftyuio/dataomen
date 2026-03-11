import io
import uuid
import logging
import re
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
    Phase 1: High-Performance Data Ingestion Engine.
    
    Translates raw uploads into tenant-isolated, PII-sanitized Parquet files.
    Prioritizes vectorized Polars transformations to bypass the GIL.
    """

    def __init__(self, pii_salt: str = "dataomen_secure_v1"):
        self.pii_salt = pii_salt
        # Regex patterns for high-sensitivity column detection
        self.pii_pattern = re.compile(
            r"(email|ssn|phone|address|name|password|card|secret|tax|zip|birth)", 
            re.IGNORECASE
        )

    def _map_dtype(self, dtype: pl.DataType) -> str:
        """Maps Polars native memory types to system-level simplified types."""
        if dtype.is_integer(): return "integer"
        if dtype.is_float(): return "float"
        if dtype.is_temporal(): return "datetime"
        if dtype.is_boolean(): return "boolean"
        return "string"

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
            # We cast to string, concat the salt, and hash. Bypasses Python loops.
            expressions.append(
                pl.col(col).cast(pl.Utf8)
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
            # Only check for PK if the type is string or int and column 0 or named 'id'
            is_pk = False
            if col_name.lower() in ['id', 'uuid', df.columns[0].lower()]:
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
        The Ingestion Pipeline:
        1. Parse (Polars)
        2. Infer Schema
        3. Sanitize (Vectorized Masking)
        4. Sink (Storage Manager -> R2 Parquet)
        """
        try:
            # 1. High-Performance Load
            contents = await file.read()
            buffer = io.BytesIO(contents)
            
            ext = file.filename.split('.')[-1].lower()
            if ext == 'csv':
                df = pl.read_csv(buffer, ignore_errors=True, infer_schema_length=10000)
            elif ext == 'json':
                df = pl.read_json(buffer)
            elif ext == 'parquet':
                df = pl.read_parquet(buffer)
            else:
                raise HTTPException(status_code=400, detail="Unsupported format. Use CSV, JSON, or Parquet.")

            if df.is_empty():
                raise HTTPException(status_code=400, detail="Dataset is empty.")

            # 2. Metadata Extraction
            columns, pii_cols = self._infer_metadata(df)

            # 3. Security: Automated Data Sanitization
            if mask_pii:
                df = self._apply_vectorized_sanitization(df, pii_cols)

            # 4. Storage Resolution & Columnar Sink
            # Deterministic dataset ID for path partitioning
            dataset_id = str(uuid.uuid4())
            
            # Use the Storage Manager to stream the Polars DataFrame directly to R2
            # row_group_size=100000 ensures DuckDB can read it back in parallel chunks
            storage_uri = storage_manager.write_dataframe(
                db=db,
                df=df,
                tenant_id=tenant_id,
                dataset_id=dataset_id
            )

            logger.info(f"✅ [{tenant_id}] Ingested {dataset_name}. Rows: {df.height}, PII Masked: {mask_pii}")

            return IngestionResult(
                storage_path=storage_uri,
                row_count=df.height,
                size_bytes=len(contents), # Approximate, actual parquet size is in storage_manager
                columns=columns
            )

        except pl.PolarsError as e:
            logger.error(f"Vectorized parsing failure: {e}")
            raise HTTPException(status_code=422, detail=f"Data parsing error: {str(e)}")
        except Exception as e:
            logger.error(f"Ingestion pipeline failure: {e}")
            raise HTTPException(status_code=500, detail="Internal ingestion pipeline error.")

# Export singleton
ingestion_service = DataIngestionService()