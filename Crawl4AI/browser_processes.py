"""Reclaim browser processes that outlive a Crawl4AI crawl.

The worker's memory guard samples only the Python process, so a Chromium that
survives a failed or timed-out shutdown is invisible to it and would hold its
memory until the container is killed. This module is the backstop: once no
crawl is using a browser, any browser process still under this worker is an
orphan and is terminated.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

BROWSER_PROCESS_NAME_MARKERS = ("chrom", "headless_shell")
# Playwright's Node driver is started as ``node .../playwright/driver/package/
# cli.js run-driver`` and keeps its own heap after the browser is gone.
PLAYWRIGHT_DRIVER_ARGUMENT = "run-driver"
TERMINATE_WAIT_SECONDS = 3.0

_session_lock = threading.Lock()
_active_sessions = 0


class BrowserSession:
    """Mark the span in which a crawl legitimately owns browser processes."""

    def __enter__(self) -> "BrowserSession":
        global _active_sessions
        with _session_lock:
            _active_sessions += 1
        return self

    def __exit__(self, *_: object) -> None:
        global _active_sessions
        with _session_lock:
            _active_sessions = max(0, _active_sessions - 1)


def _is_browser_process(process: Any) -> bool:
    try:
        name = (process.name() or "").lower()
        if any(marker in name for marker in BROWSER_PROCESS_NAME_MARKERS):
            return True
        command_line = [str(part).lower() for part in process.cmdline()]
    except Exception:
        # The process exited or is not readable; either way it is not ours to
        # reclaim.
        return False
    return PLAYWRIGHT_DRIVER_ARGUMENT in command_line and any(
        "playwright" in part for part in command_line
    )


def terminate_orphaned_browsers() -> int:
    """Terminate leftover browser processes and return how many were found.

    Nothing is touched while any crawl in this process still owns a browser,
    so concurrent crawls can never reclaim each other's Chromium.
    """
    try:
        import psutil
    except ImportError:
        return 0

    # The lock covers only the snapshot: a crawl that starts afterwards launches
    # processes that are not in it, so it is safe to terminate outside the lock
    # without delaying that crawl's browser launch.
    with _session_lock:
        if _active_sessions:
            return 0
        try:
            descendants = psutil.Process().children(recursive=True)
        except psutil.Error:
            return 0
        orphans = [process for process in descendants if _is_browser_process(process)]
    if not orphans:
        return 0

    for process in orphans:
        try:
            process.terminate()
        except psutil.Error:
            continue
    _, still_alive = psutil.wait_procs(orphans, timeout=TERMINATE_WAIT_SECONDS)
    for process in still_alive:
        try:
            process.kill()
        except psutil.Error:
            continue

    logger.warning(
        "crawl4ai_orphaned_browsers_terminated count=%s force_killed=%s",
        len(orphans),
        len(still_alive),
    )
    return len(orphans)
