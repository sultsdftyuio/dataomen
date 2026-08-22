# Dedicated image for the bounded Crawl4AI App Platform worker.
# The normal API and matching worker stay browser-free.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH="/app" \
    PLAYWRIGHT_BROWSERS_PATH="/ms-playwright" \
    DRAMATIQ_PROCESSES=1 \
    DRAMATIQ_THREADS=1 \
    ARCLI_REDIS_MAX_CONNECTIONS=8

WORKDIR /app

COPY requirements.txt ./requirements.txt
COPY Crawl4AI/requirements.txt ./Crawl4AI/requirements.txt

# ``playwright install --with-deps chromium`` installs the browser and its
# Debian libraries during the image build, so the App Platform worker does not
# download browser binaries or retain runtime state.
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt -r Crawl4AI/requirements.txt && \
    python -m playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/* /root/.cache/pip

COPY . .

CMD ["python", "scripts/start_worker.py"]
