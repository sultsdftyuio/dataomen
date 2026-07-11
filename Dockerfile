# ==============================================================================
# ARCLI AI ENGINE - LEAN PRODUCTION DOCKERFILE
# ==============================================================================
# Use a slim, modern Debian base image for optimized Python execution
FROM python:3.11-slim-bookworm

# ------------------------------------------------------------------------------
# Environment Variables & Resource Guardrails
# ------------------------------------------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH="/app" \
    # Limit thread usage to prevent CPU throttling on PaaS free/cheap tiers
    POLARS_MAX_THREADS=4 \
    DUCKDB_NUM_THREADS=4 \
    OMP_NUM_THREADS=4

WORKDIR /app

# ------------------------------------------------------------------------------
# System Dependencies
# ------------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# Python Dependencies (Strictly No Local ML Bloat)
# ------------------------------------------------------------------------------
COPY requirements.txt .

# We use --no-cache-dir to keep the final image size as small as possible
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ------------------------------------------------------------------------------
# Application Code
# ------------------------------------------------------------------------------
# Copy the rest of the application. (Ensure .dockerignore blocks .git, node_modules, etc.)
COPY . .

# ------------------------------------------------------------------------------
# Execution Default (FastAPI)
# ------------------------------------------------------------------------------
EXPOSE 8080

# By default, start the FastAPI server. 
# NOTE: If running a worker, your PaaS (Render/DO) should override this start command 
# to something like: `dramatiq workers.actors` or `celery -A workers worker`
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]