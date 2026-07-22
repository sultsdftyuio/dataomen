"""Lifecycle helpers for the single-process Dramatiq worker."""

import threading

from dramatiq.middleware import Middleware


class WorkerActivityTracker(Middleware):
    """Track actor execution so a memory recycle only happens while idle."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_count = 0

    @property
    def active_count(self) -> int:
        with self._lock:
            return self._active_count

    def before_process_message(self, broker, message) -> None:
        with self._lock:
            self._active_count += 1

    def after_process_message(
        self,
        broker,
        message,
        *,
        result=None,
        exception=None,
    ) -> None:
        with self._lock:
            self._active_count = max(0, self._active_count - 1)

    after_skip_message = after_process_message
