"""
Recovery Email Worker — Backward-Compatible Re-Exports
Location: api/emails/__init__.py
"""

# ==========================================
# CONFIGURATION, CONSTANTS & ENUMS
# ==========================================
from .recovery_models import (
    APP_BASE_URL,
    CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_REDIS_KEY,
    CIRCUIT_BREAKER_TIMEOUT_SECONDS,
    FROM_EMAIL,
    MAX_SEND_ATTEMPTS,
    RECOVERY_ATTEMPT_RESERVATION_RPC,
    RECOVERY_DISPATCH_TOKEN_RPC,
    RECOVERY_DLQ_TABLE,
    RECOVERY_EMAIL_EVENTS_TABLE,
    RECOVERY_EMAIL_TABLE,
    RECOVERY_UNIFIED_RESERVE_RPC,
    REDIS_URL,
    RESEND_API_KEY,
    RETRY_BACKOFF_SECONDS,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_TIMEOUT_SEC,
    SUPABASE_URL,
    CircuitBreakerState,
    FailureStage,
    ProviderSendStatus,
    RecoveryStatus,
)

# ==========================================
# MODELS & UTILITIES
# ==========================================
from .recovery_models import (
    DispatchTokenClaimResponse,
    METRICS,
    MetricsSink,
    RecoverySendRecord,
    SendResult,
    TemplateRenderer,
    UnifiedReserveResponse,
    get_template_renderer,
    safe_model_validate,
    utc_now,
    utc_now_iso,
)

# ==========================================
# CLIENTS & INFRASTRUCTURE
# ==========================================
from .recovery_clients import (
    CircuitBreaker,
    ResendEmailProvider,
    get_circuit_breaker,
    get_email_provider,
    get_redis_client,
    get_supabase_client,
    redis_broker,
    reset_supabase_client,
)

# ==========================================
# SERVICES
# ==========================================
from .recovery_services import (
    RecoveryRepository,
)

# ==========================================
# DRAMATIQ ACTORS
# ==========================================
from .recovery_actors import (
    persist_recovery_status,
    send_recovery_email,
)

__all__ = [
    # Config & Constants
    "APP_BASE_URL", "CIRCUIT_BREAKER_FAILURE_THRESHOLD", "CIRCUIT_BREAKER_REDIS_KEY",
    "CIRCUIT_BREAKER_TIMEOUT_SECONDS", "FROM_EMAIL", "MAX_SEND_ATTEMPTS",
    "RECOVERY_ATTEMPT_RESERVATION_RPC", "RECOVERY_DISPATCH_TOKEN_RPC", "RECOVERY_DLQ_TABLE",
    "RECOVERY_EMAIL_EVENTS_TABLE", "RECOVERY_EMAIL_TABLE", "RECOVERY_UNIFIED_RESERVE_RPC",
    "REDIS_URL", "RESEND_API_KEY", "RETRY_BACKOFF_SECONDS", "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_TIMEOUT_SEC", "SUPABASE_URL", 
    
    # Enums
    "CircuitBreakerState", "FailureStage", "ProviderSendStatus", "RecoveryStatus", 
    
    # Models & Utilities
    "DispatchTokenClaimResponse", "METRICS", "MetricsSink", "RecoverySendRecord", 
    "SendResult", "TemplateRenderer", "UnifiedReserveResponse", "get_template_renderer", 
    "safe_model_validate", "utc_now", "utc_now_iso", 
    
    # Clients & Infrastructure
    "CircuitBreaker", "ResendEmailProvider", "get_circuit_breaker", "get_email_provider", 
    "get_redis_client", "get_supabase_client", "redis_broker", "reset_supabase_client", 
    
    # Services
    "RecoveryRepository", 
    
    # Actors
    "persist_recovery_status", "send_recovery_email",
]