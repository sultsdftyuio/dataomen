from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_crawling_is_owned_by_the_browser_ready_worker_image() -> None:
    """Keep the primary crawler separate from the generic worker image."""
    app_spec = (PROJECT_ROOT / ".do" / "app.yaml").read_text(encoding="utf-8")
    browser_dockerfile = (PROJECT_ROOT / "Crawl4AI" / "Dockerfile").read_text(
        encoding="utf-8"
    )
    generic_dockerfile = (PROJECT_ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "name: crawl4ai-worker" in app_spec
    assert "dockerfile_path: ./Crawl4AI/Dockerfile" in app_spec
    assert 'value: "crawling,workspace-brain"' in app_spec
    assert "ARCLI_CRAWL4AI_ENABLED=true" in browser_dockerfile
    assert "python -m playwright install --with-deps chromium" in browser_dockerfile
    assert "ARCLI_CRAWL4AI_ENABLED=false" in generic_dockerfile
