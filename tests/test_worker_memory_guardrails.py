import os
import sys
import subprocess
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts import start_worker


class _Event:
    def __init__(self, value: bool = False) -> None:
        self.value = value

    def clear(self) -> None:
        self.value = False

    def is_set(self) -> bool:
        return self.value

    def set(self) -> None:
        self.value = True

    def wait(self, _timeout: float | None = None) -> bool:
        return self.value


class _ImmediatelyExitedProcess:
    pid = 12345
    returncode = 1

    def poll(self) -> int:
        return self.returncode


class _Broker:
    def __init__(self) -> None:
        self.client = SimpleNamespace(
            close=self._close_client,
            connection_pool=SimpleNamespace(disconnect=self._disconnect_pool),
        )
        self.calls: list[tuple[str, object]] = []
        self.client_closed = False
        self.pool_disconnected = False

    def _close_client(self) -> None:
        self.client_closed = True

    def _disconnect_pool(self) -> None:
        self.pool_disconnected = True

    def add_middleware(self, middleware: object) -> None:
        self.calls.append(("add_middleware", middleware))

    def close(self) -> None:
        self.calls.append(("close", None))

    def emit_after(self, signal: str) -> None:
        self.calls.append(("emit_after", signal))


class _Worker:
    def __init__(self) -> None:
        self.started = False
        self.stopped_with: int | None = None
        self.paused = False
        self.resumed = False

    def start(self) -> None:
        self.started = True

    def pause(self) -> None:
        self.paused = True

    def resume(self) -> None:
        self.resumed = True

    def stop(self, *, timeout: int) -> None:
        self.stopped_with = timeout


class DramatiqMemoryGuardrailTests(unittest.TestCase):
    def test_default_worker_concurrency_is_single_process_four_threads(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                start_worker.int_env("DRAMATIQ_PROCESSES", start_worker.DRAMATIQ_PROCESSES),
                1,
            )
            self.assertEqual(
                start_worker.int_env("DRAMATIQ_THREADS", start_worker.DRAMATIQ_THREADS),
                4,
            )
        self.assertEqual(
            start_worker.dramatiq_concurrency_command(),
            ("dramatiq", "api.worker:broker", "-p", "1", "-t", "4"),
        )

    def test_worker_registry_keeps_heavy_services_out_of_idle_imports(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        startup_check = """
import os
import sys
os.environ['REDIS_URL'] = 'redis://127.0.0.1:6379/0'
import api.worker
blocked = {
    name for name in sys.modules
    if name in {
        'api.services.crawling',
        'api.services.embeddings',
        'api.services.ingestion_service',
        'api.services.profile_extraction',
        'api.services.social_ingestion',
        'httpx', 'openai', 'supabase', 'tiktoken', 'fitz',
    }
}
raise SystemExit(','.join(sorted(blocked)))
"""
        started_at = time.perf_counter()
        result = subprocess.run(
            [sys.executable, "-c", startup_check],
            cwd=project_root,
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        startup_seconds = time.perf_counter() - started_at

        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        self.assertLess(startup_seconds, 5.0)

    def test_runtime_environment_bounds_prefetch_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            runtime_env = start_worker.dramatiq_runtime_environment()

        self.assertEqual(runtime_env["dramatiq_queue_prefetch"], "8")
        self.assertEqual(runtime_env["dramatiq_delay_queue_prefetch"], "64")
        self.assertEqual(runtime_env["dramatiq_worker_timeout"], "5000")

    def test_apply_runtime_environment_happens_before_direct_import(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            runtime_env = start_worker.apply_dramatiq_runtime_environment()

            self.assertEqual(os.environ["dramatiq_queue_prefetch"], "8")
            self.assertEqual(
                os.environ["dramatiq_delay_queue_prefetch"],
                "64",
            )
            self.assertEqual(os.environ["dramatiq_worker_timeout"], "5000")
            self.assertEqual(runtime_env["dramatiq_worker_timeout"], "5000")

    def test_runtime_environment_honors_explicit_dramatiq_override(self) -> None:
        with patch.dict(
            os.environ,
            {
                "dramatiq_queue_prefetch": "3",
                "ARCLI_DRAMATIQ_DELAY_QUEUE_PREFETCH": "2",
            },
            clear=True,
        ):
            runtime_env = start_worker.dramatiq_runtime_environment()

        self.assertEqual(runtime_env["dramatiq_queue_prefetch"], "3")
        self.assertEqual(runtime_env["dramatiq_delay_queue_prefetch"], "2")

    def test_runtime_environment_rejects_unbounded_native_prefetch(self) -> None:
        with patch.dict(
            os.environ,
            {"dramatiq_delay_queue_prefetch": "0"},
            clear=True,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "dramatiq_delay_queue_prefetch must be at least 1",
            ):
                start_worker.dramatiq_runtime_environment()

    def test_supervisor_starts_direct_worker_child_with_bounded_environment(self) -> None:
        process = _ImmediatelyExitedProcess()
        with (
            patch.dict(
                os.environ,
                {
                    "ARCLI_DRAMATIQ_MODULES": "api.worker",
                    "DRAMATIQ_PROCESSES": "1",
                    "DRAMATIQ_THREADS": "1",
                },
                clear=True,
            ),
            patch("scripts.start_worker.subprocess.Popen", return_value=process) as popen,
            patch("scripts.start_worker.logger"),
        ):
            return_code = start_worker.run_dramatiq_worker(start_worker.WorkerState())

        self.assertEqual(return_code, 1)
        command = popen.call_args.args[0]
        child_env = popen.call_args.kwargs["env"]
        self.assertEqual(command, [sys.executable, os.path.abspath(start_worker.__file__), "--dramatiq-child"])
        self.assertEqual(child_env["dramatiq_queue_prefetch"], "8")
        self.assertEqual(child_env["dramatiq_delay_queue_prefetch"], "64")
        self.assertEqual(child_env["dramatiq_worker_timeout"], "5000")

    def test_embedded_worker_preserves_dramatiq_process_boot(self) -> None:
        broker = _Broker()
        worker = _Worker()
        state = start_worker.WorkerState()
        state.shutdown_requested = _Event(True)  # type: ignore[assignment]

        import dramatiq

        with (
            patch.dict(
                os.environ,
                {
                    "ARCLI_DRAMATIQ_MODULES": "api.worker",
                    "ARCLI_REQUIRED_DRAMATIQ_VERSION": "2.2.0",
                    "DRAMATIQ_THREADS": "4",
                },
                clear=True,
            ),
            patch.object(
                start_worker,
                "importlib",
                SimpleNamespace(import_module=lambda _name: None),
            ),
            patch("dramatiq.get_broker", return_value=broker),
            patch("dramatiq.Worker", return_value=worker) as worker_class,
            patch("dramatiq.__version__", "2.2.0"),
        ):
            return_code = start_worker.run_embedded_dramatiq_worker(state)

        self.assertEqual(return_code, 0)
        self.assertTrue(worker.started)
        self.assertEqual(worker.stopped_with, 230_000)
        self.assertTrue(broker.client_closed)
        self.assertTrue(broker.pool_disconnected)
        self.assertIn(("emit_after", "process_boot"), broker.calls)
        worker_class.assert_called_once_with(
            broker,
            worker_threads=4,
            worker_timeout=5_000,
        )

    def test_embedded_worker_recycles_only_after_pause_and_stop(self) -> None:
        broker = _Broker()
        worker = _Worker()
        state = start_worker.WorkerState()
        state.shutdown_requested = _Event()  # type: ignore[assignment]
        state.recycle_requested = _Event(True)  # type: ignore[assignment]

        import dramatiq

        with (
            patch.dict(
                os.environ,
                {
                    "ARCLI_DRAMATIQ_MODULES": "api.worker",
                    "ARCLI_REQUIRED_DRAMATIQ_VERSION": "2.2.0",
                },
                clear=True,
            ),
            patch.object(
                start_worker,
                "importlib",
                SimpleNamespace(import_module=lambda _name: None),
            ),
            patch("dramatiq.get_broker", return_value=broker),
            patch("dramatiq.Worker", return_value=worker),
            patch("dramatiq.__version__", "2.2.0"),
        ):
            return_code = start_worker.run_embedded_dramatiq_worker(state)

        self.assertEqual(return_code, start_worker.WORKER_RECYCLE_EXIT_CODE)
        self.assertTrue(worker.paused)
        self.assertEqual(worker.stopped_with, 230_000)
        self.assertTrue(broker.client_closed)
        self.assertTrue(broker.pool_disconnected)

    def test_memory_growth_requires_two_consecutive_samples(self) -> None:
        first_reason, first_samples = start_worker.memory_recycle_reason(
            rss_bytes=165 * 1024 * 1024,
            baseline_rss_bytes=100 * 1024 * 1024,
            max_rss_mb=384,
            max_rss_growth_mb=64,
            growth_breach_samples=0,
            required_growth_samples=2,
        )
        second_reason, second_samples = start_worker.memory_recycle_reason(
            rss_bytes=166 * 1024 * 1024,
            baseline_rss_bytes=100 * 1024 * 1024,
            max_rss_mb=384,
            max_rss_growth_mb=64,
            growth_breach_samples=first_samples,
            required_growth_samples=2,
        )

        self.assertIsNone(first_reason)
        self.assertEqual(first_samples, 1)
        self.assertEqual(second_reason, "sustained_rss_growth")
        self.assertEqual(second_samples, 2)

    def test_hard_rss_cap_recycles_on_the_first_sample(self) -> None:
        reason, samples = start_worker.memory_recycle_reason(
            rss_bytes=384 * 1024 * 1024,
            baseline_rss_bytes=350 * 1024 * 1024,
            max_rss_mb=384,
            max_rss_growth_mb=64,
            growth_breach_samples=0,
            required_growth_samples=2,
        )

        self.assertEqual(reason, "rss_cap")
        self.assertEqual(samples, 0)

    def test_version_check_fails_for_stale_runtime(self) -> None:
        with patch.dict(os.environ, {"ARCLI_REQUIRED_DRAMATIQ_VERSION": "2.2.0"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "expected 2.2.0, found 2.1.0"):
                start_worker.verify_dramatiq_version(
                    SimpleNamespace(__version__="2.1.0"),
                )


if __name__ == "__main__":
    unittest.main()
