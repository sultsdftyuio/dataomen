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
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc

    if value < minimum:
        raise RuntimeError(f"{name} must be at least {minimum}.")
    return value


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
    threads = int_env("DRAMATIQ_THREADS", 4)
    shutdown_timeout = int_env("ARCLI_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 120)

    command = [
        sys.executable,
        "-m",
        "dramatiq",
        "--processes",
        str(processes),
        "--threads",
        str(threads),
        *modules,
    ]
    logger.info(
        "starting_dramatiq_worker modules=%s processes=%s threads=%s",
        ",".join(modules),
        processes,
        threads,
    )

    state.child_process = subprocess.Popen(command)
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
