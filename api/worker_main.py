"""
Arcli Background Worker

Backward-compatible re-export module.
Implementation has been split across three sub-modules:
  - worker_core     : infrastructure, config, tenant utils, signup handlers,
                      webhook handler, backpressure
  - worker_pipeline : daily churn recovery pipeline orchestrator
  - worker_outbox   : durable outbox dispatcher
"""

# ruff: noqa: F401

# ---------------------------------------------------------------------------
# CORE: broker, clients, tenant management, signup handlers, metrics, config,
#       cursor helpers, webhook handler, backpressure
# ---------------------------------------------------------------------------
from api.worker.worker_core import (  # infra
    REDIS_URL,
    SUPABASE_TIMEOUT_SEC,
)
from api.worker.worker_core import (  # clients & tenant helpers
    _get_supabase_client,
    _extract_tenant_id,
    _upsert_tenant_status,
    _tenant_status_rank,
)
from api.worker.worker_core import (  # signup handlers
    log_critical_error,
    mark_tenant_failed,
    setup_stripe_customer_async,
    handle_user_signup,
)
from api.worker.worker_core import (  # metrics
    MetricsSink,
    METRICS,
)
from api.worker.worker_core import (  # pipeline config
    MAX_TENANT_RUNTIME_SEC,
    USER_BATCH_SIZE,
    USER_PROFILE_CURSOR_FIELD,
    ALLOWED_CURSOR_FIELDS,
    MAX_USERS_PER_TENANT_RUN,
    MAX_EMAILS_PER_TENANT_RUN,
    PIPELINE_BATCH_TARGET_DURATION_SEC,
    PIPELINE_BATCH_MIN_SLEEP_SEC,
    PIPELINE_BATCH_MAX_SLEEP_SEC,
)
from api.worker.worker_core import (  # cursor / safety helpers
    _normalize_cursor_field,
    _is_safe_column_name,
    _format_postgrest_value,
)
from api.worker.worker_core import (  # webhook & backpressure
    process_dodo_webhook,
    _apply_pipeline_backpressure,
)

# ---------------------------------------------------------------------------
# PIPELINE: churn recovery orchestrator
# ---------------------------------------------------------------------------
from api.worker.worker_pipeline import PipelineOrchestrator

# ---------------------------------------------------------------------------
# OUTBOX: durable outbox dispatcher
# ---------------------------------------------------------------------------
from api.worker.worker_outbox import (
    OutboxDispatcher,
    _claim_outbox_batch,
    _handle_dispatch_failure,
)

# ---------------------------------------------------------------------------
# IDENTIFY: async user profile heartbeats
# ---------------------------------------------------------------------------
from api.worker.identify import process_identify_payload
