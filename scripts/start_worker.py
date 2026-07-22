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


class WorkerState:
    def __init__(self) -> None:
        self.shutdown_requested = threading.Event()
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
    """Return child-process settings that keep Dramatiq's in-memory buffers bounded.

    Dramatiq's defaults prefetch 1,000 delayed messages per worker thread for
    every declared delay queue.  A worker that is otherwise idle can therefore
    retain a large retry backlog in RAM.  Keep normal queues at one message and
    delayed queues at a small, bounded batch that still avoids retry head-of-
    line blocking.  An explicitly configured native Dramatiq variable takes
    precedence.
    """
    child_env = os.environ.copy()
    limits = (
        ("dramatiq_queue_prefetch", "ARCLI_DRAMATIQ_QUEUE_PREFETCH", 1),
        (
            "dramatiq_delay_queue_prefetch",
            "ARCLI_DRAMATIQ_DELAY_QUEUE_PREFETCH",
            16,
        ),
        ("dramatiq_worker_timeout", "ARCLI_DRAMATIQ_WORKER_TIMEOUT_MS", 5_000),
    )

    for dramatiq_name, arcli_name, default in limits:
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


def register_signal_handlers(state: WorkerState) -> None:
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

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)


def run_dramatiq_worker(state: WorkerState) -> int:
    modules = csv_env("ARCLI_DRAMATIQ_MODULES", "api.worker")
    processes = int_env("DRAMATIQ_PROCESSES", 1)
    threads = int_env("DRAMATIQ_THREADS", 1)
    shutdown_timeout = int_env("ARCLI_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 120)
    dramatiq_shutdown_timeout_ms = max(1_000, (shutdown_timeout - 5) * 1_000)
    runtime_env = dramatiq_runtime_environment()

    command = [
        sys.executable,
        "-m",
        "dramatiq",
        "--processes",
        str(processes),
        "--threads",
        str(threads),
        "--worker-shutdown-timeout",
        str(dramatiq_shutdown_timeout_ms),
        *modules,
    ]
    logger.info(
        "starting_dramatiq_worker modules=%s processes=%s threads=%s "
        "queue_prefetch=%s delay_queue_prefetch=%s worker_timeout_ms=%s",
        ",".join(modules),
        processes,
        threads,
        runtime_env["dramatiq_queue_prefetch"],
        runtime_env["dramatiq_delay_queue_prefetch"],
        runtime_env["dramatiq_worker_timeout"],
    )

    state.child_process = subprocess.Popen(command, env=runtime_env)
    while True:
        return_code = state.child_process.poll()
        if return_code is not None:
            logger.info("dramatiq_worker_exited return_code=%s", return_code)
            return return_code

        if (
            state.signal_received_at is not None
            and time.monotonic() - state.signal_received_at > shutdown_timeout
        ):
            logger.error(
                "dramatiq_worker_shutdown_timeout_exceeded timeout_seconds=%s",
                shutdown_timeout,
            )
            state.child_process.kill()
            return 124

        time.sleep(1.0)


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
