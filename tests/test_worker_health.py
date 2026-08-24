import socket
from urllib.error import HTTPError
from urllib.request import urlopen

from scripts.start_worker import WorkerState, worker_is_healthy
from scripts.start_worker import start_worker_health_server


class _RunningProcess:
    def poll(self) -> None:
        return None


class _ExitedProcess:
    def poll(self) -> int:
        return 1


def test_worker_health_requires_a_running_supervised_child() -> None:
    state = WorkerState()
    assert not worker_is_healthy(state)

    state.child_process = _RunningProcess()  # type: ignore[assignment]
    assert worker_is_healthy(state)

    state.child_process = _ExitedProcess()  # type: ignore[assignment]
    assert not worker_is_healthy(state)


def test_worker_health_is_unhealthy_during_shutdown() -> None:
    state = WorkerState()
    state.child_process = _RunningProcess()  # type: ignore[assignment]
    state.shutdown_requested.set()

    assert not worker_is_healthy(state)


def test_health_server_tracks_the_supervised_child(monkeypatch) -> None:
    with socket.socket() as socket_probe:
        socket_probe.bind(("127.0.0.1", 0))
        port = socket_probe.getsockname()[1]

    monkeypatch.setenv("ARCLI_WORKER_HEALTH_PORT", str(port))
    state = WorkerState()
    server = start_worker_health_server(state)
    assert server is not None

    try:
        try:
            urlopen(f"http://127.0.0.1:{port}/health")
        except HTTPError as error:
            assert error.code == 503
            assert error.read() == b'{"status":"starting_or_stopping"}'
        else:
            raise AssertionError("health server must reject a missing child process")

        state.child_process = _RunningProcess()  # type: ignore[assignment]
        with urlopen(f"http://127.0.0.1:{port}/health") as response:
            assert response.status == 200
            assert response.read() == b'{"status":"ok"}'
    finally:
        server.shutdown()
        server.server_close()
