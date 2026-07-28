"""Compatibility facade for the public social-source ingestion pipeline.

The implementation is intentionally split by responsibility under
``api.services.social``.  This module keeps the long-standing import path
stable for worker messages, integrations, and customers running an older
deployment.  It re-exports the exact implementation objects rather than
wrapping them, so introspection, tracing, and error locations remain useful.
"""

from __future__ import annotations

import sys
from types import ModuleType

from api.services.social import (
    activation as _activation,
    additional_sources as _additional_sources,
    legacy_fetch as _legacy_fetch,
    legacy_pipeline as _legacy_pipeline,
    legacy_storage as _legacy_storage,
    models as _models,
    public_matching as _public_matching,
    public_records as _public_records,
    public_storage as _public_storage,
    queries as _queries,
)


_IMPLEMENTATION_MODULES: tuple[ModuleType, ...] = (
    _models,
    _queries,
    _legacy_fetch,
    _legacy_storage,
    _legacy_pipeline,
    _public_records,
    _public_storage,
    _activation,
    _additional_sources,
    _public_matching,
)


def _reexport_implementation() -> set[str]:
    """Expose split-module attributes without adding forwarding call frames."""
    exported: set[str] = set()
    for module in _IMPLEMENTATION_MODULES:
        for name, value in vars(module).items():
            if name.startswith("__"):
                continue
            globals()[name] = value
            if not name.startswith("_") and name != "annotations":
                exported.add(name)
    return exported


__all__ = tuple(sorted(_reexport_implementation()))


class _SocialIngestionCompatibilityModule(ModuleType):
    """Keep legacy dependency patches effective after the move-only split.

    Tests and a few deployments patch dependencies on this public module.  The
    production pipeline has no indirection during normal calls; this hook only
    mirrors explicit attribute replacement to implementation modules that
    already import the same name.  It preserves those patch seams without
    leaking a patch into an unrelated module.
    """

    def __setattr__(self, name: str, value: object) -> None:
        super().__setattr__(name, value)
        if name.startswith("__"):
            return
        for module in _IMPLEMENTATION_MODULES:
            if name in vars(module):
                setattr(module, name, value)


sys.modules[__name__].__class__ = _SocialIngestionCompatibilityModule
