"""Crawl4AI browser and page settings for the memory-bounded crawl worker.

Everything here trades visual fidelity for a smaller Chromium footprint. Arcli
only reads the page text, so images, fonts, media, ads, and trackers are never
needed, and each one avoided is memory the worker container does not spend.
"""

from __future__ import annotations

from typing import Any

# Page chrome that never describes the product. Dropping it before Markdown
# generation keeps both the browser result and the extractor prompt small.
EXCLUDED_TAGS = (
    "nav",
    "footer",
    "aside",
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "form",
)


def build_browser_config(browser_config_class: Any) -> Any:
    """Return the low-memory Chromium launch configuration."""
    return browser_config_class(
        headless=True,
        verbose=False,
        # Blocks images, fonts, and media at the network layer.
        text_mode=True,
        # Turns off extensions, sync, and other background browser services.
        light_mode=True,
        # Discards caches aggressively and caps the V8 heap, so one heavy
        # single-page app fails its own render instead of exhausting the
        # container and taking the worker down with it.
        memory_saving_mode=True,
        # Ad and tracker scripts are the largest avoidable page cost and never
        # contain the company's own description.
        avoid_ads=True,
        # App Platform containers have constrained shared memory. Keep
        # Chromium from depending on a large /dev/shm mount.
        extra_args=["--disable-dev-shm-usage"],
    )


def build_run_config(
    run_config_class: Any,
    cache_mode: Any,
    *,
    page_timeout_ms: int,
) -> Any:
    """Return the per-page settings shared by every page of one website."""
    return run_config_class(
        cache_mode=cache_mode,
        page_timeout=page_timeout_ms,
        word_count_threshold=20,
        exclude_external_links=True,
        excluded_tags=list(EXCLUDED_TAGS),
        # Crawl4AI's own per-page console output duplicates Arcli's structured
        # crawl logs and is costly to retain at App Platform log volume.
        verbose=False,
    )
