import asyncio
import importlib
import inspect
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Awaitable, Callable
from types import FrameType
from typing import Any

logger = logging.getLogger("arcli.worker")

WORKER_RECYCLE_EXIT_CODE = 75
DEFAULT_MAX_RSS_MB = 384
DEFAULT_MAX_RSS_GROWTH_MB = 64
DEFAULT_MEMORY_CHECK_SECONDS = 15
DEFAULT_MEMORY_GRACE_SECONDS = 60
DEFAULT_MEMORY_GROWTH_SAMPLES = 2
DEFAULT_RECYCLE_TIMEOUT_SECONDS = 270
DRAMATIQ_RUNTIME_LIMITS = (
    # Eight normal messages keeps the original four worker threads supplied
    # without the network round-trip becoming the throughput bottleneck.
    ("dramatiq_queue_prefetch", "ARCLI_DRAMATIQ_QUEUE_PREFETCH", 8),
    (
        "dramatiq_delay_queue_prefetch",
        "ARCLI_DRAMATIQ_DELAY_QUEUE_PREFETCH",
        # This is deliberately far below Dramatiq's 1,000-per-thread default,
        # while retaining enough future retries to avoid delay-queue head-of-
        # line blocking under the normal four-thread workload.
        64,
    ),
    ("dramatiq_worker_timeout", "ARCLI_DRAMATIQ_WORKER_TIMEOUT_MS", 5_000),
)


class WorkerState:
    def __init__(self) -> None:
        self.shutdown_requested = threading.Event()
        self.recycle_requested = threading.Event()
        self.child_process: subprocess.Popen[bytes] | None = None
        self.signal_received_at: float | None = None


def configure_logging() -> None:
    logging.basicConfig(
        level=os.getenv("ARCLI_WORKER_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def csv_env(name: str, default: str) -> list[str]:
    raw_value = os.getenv(name, default)
    values = [item.strip() for item in raw_value.split(",") if item.strip()]
    if not values:
        raise RuntimeError(f"{name} must contain at least one module.")
    return values


def int_env(name: str, default: int, minimum: int = 1) -> int:
    raw_value = os.getenv(name, str(default))
    return int_value(name, raw_value, minimum)


def int_value(name: str, raw_value: str, minimum: int = 1) -> int:
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc

    if value < minimum:
        raise RuntimeError(f"{name} must be at least {minimum}.")
    return value


def dramatiq_runtime_environment() -> dict[str, str]:
    """Return settings that keep Dramatiq's in-memory buffers bounded.

    Dramatiq's defaults prefetch 1,000 delayed messages per worker thread for
    every declared delay queue.  A worker that is otherwise idle can therefore
    retain a large retry backlog in RAM.  Keep normal queues at one message and
    delayed queues at a small, bounded batch that still avoids retry head-of-
    line blocking.  An explicitly configured native Dramatiq variable takes
    precedence.
    """
    child_env = os.environ.copy()

    for dramatiq_name, arcli_name, default in DRAMATIQ_RUNTIME_LIMITS:
        value = os.getenv(dramatiq_name, "").strip()
        if not value:
            value = str(int_env(arcli_name, default))
        else:
            # A zero makes Dramatiq fall back to its unbounded default, so
            # reject it rather than silently disabling the memory guardrail.
            value = str(int_value(dramatiq_name, value))

        # os.environ is case-insensitive on Windows whereas a copied dict is
        # not.  Normalize the child mapping so explicit native settings work
        # consistently in local checks and Linux deployments alike.
        for env_name in tuple(child_env):
            if env_name.casefold() == dramatiq_name.casefold():
                del child_env[env_name]
        child_env[dramatiq_name] = value

    return child_env


def apply_dramatiq_runtime_environment() -> dict[str, str]:
    """Install Dramatiq's native settings before its modules are imported."""
    runtime_env = dramatiq_runtime_environment()
    for dramatiq_name, _, _ in DRAMATIQ_RUNTIME_LIMITS:
        for env_name in tuple(os.environ):
            if env_name.casefold() == dramatiq_name.casefold():
                del os.environ[env_name]
        os.environ[dramatiq_name] = runtime_env[dramatiq_name]
    return runtime_env


def read_process_rss_bytes(pid: int) -> int | None:
    """Read a child process's RSS without retaining application objects."""
    try:
        import psutil

        return int(psutil.Process(pid).memory_info().rss)
    except Exception as exc:
        logger.warning(
            "worker_memory_sample_failed pid=%s error_type=%s error=%s",
            pid,
            exc.__class__.__name__,
            exc,
        )
        return None


def memory_recycle_reason(
    *,
    rss_bytes: int,
    baseline_rss_bytes: int | None,
    max_rss_mb: int,
    max_rss_growth_mb: int,
    growth_breach_samples: int,
    required_growth_samples: int,
) -> tuple[str | None, int]:
    """Return a recycle reason after enforcing a hard cap or sustained growth."""
    max_rss_bytes = max_rss_mb * 1024 * 1024
    max_growth_bytes = max_rss_growth_mb * 1024 * 1024
    exceeded_hard_limit = bool(max_rss_bytes and rss_bytes >= max_rss_bytes)
    exceeded_growth_limit = bool(
        max_growth_bytes
        and baseline_rss_bytes is not None
        and rss_bytes >= baseline_rss_bytes + max_growth_bytes
    )
    next_growth_breach_samples = (
        growth_breach_samples + 1 if exceeded_growth_limit else 0
    )
    if exceeded_hard_limit:
        return "rss_cap", next_growth_breach_samples
    if next_growth_breach_samples >= required_growth_samples:
        return "sustained_rss_growth", next_growth_breach_samples
    return None, next_growth_breach_samples


def verify_dramatiq_version(dramatiq_module: Any) -> str:
    expected_version = os.getenv("ARCLI_REQUIRED_DRAMATIQ_VERSION", "2.2.0").strip()
    installed_version = str(getattr(dramatiq_module, "__version__", ""))
    if installed_version != expected_version:
        raise RuntimeError(
            "Dramatiq version mismatch: "
            f"expected {expected_version}, found {installed_version or 'unknown'}."
        )
    return installed_version


def close_dramatiq_broker(broker: Any) -> None:
    """Release Redis sockets before a child exits or is recycled."""
    try:
        close_broker = getattr(broker, "close", None)
        if callable(close_broker):
            close_broker()
    finally:
        client = getattr(broker, "client", None)
        close_client = getattr(client, "close", None)
        try:
            if callable(close_client):
                close_client()
        finally:
            connection_pool = getattr(client, "connection_pool", None)
            disconnect_pool = getattr(connection_pool, "disconnect", None)
            if callable(disconnect_pool):
                disconnect_pool()


def register_signal_handlers(
    state: WorkerState,
    *,
    allow_recycle: bool = False,
) -> None:
    def handle_signal(signum: int, _frame: FrameType | None) -> None:
        signal_name = signal.Signals(signum).name
        logger.info("worker_shutdown_signal_received signal=%s", signal_name)
        state.shutdown_requested.set()
        state.signal_received_at = time.monotonic()

        child_process = state.child_process
        if child_process and child_process.poll() is None:
            logger.info(
                "forwarding_shutdown_signal_to_child pid=%s signal=%s",
                child_process.pid,
                signal_name,
            )
            child_process.send_signal(signum)

    def handle_recycle(_signum: int, _frame: FrameType | None) -> None:
        logger.warning("worker_memory_recycle_signal_received")
        state.recycle_requested.set()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    if allow_recycle and hasattr(signal, "SIGUSR1"):
        signal.signal(signal.SIGUSR1, handle_recycle)


def _send_memory_recycle_signal(
    child_process: subprocess.Popen[bytes],
    *,
    reason: str,
    rss_bytes: int,
    baseline_rss_bytes: int | None,
) -> bool:
    if not hasattr(signal, "SIGUSR1"):
        logger.error("worker_memory_recycle_unsupported reason=missing_sigusr1")
        return False

    child_process.send_signal(signal.SIGUSR1)
    logger.warning(
        "worker_memory_limit_exceeded pid=%s reason=%s rss_bytes=%s "
        "baseline_rss_bytes=%s action=request_graceful_recycle",
        child_process.pid,
        reason,
        rss_bytes,
        baseline_rss_bytes,
    )
    return True


def run_embedded_dramatiq_worker(state: WorkerState) -> int:
    """Run one worker process, without Dramatiq's CLI master/fork layer."""
    runtime_env = apply_dramatiq_runtime_environment()
    modules = csv_env("ARCLI_DRAMATIQ_MODULES", "api.worker")
    processes = int_env("DRAMATIQ_PROCESSES", 1)
    threads = int_env("DRAMATIQ_THREADS", 1)
    shutdown_timeout = int_env("ARCLI_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 240)
    worker_shutdown_timeout_ms = max(1_000, (shutdown_timeout - 10) * 1_000)
    if processes != 1:
        raise RuntimeError(
            "The embedded Dramatiq worker supports exactly one process. "
            "Scale with worker instances instead."
        )

    for module_name in modules:
        importlib.import_module(module_name)

    import dramatiq

    from api.worker_lifecycle import WorkerActivityTracker

    version = verify_dramatiq_version(dramatiq)
    broker = dramatiq.get_broker()
    activity_tracker = WorkerActivityTracker()
    broker.add_middleware(activity_tracker)
    broker.emit_after("process_boot")
    worker = dramatiq.Worker(
        broker,
        worker_threads=threads,
        worker_timeout=int(runtime_env["dramatiq_worker_timeout"]),
    )

    logger.info(
        "starting_embedded_dramatiq_worker modules=%s processes=%s threads=%s "
        "queue_prefetch=%s delay_queue_prefetch=%s worker_timeout_ms=%s "
        "dramatiq_version=%s",
        ",".join(modules),
        processes,
        threads,
        runtime_env["dramatiq_queue_prefetch"],
        runtime_env["dramatiq_delay_queue_prefetch"],
        runtime_env["dramatiq_worker_timeout"],
        version,
    )

    recycle = False
    try:
        worker.start()
        while not state.shutdown_requested.wait(1.0):
            if state.recycle_requested.is_set():
                # pause waits for active actor calls to finish and prevents a
                # new one from starting; stop below requeues buffered messages.
                worker.pause()
                if activity_tracker.active_count:
                    logger.warning(
                        "embedded_dramatiq_worker_recycle_deferred active_messages=%s",
                        activity_tracker.active_count,
                    )
                    state.recycle_requested.clear()
                    worker.resume()
                    continue
                recycle = not state.shutdown_requested.is_set()
                break
    finally:
        try:
            worker.stop(timeout=worker_shutdown_timeout_ms)
        finally:
            close_dramatiq_broker(broker)

    if recycle:
        logger.info("embedded_dramatiq_worker_recycled exit_code=%s", WORKER_RECYCLE_EXIT_CODE)
        return WORKER_RECYCLE_EXIT_CODE
    return 0


def run_dramatiq_worker(state: WorkerState) -> int:
    """Supervise one lean embedded worker and recycle it before OOM."""
    modules = csv_env("ARCLI_DRAMATIQ_MODULES", "api.worker")
    processes = int_env("DRAMATIQ_PROCESSES", 1)
    threads = int_env("DRAMATIQ_THREADS", 1)
    shutdown_timeout = int_env("ARCLI_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 240)
    runtime_env = dramatiq_runtime_environment()
    max_rss_mb = int_env("ARCLI_WORKER_MAX_RSS_MB", DEFAULT_MAX_RSS_MB, minimum=0)
    max_rss_growth_mb = int_env(
        "ARCLI_WORKER_MAX_RSS_GROWTH_MB",
        DEFAULT_MAX_RSS_GROWTH_MB,
        minimum=0,
    )
    memory_check_seconds = int_env(
        "ARCLI_WORKER_MEMORY_CHECK_SECONDS",
        DEFAULT_MEMORY_CHECK_SECONDS,
    )
    memory_grace_seconds = int_env(
        "ARCLI_WORKER_MEMORY_GRACE_SECONDS",
        DEFAULT_MEMORY_GRACE_SECONDS,
        minimum=0,
    )
    memory_growth_samples = int_env(
        "ARCLI_WORKER_MEMORY_GROWTH_SAMPLES",
        DEFAULT_MEMORY_GROWTH_SAMPLES,
    )
    recycle_timeout_seconds = int_env(
        "ARCLI_WORKER_RECYCLE_TIMEOUT_SECONDS",
        DEFAULT_RECYCLE_TIMEOUT_SECONDS,
    )
    if processes != 1:
        raise RuntimeError(
            "The supervised embedded Dramatiq worker supports exactly one process. "
            "Scale with worker instances instead."
        )

    command = [
        sys.executable,
        os.path.abspath(__file__),
        "--dramatiq-child",
    ]
    logger.info(
        "starting_dramatiq_supervisor modules=%s processes=%s threads=%s "
        "queue_prefetch=%s delay_queue_prefetch=%s worker_timeout_ms=%s "
        "max_rss_mb=%s max_rss_growth_mb=%s memory_check_seconds=%s "
        "memory_growth_samples=%s",
        ",".join(modules),
        processes,
        threads,
        runtime_env["dramatiq_queue_prefetch"],
        runtime_env["dramatiq_delay_queue_prefetch"],
        runtime_env["dramatiq_worker_timeout"],
        max_rss_mb,
        max_rss_growth_mb,
        memory_check_seconds,
        memory_growth_samples,
    )

    while not state.shutdown_requested.is_set():
        child_process = subprocess.Popen(command, env=runtime_env)
        state.child_process = child_process
        next_memory_check_at = time.monotonic() + memory_grace_seconds
        baseline_rss_bytes: int | None = None
        growth_breach_samples = 0
        recycle_requested_at: float | None = None

        while child_process.poll() is None:
            now = time.monotonic()
            if state.shutdown_requested.is_set():
                if (
                    state.signal_received_at is not None
                    and now - state.signal_received_at > shutdown_timeout
                ):
                    logger.error(
                        "embedded_dramatiq_worker_shutdown_timeout_exceeded pid=%s timeout_seconds=%s",
                        child_process.pid,
                        shutdown_timeout,
                    )
                    child_process.kill()
                    return 124
            elif recycle_requested_at is not None:
                if now - recycle_requested_at > recycle_timeout_seconds:
                    logger.error(
                        "embedded_dramatiq_worker_recycle_timeout_exceeded pid=%s timeout_seconds=%s",
                        child_process.pid,
                        recycle_timeout_seconds,
                    )
                    child_process.kill()
                    return 124
            elif (max_rss_mb or max_rss_growth_mb) and now >= next_memory_check_at:
                next_memory_check_at = now + memory_check_seconds
                rss_bytes = read_process_rss_bytes(child_process.pid)
                if rss_bytes is not None:
                    if baseline_rss_bytes is None:
                        baseline_rss_bytes = rss_bytes
                        logger.info(
                            "embedded_dramatiq_worker_memory_baseline pid=%s rss_bytes=%s",
                            child_process.pid,
                            baseline_rss_bytes,
                        )

                    reason, growth_breach_samples = memory_recycle_reason(
                        rss_bytes=rss_bytes,
                        baseline_rss_bytes=baseline_rss_bytes,
                        max_rss_mb=max_rss_mb,
                        max_rss_growth_mb=max_rss_growth_mb,
                        growth_breach_samples=growth_breach_samples,
                        required_growth_samples=memory_growth_samples,
                    )
                    if reason:
                        if _send_memory_recycle_signal(
                            child_process,
                            reason=reason,
                            rss_bytes=rss_bytes,
                            baseline_rss_bytes=baseline_rss_bytes,
                        ):
                            recycle_requested_at = now
                        else:
                            child_process.terminate()
                            return 124

            time.sleep(1.0)

        return_code = child_process.returncode
        state.child_process = None
        if state.shutdown_requested.is_set():
            logger.info("embedded_dramatiq_worker_exited return_code=%s", return_code)
            return int(return_code or 0)
        if return_code == WORKER_RECYCLE_EXIT_CODE:
            logger.info("embedded_dramatiq_worker_restart_completed")
            continue

        logger.error("embedded_dramatiq_worker_exited_unexpectedly return_code=%s", return_code)
        return int(return_code or 1)

    return 0


def load_loop_target() -> Callable[..., Any]:
    target = os.getenv("ARCLI_WORKER_LOOP_TARGET", "api.worker:run")
    module_name, separator, callable_name = target.partition(":")
    if not separator or not module_name or not callable_name:
        raise RuntimeError(
            "ARCLI_WORKER_LOOP_TARGET must use the format 'module:function'."
        )

    module = importlib.import_module(module_name)
    target_callable = getattr(module, callable_name)
    if not callable(target_callable):
        raise RuntimeError(f"{target} is not callable.")
    return target_callable


def run_python_loop(state: WorkerState) -> int:
    apply_dramatiq_runtime_environment()
    target_callable = load_loop_target()
    signature = inspect.signature(target_callable)
    logger.info("starting_python_worker_loop target=%s", target_callable)

    result: Any
    if len(signature.parameters) == 0:
        result = target_callable()
    else:
        result = target_callable(state.shutdown_requested)

    if isinstance(result, Awaitable):
        result = asyncio.run(result)

    return int(result) if isinstance(result, int) else 0


def main() -> int:
    configure_logging()
    state = WorkerState()

    if "--dramatiq-child" in sys.argv:
        register_signal_handlers(state, allow_recycle=True)
        return run_embedded_dramatiq_worker(state)

    register_signal_handlers(state)

    backend = os.getenv("ARCLI_WORKER_BACKEND", "dramatiq").strip().lower()
    logger.info("worker_entrypoint_started backend=%s", backend)

    if backend == "dramatiq":
        return run_dramatiq_worker(state)
    if backend == "loop":
        return run_python_loop(state)

    raise RuntimeError("ARCLI_WORKER_BACKEND must be 'dramatiq' or 'loop'.")


if __name__ == "__main__":
    sys.exit(main())
