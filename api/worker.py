import importlib
import logging
import os

import dramatiq
from dramatiq.brokers.redis import RedisBroker

logger = logging.getLogger(__name__)


def _csv_env(name: str) -> list[str]:
    raw_value = os.getenv(name, "")
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def _configure_broker() -> None:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        raise RuntimeError("REDIS_URL is required to start the Dramatiq worker.")

    dramatiq.set_broker(RedisBroker(url=redis_url))
    logger.info("dramatiq_redis_broker_configured")


def _import_actor_modules() -> None:
    for module_name in _csv_env("ARCLI_DRAMATIQ_ACTOR_MODULES"):
        importlib.import_module(module_name)
        logger.info("dramatiq_actor_module_loaded module=%s", module_name)


_configure_broker()
_import_actor_modules()


@dramatiq.actor(queue_name="system")
def worker_healthcheck() -> str:
    return "ok"
