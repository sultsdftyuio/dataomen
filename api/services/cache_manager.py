"""
Cache manager placeholder used by webhook routes.

Replace with a real cache backend when available.
"""

import logging

logger = logging.getLogger(__name__)


class CacheManager:
    def invalidate_dataset_cache(self, tenant_id: str, dataset_id: str) -> None:
        if not tenant_id or not dataset_id:
            logger.warning(
                "cache_invalidation_missing_context tenant=%s dataset=%s",
                tenant_id,
                dataset_id,
            )
            return

        logger.info(
            "cache_invalidation_noop tenant=%s dataset=%s",
            tenant_id,
            dataset_id,
        )


cache_manager = CacheManager()
