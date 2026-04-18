"""Compatibility shim for services that import the Celery app from api.worker."""

from compute_worker import celery_app

__all__ = ["celery_app"]
