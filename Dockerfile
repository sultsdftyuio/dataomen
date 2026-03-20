# Dockerfile
# Use a slim, modern Debian base image for optimized Python execution
FROM python:3.11-slim-bookworm

# ------------------------------------------------------------------------------
# Environment Variables & Resource Guardrails
# ------------------------------------------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # We enforce OS-level constraints here as a fallback to your Python logic
    POLARS_MAX_THREADS=4 \
    DUCKDB_NUM_THREADS=4 \
    OMP_NUM_THREADS=4

WORKDIR /app

# ------------------------------------------------------------------------------
# System Dependencies
# libgomp1 is critical for OpenMP parallel processing in Polars/NumPy
# ------------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# Python Dependencies
# ------------------------------------------------------------------------------
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ------------------------------------------------------------------------------
# Application Code
# ------------------------------------------------------------------------------
COPY . .

# ------------------------------------------------------------------------------
# Execution
# Run the Celery worker and the Beat scheduler concurrently
# ------------------------------------------------------------------------------
CMD ["celery", "-A", "compute_worker.celery_app", "worker", "--loglevel=info", "-Q", "analytics,ingestion,cron", "-B"]