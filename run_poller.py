import logging
import os
import time

from api.emails import get_supabase_client
from api.worker_main import OutboxDispatcher

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
POLL_INTERVAL_SEC = int(os.getenv("OUTBOX_POLL_INTERVAL_SEC", "10"))
BATCH_SIZE = int(os.getenv("OUTBOX_BATCH_SIZE", "100"))


def main() -> None:
    logging.basicConfig(
        level=LOG_LEVEL,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logger = logging.getLogger("outbox_poller")

    client = get_supabase_client()
    if not client:
        raise RuntimeError(
            "Supabase client unavailable. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )

    dispatcher = OutboxDispatcher(client)
    logger.info(
        "outbox_poller_started batch_size=%d interval_sec=%d",
        BATCH_SIZE,
        POLL_INTERVAL_SEC,
    )

    while True:
        dispatcher.poll_and_dispatch(batch_size=BATCH_SIZE)
        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    main()
