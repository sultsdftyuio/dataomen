# Dockerfile
# Use a slim, modern Debian base image for optimized Python execution
FROM python:3.11-slim-bookworm

# ------------------------------------------------------------------------------
# Environment Variables & Resource Guardrails
# ------------------------------------------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH="/app" \
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
# CRITICAL FIX: CPU-Only PyTorch (OOM Prevention)
# Installs the lightweight PyTorch version first to prevent DigitalOcean
# from downloading massive NVIDIA GPU binaries and crashing out of memory.
# ------------------------------------------------------------------------------
RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

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
# ------------------------------------------------------------------------------
EXPOSE 8080

# NOTE: If you are using this single Dockerfile for BOTH your Web API and 
# your Worker in DigitalOcean, it is safer to leave this as the API command:
CMD ["python", "main.py"]