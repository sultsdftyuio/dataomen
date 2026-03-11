import io
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import polars as pl
from fastapi import UploadFile, HTTPException
from supabase import Client

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Type Definitions
# -----------------------------------------------------------------------------
class ColumnMetadata:
    """Strict typing for our automatically inferred AI data dictionary."""
    def __init__(self, name: str, type: str, description: str = "", is_pii: bool = False, is_primary_key: bool = False):
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
    Handles the high-performance transformation of raw data uploads (CSV/JSON)
    into highly compressed, columnar Parquet files optimized for DuckDB query engines.
    """

    def __init__(self, supabase_client: Client, bucket_name: str = "tenant-datasets"):
        self.supabase = supabase_client
        self.bucket_name = bucket_name

    def _map_polars_dtype_to_system(self, dtype: pl.DataType) -> str:
        """Maps Rust/Polars native memory types to our simplified schema contract."""
        dtype_str = str(dtype).lower()
        if "int" in dtype_str:
            return "integer"
        if "float" in dtype_str or "double" in dtype_str:
            return "float"
        if "bool" in dtype_str:
            return "boolean"
        if "datetime" in dtype_str or "date" in dtype_str or "time" in dtype_str:
            return "datetime"
        return "string"

    def _infer_schema_and_metadata(self, df: pl.DataFrame) -> List[ColumnMetadata]:
        """
        Extracts structural metadata. Automatically flags obvious PII and Primary Keys 
        to optimize the LLM Contextual RAG downstream.
        """
        columns_meta = []
        schema = df.schema

        for col_name, dtype in schema.items():
            system_type = self._map_polars_dtype_to_system(dtype)
            
            # Auto-flagging heuristics for PII and Keys
            col_lower = col_name.lower()
            is_pii = any(pii_term in col_lower for pii_term in ['email', 'ssn', 'phone', 'address', 'name', 'password'])
            is_pk = col_lower in ['id', 'uuid', f"{df.columns[0].lower()}"] and df[col_name].n_unique() == df.height

            meta = ColumnMetadata(
                name=col_name,
                type=system_type,
                description=f"Auto-inferred column: {col_name}",
                is_pii=is_pii,
                is_primary_key=is_pk
            )
            columns_meta.append(meta)

        return columns_meta

    async def process_and_upload(
        self, 
        file: UploadFile, 
        tenant_id: str, 
        dataset_name: str
    ) -> IngestionResult:
        """
        Reads a raw file, vectorizes the transformation to Parquet in-memory, 
        and securely isolates it in tenant-partitioned storage.
        """
        try:
            # 1. Read raw bytes into memory buffer
            raw_bytes = await file.read()
            file_buffer = io.BytesIO(raw_bytes)
            file_size = len(raw_bytes)

            if file_size == 0:
                raise ValueError("Uploaded file is empty.")

            # 2. High-Performance DataFrame loading using Polars (Vectorized C/Rust backend)
            filename = file.filename.lower()
            if filename.endswith('.csv'):
                df = pl.read_csv(file_buffer, ignore_errors=True, infer_schema_length=10000)
            elif filename.endswith('.json'):
                df = pl.read_json(file_buffer)
            else:
                raise ValueError(f"Unsupported file format: {filename}. Please upload CSV or JSON.")

            row_count = df.height
            if row_count == 0:
                raise ValueError("Data file contains no rows.")

            # 3. Extract standard schema metadata for the AI Dictionary
            columns = self._infer_schema_and_metadata(df)

            # 4. Compress to Columnar Parquet format (in-memory)
            # Parquet drastically reduces S3 storage costs and makes DuckDB range-queries lightning fast
            parquet_buffer = io.BytesIO()
            df.write_parquet(parquet_buffer, compression="snappy")
            parquet_buffer.seek(0)
            parquet_bytes = parquet_buffer.read()

            # 5. Secure, Tenant-Isolated Storage
            # Path format: tenant_id/dataset_uuid.parquet
            dataset_uuid = str(uuid.uuid4())
            storage_path = f"{tenant_id}/{dataset_uuid}.parquet"

            # Upload to Supabase Storage (S3 equivalent)
            upload_response = self.supabase.storage.from_(self.bucket_name).upload(
                path=storage_path,
                file=parquet_bytes,
                file_options={"content-type": "application/vnd.apache.parquet"}
            )

            # In Supabase python client, upload returns the response. If it fails it usually raises an Exception.
            # But let's verify if the path is in the response.
            if hasattr(upload_response, 'error') and upload_response.error:
                raise Exception(f"Storage Upload Failed: {upload_response.error.message}")

            logger.info(f"Successfully ingested dataset {dataset_name} for tenant {tenant_id}. Rows: {row_count}")

            return IngestionResult(
                storage_path=storage_path,
                row_count=row_count,
                size_bytes=len(parquet_bytes), # Compressed size
                columns=columns
            )

        except pl.PolarsError as e:
            logger.error(f"Data parsing error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Failed to parse data file. Ensure it is valid CSV/JSON. Error: {str(e)}")
        except Exception as e:
            logger.error(f"Ingestion pipeline error: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))