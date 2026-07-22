import os
import sys
import unittest
from unittest.mock import patch

from scripts import start_worker


class _ImmediatelyExitedProcess:
    pid = 12345

    def poll(self) -> int:
        return 0


class DramatiqMemoryGuardrailTests(unittest.TestCase):
    def test_runtime_environment_bounds_prefetch_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            runtime_env = start_worker.dramatiq_runtime_environment()

        self.assertEqual(runtime_env["dramatiq_queue_prefetch"], "1")
        self.assertEqual(runtime_env["dramatiq_delay_queue_prefetch"], "16")
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

    def test_launcher_passes_bounded_environment_to_dramatiq(self) -> None:
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
        ):
            return_code = start_worker.run_dramatiq_worker(start_worker.WorkerState())

        self.assertEqual(return_code, 0)
        command = popen.call_args.args[0]
        child_env = popen.call_args.kwargs["env"]
        self.assertEqual(command[:3], [sys.executable, "-m", "dramatiq"])
        self.assertEqual(child_env["dramatiq_queue_prefetch"], "1")
        self.assertEqual(child_env["dramatiq_delay_queue_prefetch"], "16")
        self.assertEqual(child_env["dramatiq_worker_timeout"], "5000")


if __name__ == "__main__":
    unittest.main()
