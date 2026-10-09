from __future__ import annotations

import sys
from types import SimpleNamespace

from Crawl4AI import browser_processes
from Crawl4AI.browser_processes import BrowserSession, terminate_orphaned_browsers


class _Process:
    def __init__(self, name: str, cmdline: list[str] | None = None, *, stubborn: bool = False) -> None:
        self._name = name
        self._cmdline = cmdline or [name]
        self.stubborn = stubborn
        self.terminated = False
        self.killed = False

    def name(self) -> str:
        return self._name

    def cmdline(self) -> list[str]:
        return self._cmdline

    def terminate(self) -> None:
        self.terminated = True

    def kill(self) -> None:
        self.killed = True


def _install_fake_psutil(monkeypatch, descendants: list[_Process]) -> None:
    def wait_procs(processes: list[_Process], timeout: float) -> tuple[list[_Process], list[_Process]]:
        still_alive = [process for process in processes if process.stubborn]
        return [process for process in processes if not process.stubborn], still_alive

    fake_psutil = SimpleNamespace(
        Error=RuntimeError,
        Process=lambda: SimpleNamespace(children=lambda recursive: descendants),
        wait_procs=wait_procs,
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)


def test_leftover_browsers_and_the_playwright_driver_are_terminated(monkeypatch) -> None:
    chromium = _Process("chrome-headless-shell")
    wedged_chromium = _Process("chromium", stubborn=True)
    driver = _Process(
        "node",
        ["/app/playwright/driver/node", "/app/playwright/driver/package/cli.js", "run-driver"],
    )
    unrelated_node = _Process("node", ["node", "server.js"])
    unrelated = _Process("python")
    _install_fake_psutil(
        monkeypatch, [chromium, wedged_chromium, driver, unrelated_node, unrelated]
    )

    assert terminate_orphaned_browsers() == 3

    assert chromium.terminated and not chromium.killed
    assert wedged_chromium.terminated and wedged_chromium.killed
    assert driver.terminated
    assert not unrelated_node.terminated
    assert not unrelated.terminated


def test_browsers_are_left_alone_while_a_crawl_still_owns_one(monkeypatch) -> None:
    chromium = _Process("chromium")
    _install_fake_psutil(monkeypatch, [chromium])

    with BrowserSession():
        assert terminate_orphaned_browsers() == 0
        assert not chromium.terminated

    assert browser_processes._active_sessions == 0
    assert terminate_orphaned_browsers() == 1
    assert chromium.terminated


def test_a_process_that_exits_while_being_inspected_is_ignored(monkeypatch) -> None:
    class _Vanished(_Process):
        def name(self) -> str:
            raise RuntimeError("process no longer exists")

    _install_fake_psutil(monkeypatch, [_Vanished("chromium")])

    assert terminate_orphaned_browsers() == 0
