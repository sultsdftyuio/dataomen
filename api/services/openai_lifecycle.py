"""Deterministic ownership and cleanup for synchronous OpenAI clients."""

from contextlib import AbstractContextManager
from typing import Any
from weakref import finalize


def _close_client(client: Any) -> None:
    close = getattr(client, "close", None)
    if callable(close):
        close()


class OpenAIClientOwner(AbstractContextManager):
    """Build at most one owned client and close it when the service scope ends."""

    client: Any | None
    _owns_client: bool
    _client_finalizer: Any | None = None

    def _get_client(self) -> Any:
        if self.client is None:
            self.client = self._build_client()
            self._owns_client = True
            self._client_finalizer = finalize(self, _close_client, self.client)
        return self.client

    def close(self) -> None:
        client, self.client = self.client, None
        try:
            if self._owns_client and client is not None:
                if self._client_finalizer is not None:
                    self._client_finalizer.detach()
                _close_client(client)
        finally:
            self._owns_client = False
            self._client_finalizer = None

    def __exit__(self, *_: object) -> None:
        self.close()
