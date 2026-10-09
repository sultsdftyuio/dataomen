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
dedicated `crawl4ai-worker` in `.do/app.yaml`. It handles the `crawling` and
`workspace-brain` queues, returns source Markdown from the homepage and a
small set of profile pages, and then lets Arcli's existing profile extractor
create the service profile.

The worker starts deliberately small on a 2 GB App Platform component:

- one Dramatiq thread and one globally leased Chromium crawl;
- one browser launch per website, shared by the homepage and its linked pages;
- up to four profile pages, with a 20-second page timeout;
- Firecrawl only when Crawl4AI fails or returns insufficient clean content.

Memory and time are bounded in three places:

- `browser_settings.py` launches Chromium without images, fonts, media, ads,
  or background services, and with a capped JavaScript heap.
- `website_markdown.py` stops starting pages shortly before the crawl timeout
  and returns the pages already rendered. Error pages (HTTP 400 and above) and
  redirects to an already rendered page are skipped.
- `browser_processes.py` terminates any Chromium or Playwright driver process
  left behind after a crawl. The worker memory guard measures only the Python
  process, so this is what stops a leaked browser from holding memory.

Each crawl logs `crawl4ai_site_crawled` with page count and timings, and
`crawl4ai_page_skipped` with the reason for every page it did not keep.

Before deploying, add the real `FIRECRAWL_API_KEY` to the DigitalOcean app
secret for the fallback path. Set `ARCLI_CRAWL4AI_ENABLED=false` to immediately
revert to Firecrawl-first behavior without changing code.

`ARCLI_CRAWL4AI_ENABLED` defaults to `true`. Run crawl jobs only on the
dedicated browser-worker image, where Crawl4AI and Chromium are installed.
