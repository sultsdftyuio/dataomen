# Crawl4AI numeric metrics extractor

This folder contains a standalone asynchronous crawler for extracting explicit
numeric values from one public webpage. It uses Crawl4AI's browser renderer and
`LLMExtractionStrategy`, then validates the result with strict Pydantic types.

## Install

```powershell
& .\.venv\Scripts\python.exe -m pip install -r .\Crawl4AI\requirements.txt
& .\.venv\Scripts\playwright.exe install chromium
```

## Run

```powershell
$env:OPENAI_API_KEY = "..."
& .\.venv\Scripts\python.exe .\Crawl4AI\extract_numeric_metrics.py https://example.com/pricing
```

The default model is `openai/gpt-4o-mini`. Override it with either
`CRAWL4AI_LLM_PROVIDER` or `--provider openai/<model>`.

The script returns only values explicitly stated on the page. Monetary values,
compact counts, and percentages are normalized to JSON numbers; absent values
remain `null`. Respect every target website's terms and robots policy.

## Arcli production website scans

`website_markdown.py` is the Crawl4AI-first browser adapter used by the
dedicated `crawl4ai-worker` in `.do/app.yaml`. It returns source Markdown from
the homepage and a small set of profile pages; Arcli's existing profile
extractor then creates the service profile.

The worker starts deliberately small on a 2 GB App Platform component:

- one Dramatiq thread and one globally leased Chromium crawl;
- up to four profile pages, with a 20-second page timeout;
- Firecrawl only when Crawl4AI fails or returns insufficient clean content.

Before deploying, add the real `FIRECRAWL_API_KEY` to the DigitalOcean app
secret for the fallback path. Set `ARCLI_CRAWL4AI_ENABLED=false` to immediately
revert to Firecrawl-first behavior without changing code.
