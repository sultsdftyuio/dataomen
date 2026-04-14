import io
import sys
import types
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from enum import Enum
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy.exc import SQLAlchemyError

# Minimal models stub for route-level upload testing.
models_stub = types.ModuleType("models")


class _DatasetStatusStub(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class _DatasetStub:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.id = getattr(self, "id", None)
        self.created_at = getattr(self, "created_at", None)


models_stub.Dataset = _DatasetStub
models_stub.DatasetStatus = _DatasetStatusStub
sys.modules.setdefault("models", models_stub)

# Preload lightweight stubs so importing the route module does not require full auth stack.
auth_stub = types.ModuleType("api.auth")


@dataclass
class _TenantContextStub:
    tenant_id: str


def _verify_tenant_stub():
    raise RuntimeError("verify_tenant should not be called directly in these tests")


auth_stub.TenantContext = _TenantContextStub
auth_stub.verify_tenant = _verify_tenant_stub
sys.modules.setdefault("api.auth", auth_stub)

database_stub = types.ModuleType("api.database")


def _get_db_stub():
    raise RuntimeError("get_db should not be called directly in these tests")


database_stub.get_db = _get_db_stub
sys.modules.setdefault("api.database", database_stub)

storage_stub = types.ModuleType("api.services.storage_manager")


class _StorageManagerStub:
    async def upload_raw_file_async(self, *_args, **_kwargs):
        return "s3://stub"

    def delete_file(self, *_args, **_kwargs):
        return None


storage_stub.storage_manager = _StorageManagerStub()
sys.modules.setdefault("api.services.storage_manager", storage_stub)

cache_stub = types.ModuleType("api.services.cache_manager")


class _CacheManagerStub:
    async def invalidate_dataset_cache(self, *_args, **_kwargs):
        return None


cache_stub.cache_manager = _CacheManagerStub()
sys.modules.setdefault("api.services.cache_manager", cache_stub)

sync_stub = types.ModuleType("api.services.sync_engine")
sync_stub.INTEGRATION_REGISTRY = {"stripe": object(), "shopify": object()}
sys.modules.setdefault("api.services.sync_engine", sync_stub)

worker_stub = types.ModuleType("compute_worker")


class _TaskStub:
    def delay(self, *_args, **_kwargs):
        return SimpleNamespace(id="job-stub")


worker_stub.process_ingestion_dataset = _TaskStub()
sys.modules.setdefault("compute_worker", worker_stub)

from api.routes import datasets as datasets_route
from models import DatasetStatus


pytestmark = pytest.mark.asyncio


def _make_upload_file(filename: str, payload: bytes = b"col_a,col_b\n1,2\n") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(payload))


@pytest.fixture
def tenant_context() -> SimpleNamespace:
    return SimpleNamespace(tenant_id="tenant_abc123")


@pytest.fixture
def mock_db() -> MagicMock:
    db = MagicMock()

    def _refresh(dataset):
        if getattr(dataset, "id", None) is None:
            dataset.id = uuid.uuid4()
        if getattr(dataset, "created_at", None) is None:
            dataset.created_at = datetime.now(timezone.utc)

    db.refresh.side_effect = _refresh
    return db


@pytest.mark.parametrize(
    "extension",
    ["csv", "json", "jsonl", "ndjson", "parquet", "txt", "md", "pdf", "docx"],
)
async def test_upload_dataset_accepts_supported_extensions(extension: str, tenant_context: SimpleNamespace, mock_db: MagicMock, monkeypatch: pytest.MonkeyPatch):
    upload_mock = AsyncMock(return_value=f"s3://bucket/tenants/tenant_id={tenant_context.tenant_id}/raw/file.{extension}")
    delay_mock = MagicMock(return_value=SimpleNamespace(id="job-1"))

    monkeypatch.setattr(datasets_route.storage_manager, "upload_raw_file_async", upload_mock)
    monkeypatch.setattr(datasets_route.process_ingestion_dataset, "delay", delay_mock)

    file = _make_upload_file(f"dataset.{extension}")
    response = await datasets_route.upload_dataset(name="  Sales Dataset  ", file=file, context=tenant_context, db=mock_db)

    assert response["name"] == "Sales Dataset"
    assert response["status"] == "PENDING"
    assert response["schema_metadata"]["original_filename"] == f"dataset.{extension}"
    upload_mock.assert_awaited_once()
    delay_mock.assert_called_once()
    assert file.file.closed


@pytest.mark.parametrize("extension", ["xlsx", "exe", "zip", "pptx"])
async def test_upload_dataset_rejects_unsupported_extensions(extension: str, tenant_context: SimpleNamespace, mock_db: MagicMock, monkeypatch: pytest.MonkeyPatch):
    upload_mock = AsyncMock()
    delay_mock = MagicMock()

    monkeypatch.setattr(datasets_route.storage_manager, "upload_raw_file_async", upload_mock)
    monkeypatch.setattr(datasets_route.process_ingestion_dataset, "delay", delay_mock)

    file = _make_upload_file(f"dataset.{extension}")

    with pytest.raises(HTTPException) as exc_info:
        await datasets_route.upload_dataset(name="Sales", file=file, context=tenant_context, db=mock_db)

    assert exc_info.value.status_code == 400
    assert "Unsupported file type" in str(exc_info.value.detail)
    upload_mock.assert_not_called()
    delay_mock.assert_not_called()


async def test_upload_dataset_rejects_oversized_payload(tenant_context: SimpleNamespace, mock_db: MagicMock, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(datasets_route, "MAX_UPLOAD_BYTES", 10)
    upload_mock = AsyncMock()
    delay_mock = MagicMock()

    monkeypatch.setattr(datasets_route.storage_manager, "upload_raw_file_async", upload_mock)
    monkeypatch.setattr(datasets_route.process_ingestion_dataset, "delay", delay_mock)

    file = _make_upload_file("dataset.csv", payload=b"01234567890")

    with pytest.raises(HTTPException) as exc_info:
        await datasets_route.upload_dataset(name="Sales", file=file, context=tenant_context, db=mock_db)

    assert exc_info.value.status_code == 413
    upload_mock.assert_not_called()
    delay_mock.assert_not_called()


async def test_upload_dataset_cleans_up_orphaned_file_on_db_failure(tenant_context: SimpleNamespace, mock_db: MagicMock, monkeypatch: pytest.MonkeyPatch):
    upload_path = f"s3://bucket/tenants/tenant_id={tenant_context.tenant_id}/raw/file.csv"
    upload_mock = AsyncMock(return_value=upload_path)
    delete_mock = MagicMock()
    delay_mock = MagicMock()

    monkeypatch.setattr(datasets_route.storage_manager, "upload_raw_file_async", upload_mock)
    monkeypatch.setattr(datasets_route.storage_manager, "delete_file", delete_mock)
    monkeypatch.setattr(datasets_route.process_ingestion_dataset, "delay", delay_mock)

    mock_db.commit.side_effect = SQLAlchemyError("db write failure")
    file = _make_upload_file("dataset.csv")

    with pytest.raises(HTTPException) as exc_info:
        await datasets_route.upload_dataset(name="Sales", file=file, context=tenant_context, db=mock_db)

    assert exc_info.value.status_code == 500
    delete_mock.assert_called_once_with(upload_path)
    delay_mock.assert_not_called()


async def test_upload_dataset_marks_failed_when_queue_dispatch_fails(tenant_context: SimpleNamespace, mock_db: MagicMock, monkeypatch: pytest.MonkeyPatch):
    upload_mock = AsyncMock(return_value=f"s3://bucket/tenants/tenant_id={tenant_context.tenant_id}/raw/file.csv")

    added_dataset = {}

    def _capture_add(dataset):
        added_dataset["dataset"] = dataset

    mock_db.add.side_effect = _capture_add

    def _raise_dispatch(*_args, **_kwargs):
        raise RuntimeError("queue unavailable")

    monkeypatch.setattr(datasets_route.storage_manager, "upload_raw_file_async", upload_mock)
    monkeypatch.setattr(datasets_route.process_ingestion_dataset, "delay", _raise_dispatch)

    file = _make_upload_file("dataset.csv")

    with pytest.raises(HTTPException) as exc_info:
        await datasets_route.upload_dataset(name="Sales", file=file, context=tenant_context, db=mock_db)

    assert exc_info.value.status_code == 503
    assert added_dataset["dataset"].status == DatasetStatus.FAILED
    assert added_dataset["dataset"].schema_metadata["ingestion_error"] == "Failed to enqueue ingestion task"
