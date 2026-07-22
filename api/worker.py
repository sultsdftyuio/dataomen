import importlib
import logging
import os

import dramatiq

from api.broker import build_redis_broker

logger = logging.getLogger(__name__)

DEFAULT_ACTOR_MODULES = (
    "api.services.crawling",
    "api.services.profile_extraction",
    "api.services.embeddings",
    "api.services.ingestion_service",
    "api.workers.actors",
)


def _csv_env(name: str) -> list[str]:
    raw_value = os.getenv(name, "")
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def _configure_broker() -> None:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        logger.error(
            "dramatiq_broker_configuration_failed redis_url_configured=%s failure_reason=%s",
            False,
            "missing_redis_url",
        )
        raise RuntimeError("REDIS_URL is required to start the Dramatiq worker.")

    broker = build_redis_broker(redis_url)
    dramatiq.set_broker(broker)
    logger.info(
        "dramatiq_redis_broker_configured broker=%s redis_url_configured=%s",
        "redis",
        True,
    )


def _import_actor_modules() -> None:
    module_names = [*DEFAULT_ACTOR_MODULES, *_csv_env("ARCLI_DRAMATIQ_ACTOR_MODULES")]
    for module_name in dict.fromkeys(module_names):
        importlib.import_module(module_name)
        logger.info(
            "dramatiq_actor_module_loaded module=%s actor_modules_env_configured=%s",
            module_name,
            module_name not in DEFAULT_ACTOR_MODULES,
        )


_configure_broker()
_import_actor_modules()


@dramatiq.actor(queue_name="system")
def worker_healthcheck() -> str:
    logger.info("dramatiq_worker_healthcheck queue_name=%s status=%s", "system", "ok")
    return "ok"
