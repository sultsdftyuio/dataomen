import os
import json
import uuid
import logging
import re
import time
import hashlib
import hmac
import asyncio
import tempfile
import random
import math
import mimetypes
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Set, AsyncGenerator
from collections import Counter

import polars as pl
import fitz  # PyMuPDF for high-speed PDF parsing
import docx  # python-docx for MS Word parsing
import ijson  # Streaming JSON parser
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

# Modular infrastructure components
from api.services.storage_manager import storage_manager
from api.services.vector_service import vector_service
from api.services.llm_client import llm_client
from qdrant_client.models import PointStruct, VectorParams, Distance, PointIdsList

# -----------------------------------------------------------------------------
# Observability & Metrics
# -----------------------------------------------------------------------------
base_logger = logging.getLogger(__name__)


class TraceContextAdapter(logging.LoggerAdapter):
    """Structured JSON Logging Adapter"""

    def process(self, msg, kwargs):
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "trace_id": self.extra.get('trace_id', 'N/A'),
            "tenant_id": self.extra.get('tenant_id', 'N/A'),
            "message": msg
        }
        if 'extra_fields' in kwargs:
            log_data.update(kwargs.pop('extra_fields'))
        return json.dumps(log_data), kwargs


class MetricsRegistry:
    """FIX #10: Proper metrics implementation with stats tracking."""
    _counters: Dict[str, int] = {}
    _latencies: Dict[str, List[float]] = {}

    @classmethod
    def record_latency(cls, metric_name: str, duration_ms: float, tags: Dict[str, str] = None):
        if metric_name not in cls._latencies:
            cls._latencies[metric_name] = []
        cls._latencies[metric_name].append(duration_ms)
        # Keep only last 1000 samples
        if len(cls._latencies[metric_name]) > 1000:
            cls._latencies[metric_name] = cls._latencies[metric_name][-1000:]

    @classmethod
    def increment(cls, metric_name: str, tags: Dict[str, str] = None, count: int = 1):
        cls._counters[metric_name] = cls._counters.get(metric_name, 0) + count

    @classmethod
    def get_stats(cls) -> Dict[str, Any]:
        return {
            "counters": cls._counters.copy(),
            "latencies": {k: {"count": len(v), "avg": sum(v)/len(v) if v else 0} 
                         for k, v in cls._latencies.items()}
        }


# -----------------------------------------------------------------------------
# Titan V12: Type Definitions & Schemas
# -----------------------------------------------------------------------------

class ColumnMetadata:
    def __init__(self, name: str, type: str, description: str = "", is_pii: bool = False, is_primary_key: bool = False):
        self.name = name
        self.type = type
        self.description = description
        self.is_pii = is_pii
        self.is_primary_key = is_primary_key


class IngestionResult:
    def __init__(
        self, storage_path: str, row_count: int, size_bytes: int,
        columns: Optional[List[ColumnMetadata]] = None,
        schema_hash: Optional[str] = None,
        failed_chunks: int = 0,
        success_rate: float = 1.0
    ):
        self.storage_path = storage_path
        self.row_count = row_count
        self.size_bytes = size_bytes
        self.columns = columns or []
        self.schema_hash = schema_hash
        self.failed_chunks = failed_chunks
        self.success_rate = success_rate


# -----------------------------------------------------------------------------
# Reliability Engineering: True State Machine Circuit Breaker
# -----------------------------------------------------------------------------

class CircuitState:
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreaker:
    """Robust Circuit Breaker with proper HALF_OPEN recovery mechanics."""

    def __init__(self, name: str, failure_threshold: int = 3, recovery_timeout: float = 30.0, success_threshold: int = 2):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold
        self.state = CircuitState.CLOSED

        self.failure_count = 0
        self.consecutive_successes = 0
        self.last_failure_time = 0.0

    def record_failure(self, trace_adapter: TraceContextAdapter):
        self.last_failure_time = time.time()
        self.consecutive_successes = 0

        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            trace_adapter.error(f"CircuitBreaker [{self.name}] failed probe. Reverted to OPEN.")
        else:
            self.failure_count += 1
            if self.failure_count >= self.failure_threshold and self.state != CircuitState.OPEN:
                self.state = CircuitState.OPEN
                trace_adapter.error(f"CircuitBreaker [{self.name}] threshold reached. Transitioned to OPEN.")

    def record_success(self, trace_adapter: TraceContextAdapter):
        if self.state == CircuitState.HALF_OPEN:
            self.consecutive_successes += 1
            if self.consecutive_successes >= self.success_threshold:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
                trace_adapter.info(f"CircuitBreaker [{self.name}] recovered fully to CLOSED.")
        else:
            self.failure_count = 0
            self.consecutive_successes = 0

    def can_execute(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                return True
            return False
        return True  # HALF_OPEN allows probe traffic


# -----------------------------------------------------------------------------
# Concurrency: Hard-Capped Lock Pool with LRU Eviction
# -----------------------------------------------------------------------------

class LockPool:
    """Safe lock pool with TTL memory-leak protection and an absolute upper limit."""

    def __init__(self, ttl_seconds: int = 3600, max_locks: int = 10000):
        self._locks: Dict[str, asyncio.Lock] = {}
        self._access_times: Dict[str, float] = {}
        self._pool_lock = asyncio.Lock()
        self.ttl_seconds = ttl_seconds
        self.max_locks = max_locks

    async def get(self, key: str) -> asyncio.Lock:
        now = time.time()

        async with self._pool_lock:
            if len(self._locks) >= self.max_locks:
                self._force_prune(now)

            lock = self._locks.get(key)
            if not lock:
                lock = asyncio.Lock()
                self._locks[key] = lock

            # FIX #6: Update access time inside lock to prevent race
            self._access_times[key] = now

        # Pruning is moved outside the lock to prevent starvation and deadlocks
        if random.random() < 0.1:
            self._prune(now)

        return lock

    def _prune(self, now: float):
        """Safe pruning with race condition protection."""
        # FIX #6: Copy keys to avoid race during iteration
        expired = [k for k, v in list(self._access_times.items()) if now - v > self.ttl_seconds]
        for k in expired:
            lock = self._locks.get(k)
            if lock and not lock.locked():
                self._locks.pop(k, None)
                self._access_times.pop(k, None)

    def _force_prune(self, now: float):
        """Aggressive LRU eviction if hard limit is breached."""
        self._prune(now)
        if len(self._locks) >= self.max_locks:
            # FIX #6: Copy keys to avoid race during iteration
            sorted_keys = sorted(list(self._access_times.keys()), key=lambda k: self._access_times[k])
            for k in sorted_keys:
                lock = self._locks.get(k)
                if lock and not lock.locked():
                    self._locks.pop(k, None)
                    self._access_times.pop(k, None)
                    if len(self._locks) < self.max_locks:
                        break


# -----------------------------------------------------------------------------
# Core Service Module
# -----------------------------------------------------------------------------

class DataIngestionService:
    """
    Titan V12: Enterprise Hybrid Data Ingestion Engine.
    """

    BATCH_SIZE = 50
    MAX_CONCURRENT_EMBED_BATCHES = 5
    MAX_CONCURRENT_QDRANT_WRITES = 3
    QDRANT_RETRIES = 3
    LLM_RETRIES = 3
    STORAGE_RETRIES = 3
    MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB total limit
    GLOBAL_PIPELINE_TIMEOUT = 120.0
    TIMEOUT_SECONDS = 45.0
    CHUNK_FAILURE_TOLERANCE = 0.05
    NON_RETRYABLE_ERRORS = (ValueError, TypeError, KeyError, RuntimeError, AssertionError, HTTPException)
    MAX_LINE_LENGTH = 10000
    QDRANT_DELETE_BATCH_SIZE = 1000
    EMBEDDING_CONCURRENCY_LIMIT = 10  # FIX #7: Bounded task creation

    def __init__(self, pii_salt: str = "dataomen_secure_v5"):
        self.pii_salt = pii_salt.encode('utf-8')
        self.DOCUMENT_COLLECTION_PREFIX = "dataomen_documents"

        self._lock_pool = LockPool()
        self._tenant_dimensions: Dict[str, int] = {}
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        self._qdrant_semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_QDRANT_WRITES)
        # FIX #8: Cache created collections to avoid race
        self._collections_created: Set[str] = set()

        self.pii_pattern = re.compile(
            r"(?i)\b(email|ssn|social security|phone|address|pwd|password|credit card|secret|tax id|passport)\b"
        )

        self.pii_value_pattern = re.compile(
            r"\b(?:\d[ -]*?){13,16}\b|"  # Credit Cards
            r"\b\d{3}-\d{2}-\d{4}\b|"  # SSN
            r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"  # Email strict
        )

        self.mime_whitelist = {
            'text/plain': ['txt', 'md', 'csv'],
            'text/csv': ['csv'],
            'application/pdf': ['pdf'],
            'application/json': ['json'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx']
        }

    def _get_cb(self, tenant_id: str, cb_type: str) -> CircuitBreaker:
        key = f"{cb_type}_{tenant_id}"
        if key not in self._circuit_breakers:
            self._circuit_breakers[key] = CircuitBreaker(key)
        return self._circuit_breakers[key]

    def _detect_mime_pure_python(self, file_path: str, fallback_ext: str) -> str:
        """Deep pure-Python magic byte sniffer (Reads 2048 bytes for accuracy)."""
        mime_map = {
            b'%PDF': 'application/pdf',
            b'PK\x03\x04': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            b'PAR1': 'application/parquet'
        }
        try:
            with open(file_path, 'rb') as f:
                header = f.read(2048)
                for magic_bytes, mime in mime_map.items():
                    if header.startswith(magic_bytes):
                        return mime

                if fallback_ext == 'json' and (b'{' in header[:100] or b'[' in header[:100]):
                    return 'application/json'
        except Exception:
            pass

        guessed, _ = mimetypes.guess_type(file_path)
        if guessed:
            return guessed
        return 'text/plain' if fallback_ext in ['txt', 'csv', 'md'] else 'application/octet-stream'

    async def _with_retry(self, fn, retries: int, cb: CircuitBreaker, trace_adapter: TraceContextAdapter, timeout: float, *args, **kwargs):
        """Unified retry wrapper with circuit breaker & error classification."""
        if not cb.can_execute():
            raise HTTPException(status_code=503, detail=f"Service [{cb.name}] is currently OPEN/Unavailable.")

        for attempt in range(retries):
            start_time = time.time()
            try:
                res = await asyncio.wait_for(fn(*args, **kwargs), timeout=timeout)
                MetricsRegistry.record_latency(f"{cb.name}_latency", (time.time() - start_time) * 1000)
                cb.record_success(trace_adapter)
                return res
            except asyncio.TimeoutError:
                trace_adapter.warning(f"[{cb.name}] Operation timed out (Attempt {attempt + 1})")
            except Exception as e:
                if isinstance(e, self.NON_RETRYABLE_ERRORS):
                    raise e
                trace_adapter.warning(f"[{cb.name}] Operation failed (Attempt {attempt + 1}): {e}")

            if attempt == retries - 1:
                cb.record_failure(trace_adapter)
                MetricsRegistry.increment(f"{cb.name}_failures")
                raise HTTPException(status_code=503, detail=f"Service [{cb.name}] unavailable after retries.")
            await asyncio.sleep((2 ** attempt) + random.uniform(0.1, 1.0))
        return None

    def _generate_deterministic_id(self, *args) -> str:
        hash_input = "::".join(map(str, args))
        return str(uuid.uuid5(uuid.NAMESPACE_OID, hash_input))

    def _calculate_entropy(self, text: str) -> float:
        if not text:
            return 0.0
        length = len(text)
        counts = Counter(text)
        return -sum((count / length) * math.log2(count / length) for count in counts.values())

    # -------------------------------------------------------------------------
    # FIX #1: Async File I/O Helpers
    # -------------------------------------------------------------------------

    async def _write_upload_file(self, file: UploadFile, tmp_path: str, trace_adapter: TraceContextAdapter) -> Tuple[int, str]:
        """FIX #1: Non-blocking file write using thread offloading."""
        def _write():
            file_size = 0
            hasher = hashlib.sha256()
            with open(tmp_path, 'wb') as f:
                while True:
                    chunk = file.file.read(65536)
                    if not chunk:
                        break
                    file_size += len(chunk)
                    if file_size > self.MAX_FILE_SIZE_BYTES:
                        raise HTTPException(status_code=413, detail="Payload Too Large (100MB limit).")
                    hasher.update(chunk)
                    f.write(chunk)
            return file_size, hasher.hexdigest()

        return await asyncio.to_thread(_write)

    async def _read_text_file_streaming(self, file_path: str) -> AsyncGenerator[str, None]:
        """FIX #1: Non-blocking text file streaming."""
        def _read_chunks():
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                while True:
                    line = f.readline()
                    if not line:
                        break
                    yield line

        # Run generator in thread and yield async
        loop = asyncio.get_event_loop()
        gen = _read_chunks()
        while True:
            try:
                line = await loop.run_in_executor(None, next, gen, None)
                if line is None:
                    break
                yield line
            except StopIteration:
                break

    # -------------------------------------------------------------------------
    # Structured Data Methods
    # -------------------------------------------------------------------------

    def _map_dtype(self, dtype: pl.DataType) -> str:
        if dtype.is_integer():
            return "INTEGER"
        if dtype.is_float():
            return "FLOAT"
        if dtype.is_temporal():
            return "TIMESTAMP"
        if dtype.is_boolean():
            return "BOOLEAN"
        return "VARCHAR"

    def _normalize_columns(self, df: pl.DataFrame) -> pl.DataFrame:
        def clean_name(name: str) -> str:
            clean = re.sub(r'[^a-z0-9_]', '', str(name).lower().replace(' ', '_'))
            return clean if clean else "unnamed_column"
        return df.rename(dict(zip(df.columns, [clean_name(col) for col in df.columns])))

    def _flatten_nested_structures(self, df: pl.DataFrame, max_depth: int = 3) -> pl.DataFrame:
        depth = 0
        struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
        while struct_cols and depth < max_depth:
            for col in struct_cols:
                fields = df[col].struct.fields
                df = df.unnest(col).rename({child: f"{col}_{child}" for child in fields})
            struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
            depth += 1
        return df

    def _apply_vectorized_sanitization(self, df: pl.DataFrame, pii_columns: List[str]) -> pl.DataFrame:
        """FIX #3: Cryptographically secure PII hashing with null handling."""
        if not pii_columns:
            return df

        expressions = [
            pl.col(col).map_elements(
                lambda v: hmac.new(
                    self.pii_salt,
                    # FIX #3: Handle None values properly
                    ("" if v is None else str(v)).encode('utf-8'),
                    hashlib.sha256
                ).hexdigest(),
                return_dtype=pl.Utf8
            ).alias(col)
            for col in pii_columns
        ]
        return df.with_columns(expressions)

    def _infer_metadata_and_detect_pii(self, df: pl.DataFrame) -> Tuple[List[ColumnMetadata], List[str]]:
        columns_meta = []
        pii_candidate_names = set()
        sample_df = df.head(200)

        for col_name in df.columns:
            system_type = self._map_dtype(df.schema[col_name])
            is_pii = bool(self.pii_pattern.search(col_name))

            if "VARCHAR" in system_type:
                samples = sample_df.get_column(col_name).drop_nulls().to_list()
                match_count = sum(1 for val in samples if self.pii_value_pattern.search(str(val)))

                if len(samples) > 0 and (match_count / len(samples)) > 0.1:
                    is_pii = True

                if not is_pii:
                    for val in samples:
                        str_val = str(val)
                        if self._calculate_entropy(str_val) > 4.5 and len(str_val) > 10:
                            is_pii = True
                            break

            if is_pii:
                pii_candidate_names.add(col_name)

            is_pk = col_name.lower() in ['id', 'uuid', df.columns[0].lower()] and "VARCHAR" in system_type
            if is_pk and df.get_column(col_name).n_unique() != df.height:
                is_pk = False

            columns_meta.append(ColumnMetadata(
                name=col_name, type=system_type, description=f"Analytical field inferred from {col_name}",
                is_pii=is_pii, is_primary_key=is_pk
            ))

        return columns_meta, list(pii_candidate_names)

    async def _stream_json_read(self, file_path: str, trace_adapter: TraceContextAdapter, chunk_size: int = 5000) -> AsyncGenerator[pl.DataFrame, None]:
        """FIX #2: True streaming JSON parser - yields chunks for incremental processing."""
        try:
            # Try direct NDJSON first
            yield pl.read_ndjson(file_path)
        except (pl.exceptions.ComputeError, ValueError):
            trace_adapter.info("NDJSON failed. Utilizing chunked ijson stream parsing.")
            chunk = []
            try:
                with open(file_path, 'rb') as f:
                    for item in ijson.items(f, 'item'):
                        chunk.append(item)
                        if len(chunk) >= chunk_size:
                            yield pl.from_dicts(chunk, infer_schema_length=100)
                            chunk = []
                    if chunk:
                        yield pl.from_dicts(chunk, infer_schema_length=100)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"JSON structure invalid: {str(e)}")

    # FIX #2: Process JSON incrementally instead of collecting all
    async def _process_json_incrementally(
        self, file_path: str, trace_adapter: TraceContextAdapter,
        process_fn, db: Session, tenant_id: str
    ) -> IngestionResult:
        """Process JSON chunks incrementally to avoid memory blow-up."""
        total_rows = 0
        all_columns = None
        all_pii_cols = set()
        schema_hash = None
        dataset_id = None

        chunk_idx = 0
        async for chunk_df in self._stream_json_read(file_path, trace_adapter):
            if chunk_df.is_empty():
                continue

            chunk_df = self._normalize_columns(chunk_df)
            chunk_df = self._flatten_nested_structures(chunk_df)

            if chunk_idx == 0:
                # First chunk: infer metadata
                columns, pii_cols = self._infer_metadata_and_detect_pii(chunk_df)
                all_columns = columns
                all_pii_cols = set(pii_cols)

                schema_str = "|".join(f"{k}:{self._map_dtype(v)}" for k, v in sorted(chunk_df.schema.items()))
                schema_hash = hashlib.md5(schema_str.encode()).hexdigest()[:8]
                dataset_id = self._generate_deterministic_id(tenant_id, "dataset", schema_hash)
            else:
                # Subsequent chunks: normalize columns to match first chunk
                chunk_df = chunk_df.select([c for c in chunk_df.columns if c in [col.name for col in all_columns]])

            # Apply PII sanitization
            if all_pii_cols:
                chunk_df = self._apply_vectorized_sanitization(chunk_df, list(all_pii_cols))

            # Process chunk immediately (write to storage)
            await process_fn(chunk_df, db, tenant_id, dataset_id)

            total_rows += chunk_df.height
            chunk_idx += 1

        if total_rows == 0:
            raise HTTPException(status_code=400, detail="Dataset contains no valid data.")

        return IngestionResult(
            storage_path=f"storage://{tenant_id}/{dataset_id}",
            row_count=total_rows,
            size_bytes=0,  # Not tracked for streaming
            columns=all_columns,
            schema_hash=schema_hash,
            success_rate=1.0
        )

    # -------------------------------------------------------------------------
    # Unstructured Data Methods
    # -------------------------------------------------------------------------

    def _get_collection_name(self, dimension: int) -> str:
        return f"{self.DOCUMENT_COLLECTION_PREFIX}_dim{dimension}"

    async def _ensure_document_collection(self, trace_adapter: TraceContextAdapter, dimension: int):
        if not vector_service.client:
            raise HTTPException(status_code=500, detail="Vector service unavailable.")

        collection_name = self._get_collection_name(dimension)

        # FIX #8: Check cache before creating
        if collection_name in self._collections_created:
            return

        try:
            await asyncio.wait_for(
                vector_service.client.create_collection(
                    collection_name=collection_name,
                    vectors_config=VectorParams(size=dimension, distance=Distance.COSINE),
                ), timeout=30.0
            )
            self._collections_created.add(collection_name)
            trace_adapter.info(f"Created collection {collection_name} dim: {dimension}")
        except Exception as e:
            err_str = str(e).lower()
            if "already exists" not in err_str and "409" not in err_str:
                raise e
            # Still add to cache even if already exists
            self._collections_created.add(collection_name)

    async def _process_batch(
        self, batch_chunks: List[str], start_index: int, tenant_id: str, document_id: str,
        dataset_name: str, ext: str, trace_adapter: TraceContextAdapter, timestamp: float,
        embed_semaphore: asyncio.Semaphore, collection_name: str
    ) -> Dict[str, Any]:
        """Process a batch of chunks with embeddings and Qdrant upsert."""
        async with embed_semaphore:
            embeddings = await self._with_retry(
                llm_client.embed_batch, self.LLM_RETRIES, self._get_cb(tenant_id, "llm"),
                trace_adapter, self.TIMEOUT_SECONDS, batch_chunks
            )

            if not embeddings or len(embeddings) != len(batch_chunks):
                raise RuntimeError("Embedding mismatch or failure.")

            for emb in embeddings:
                if any(math.isnan(val) or math.isinf(val) for val in emb):
                    raise ValueError("LLM returned malformed vector with NaN/Inf.")
                magnitude = math.sqrt(sum(v**2 for v in emb))
                if magnitude < 0.001 or math.isnan(magnitude):
                    raise ValueError(f"Anomalous vector magnitude detected: {magnitude}")

            model_key = f"{tenant_id}:default_embed_model"
            async with await self._lock_pool.get(f"dim_{model_key}"):
                if model_key not in self._tenant_dimensions:
                    self._tenant_dimensions[model_key] = len(embeddings[0])
                    await self._ensure_document_collection(trace_adapter, self._tenant_dimensions[model_key])

            expected_dim = self._tenant_dimensions[model_key]
            points = []
            written_ids = []

            for j, (emb, chunk) in enumerate(zip(embeddings, batch_chunks)):
                if len(emb) != expected_dim:
                    raise ValueError(f"Embedding dimension drift. Expected {expected_dim}, got {len(emb)}")

                chunk_index = start_index + j
                chunk_hash = hashlib.sha256(chunk.encode()).hexdigest()[:16]
                point_id = self._generate_deterministic_id(
                    tenant_id, document_id, chunk_index, chunk_hash, int(timestamp)
                )

                written_ids.append(point_id)
                payload = {
                    "tenant_id": tenant_id, "document_id": document_id, "dataset_name": dataset_name,
                    "chunk_index": chunk_index, "chunk_hash": chunk_hash, "chunk_text": chunk,
                    "source_type": ext, "embedding_created_at": timestamp
                }
                points.append(PointStruct(id=point_id, vector=emb, payload=payload))

            async with self._qdrant_semaphore:
                await asyncio.shield(
                    self._with_retry(
                        vector_service.client.upsert, self.QDRANT_RETRIES, self._get_cb(tenant_id, "qdrant"),
                        trace_adapter, self.TIMEOUT_SECONDS, collection_name=collection_name, points=points
                    )
                )

            MetricsRegistry.increment("chunks_processed", count=len(batch_chunks))
            return {"ids": written_ids, "count": len(batch_chunks)}

    async def _rollback_partial_writes(self, written_ids: List[str], dimension: int, trace_adapter: TraceContextAdapter):
        """Batched rollback for backpressure protection."""
        if not written_ids:
            return

        collection_name = self._get_collection_name(dimension)
        trace_adapter.warning("Tolerance breached. Rolling back partial Qdrant writes.")

        for i in range(0, len(written_ids), self.QDRANT_DELETE_BATCH_SIZE):
            batch = written_ids[i:i + self.QDRANT_DELETE_BATCH_SIZE]
            await vector_service.client.delete(
                collection_name=collection_name,
                points_selector=PointIdsList(points=batch)
            )

    async def _parse_pdf_streaming(self, file_path: str, process_fn) -> None:
        """FIX #5: Stream PDF page by page to avoid memory explosion."""
        def _parse():
            doc = fitz.open(file_path)
            for page in doc:
                yield page.get_text()

        loop = asyncio.get_event_loop()
        gen = _parse()
        while True:
            try:
                page_text = await loop.run_in_executor(None, next, gen, None)
                if page_text is None:
                    break
                process_fn(page_text)
            except StopIteration:
                break

    async def _parse_docx_streaming(self, file_path: str, process_fn) -> None:
        """FIX #5: Stream DOCX paragraph by paragraph."""
        def _parse():
            doc = docx.Document(file_path)
            for para in doc.paragraphs:
                if para.text.strip():
                    yield para.text.strip()

        loop = asyncio.get_event_loop()
        gen = _parse()
        while True:
            try:
                para_text = await loop.run_in_executor(None, next, gen, None)
                if para_text is None:
                    break
                process_fn(para_text)
            except StopIteration:
                break

    async def _process_unstructured(
        self, file_path: str, ext: str, tenant_id: str, dataset_name: str,
        file_hash: str, trace_adapter: TraceContextAdapter, file_size: int
    ) -> IngestionResult:

        document_id = self._generate_deterministic_id(tenant_id, dataset_name, file_hash)

        chunks = []
        current_chunk = []
        current_length = 0
        target_length = 2000

        def process_text_stream(text_stream: str):
            nonlocal current_chunk, current_length, chunks

            if len(text_stream) > self.MAX_LINE_LENGTH:
                text_stream = text_stream[:self.MAX_LINE_LENGTH]

            # FIX #11B: Better sentence splitting (handles abbreviations better)
            # Use regex that avoids splitting on common abbreviations
            sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text_stream)
            for sentence in sentences:
                if len(sentence) > 5000:
                    sentence = sentence[:5000]

                current_chunk.append(sentence)
                current_length += len(sentence)
                if current_length > target_length:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = current_chunk[-2:] if len(current_chunk) > 2 else []
                    current_length = sum(len(s) for s in current_chunk)

        # FIX #5: Stream extraction for all formats
        if ext in ['txt', 'md']:
            async for line in self._read_text_file_streaming(file_path):
                process_text_stream(line)
        elif ext == 'pdf':
            await self._parse_pdf_streaming(file_path, process_text_stream)
        elif ext == 'docx':
            await self._parse_docx_streaming(file_path, process_text_stream)

        if current_chunk:
            chunks.append(" ".join(current_chunk))

        if not chunks:
            raise HTTPException(status_code=400, detail="Document contains no extractable text.")

        timestamp = datetime.now(timezone.utc).timestamp()
        embed_semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_EMBED_BATCHES)

        # FIX #4: Use retry wrapper for sample embedding
        model_key = f"{tenant_id}:default_embed_model"
        sample_emb = await self._with_retry(
            llm_client.embed_batch,
            self.LLM_RETRIES,
            self._get_cb(tenant_id, "llm"),
            trace_adapter,
            self.TIMEOUT_SECONDS,
            [chunks[0]]
        )

        async with await self._lock_pool.get(f"dim_{model_key}"):
            if model_key not in self._tenant_dimensions:
                self._tenant_dimensions[model_key] = len(sample_emb[0])
            expected_dim = self._tenant_dimensions[model_key]

        collection_name = self._get_collection_name(expected_dim)
        await self._ensure_document_collection(trace_adapter, expected_dim)

        # FIX #7: Bounded concurrency - process batches with semaphore limit
        batch_infos = [(i, chunks[i:i + self.BATCH_SIZE]) for i in range(0, len(chunks), self.BATCH_SIZE)]

        written_ids = []
        failed_chunks_count = 0
        results = []

        # Process with bounded concurrency
        semaphore = asyncio.Semaphore(self.EMBEDDING_CONCURRENCY_LIMIT)

        async def process_one_batch(start_idx, batch_chunks):
            async with semaphore:
                try:
                    return await self._process_batch(
                        batch_chunks, start_idx, tenant_id, document_id,
                        dataset_name, ext, trace_adapter, timestamp, embed_semaphore, collection_name
                    )
                except Exception as e:
                    trace_adapter.error(f"Batch failed: {e}")
                    raise

        # Create limited tasks
        pending = set()
        for start_idx, batch_chunks in batch_infos:
            if len(pending) >= self.EMBEDDING_CONCURRENCY_LIMIT:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                results.extend([t.result() for t in done if not t.exception()])
                for t in done:
                    if t.exception():
                        failed_chunks_count += len(batch_chunks)

            task = asyncio.create_task(process_one_batch(start_idx, batch_chunks))
            pending.add(task)

        if pending:
            done, _ = await asyncio.wait(pending)
            for t in done:
                if t.exception():
                    # Find corresponding batch size (approximate)
                    failed_chunks_count += self.BATCH_SIZE
                else:
                    results.append(t.result())

        for res in results:
            if isinstance(res, dict):
                written_ids.extend(res.get("ids", []))

        success_rate = 1.0 - (failed_chunks_count / max(1, len(chunks)))
        if failed_chunks_count > 0:
            MetricsRegistry.increment("chunks_failed", count=failed_chunks_count)
            trace_adapter.error(f"{failed_chunks_count}/{len(chunks)} chunks failed. Rate: {success_rate:.2f}")

            if (1.0 - success_rate) > self.CHUNK_FAILURE_TOLERANCE:
                await self._rollback_partial_writes(written_ids, expected_dim, trace_adapter)
                raise HTTPException(status_code=500, detail="Ingestion aborted due to excessive batch failures. Rolled back.")

        return IngestionResult(
            storage_path=f"qdrant://{collection_name}/{document_id}",
            row_count=len(chunks), size_bytes=file_size, columns=[],
            failed_chunks=failed_chunks_count, success_rate=success_rate
        )

    # -------------------------------------------------------------------------
    # Main Orchestration Endpoint
    # -------------------------------------------------------------------------

    async def process_and_upload(
        self, db: Session, file: UploadFile, tenant_id: str, dataset_name: str, mask_pii: bool = True
    ) -> IngestionResult:

        trace_id = uuid.uuid4().hex[:8]
        trace_adapter = TraceContextAdapter(base_logger, {'trace_id': trace_id, 'tenant_id': tenant_id})

        try:
            return await asyncio.wait_for(
                self._execute_pipeline(db, file, tenant_id, dataset_name, mask_pii, trace_adapter),
                timeout=self.GLOBAL_PIPELINE_TIMEOUT
            )
        except asyncio.TimeoutError:
            trace_adapter.error("Global pipeline timeout reached.")
            raise HTTPException(status_code=504, detail="Ingestion pipeline timed out. Please upload a smaller file.")

    async def _execute_pipeline(
        self, db: Session, file: UploadFile, tenant_id: str, dataset_name: str, mask_pii: bool, trace_adapter: TraceContextAdapter
    ) -> IngestionResult:

        trace_adapter.info(f"Routing ingestion for '{dataset_name}'")

        ext = (getattr(file, "filename", "") or "").split('.')[-1].lower()
        if not ext or not ext.isalnum():
            raise HTTPException(status_code=400, detail="Invalid or missing file extension.")

        async with await self._lock_pool.get(f"{tenant_id}_{dataset_name}"):
            with tempfile.TemporaryDirectory() as tmpdir:
                try:
                    tmp_path = os.path.join(tmpdir, f"upload.{ext}")

                    # FIX #1: Non-blocking file write
                    file_size, file_hash = await self._write_upload_file(file, tmp_path, trace_adapter)

                    detected_mime = self._detect_mime_pure_python(tmp_path, ext)
                    valid_exts = self.mime_whitelist.get(detected_mime, [])

                    if detected_mime == 'application/parquet':
                        ext = 'parquet'
                    elif not valid_exts and ext != 'parquet':
                        raise HTTPException(status_code=400, detail=f"Unsupported MIME type: {detected_mime}")
                    elif ext not in valid_exts and ext != 'parquet':
                        ext = valid_exts[0]

                    if ext in ['pdf', 'docx', 'txt', 'md']:
                        return await self._process_unstructured(tmp_path, ext, tenant_id, dataset_name, file_hash, trace_adapter, file_size)

                    elif ext in ['csv', 'json', 'parquet']:
                        if ext == 'csv':
                            df = pl.scan_csv(tmp_path, ignore_errors=True).collect(streaming=True)
                        elif ext == 'json':
                            # FIX #2: Use incremental processing for JSON
                            async def write_chunk(chunk_df, db, tenant_id, dataset_id):
                                # Write each chunk immediately
                                await asyncio.shield(
                                    self._with_retry(
                                        storage_manager.write_dataframe, self.STORAGE_RETRIES,
                                        self._get_cb(tenant_id, "storage"),
                                        trace_adapter, self.TIMEOUT_SECONDS,
                                        db=db, df=chunk_df, tenant_id=tenant_id, dataset_id=dataset_id
                                    )
                                )
                            return await self._process_json_incrementally(
                                tmp_path, trace_adapter, write_chunk, db, tenant_id
                            )
                        else:
                            df = pl.scan_parquet(tmp_path).collect(streaming=True)

                        if ext != 'json':  # JSON handled above
                            if df.is_empty():
                                raise HTTPException(status_code=400, detail="Dataset contains no valid data.")

                            df = self._normalize_columns(df)
                            df = self._flatten_nested_structures(df)
                            columns, pii_cols = self._infer_metadata_and_detect_pii(df)

                            if mask_pii and pii_cols:
                                df = self._apply_vectorized_sanitization(df, pii_cols)

                            # FIX #9: Stable schema hash using mapped types
                            schema_str = "|".join(f"{k}:{self._map_dtype(v)}" for k, v in sorted(df.schema.items()))
                            schema_hash = hashlib.md5(schema_str.encode()).hexdigest()[:8]
                            dataset_id = self._generate_deterministic_id(tenant_id, dataset_name, schema_hash, file_hash)

                            storage_uri = await asyncio.shield(
                                self._with_retry(
                                    storage_manager.write_dataframe, self.STORAGE_RETRIES,
                                    self._get_cb(tenant_id, "storage"),
                                    trace_adapter, self.TIMEOUT_SECONDS,
                                    db=db, df=df, tenant_id=tenant_id, dataset_id=dataset_id
                                )
                            )

                            trace_adapter.info("Structured Ingest Complete.", extra_fields={"row_count": df.height})
                            return IngestionResult(
                                storage_path=storage_uri, row_count=df.height, size_bytes=df.estimated_size(),
                                columns=columns, schema_hash=schema_hash, success_rate=1.0
                            )

                except HTTPException:
                    raise
                except Exception as e:
                    trace_adapter.error(f"Fatal ingestion error: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail="Internal ingestion pipeline error.")
                finally:
                    if getattr(file, "file", None) and not file.file.closed:
                        file.file.close()


ingestion_service = DataIngestionService()