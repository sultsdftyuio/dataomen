import assert from "node:assert/strict";
import test from "node:test";

import {
  crawlTriggerEndpoints,
  embeddingTriggerEndpoints,
} from "../app/api/settings/workspace/route";

test("uses worker API settings for the crawl trigger and avoids a doubled api path", () => {
  assert.deepEqual(
    crawlTriggerEndpoints({
      ARCLI_WORKER_API_URL: "https://worker.example.com/api/",
      PYTHON_BACKEND_URL: "https://fallback.example.com",
    }),
    [
      "https://worker.example.com/api/crawl/trigger",
      "https://fallback.example.com/api/crawl/trigger",
    ],
  );
});

test("keeps explicit worker routes first and retains reachable fallback targets", () => {
  assert.deepEqual(
    embeddingTriggerEndpoints({
      ARCLI_PROFILE_EMBEDDING_TRIGGER_URL:
        "https://preferred.example.com/api/service-profile/embed/trigger",
      ARCLI_WORKER_API_URL: "https://worker.example.com",
      INTERNAL_API_URL: "https://legacy.example.com/api",
    }),
    [
      "https://preferred.example.com/api/service-profile/embed/trigger",
      "https://worker.example.com/api/service-profile/embed/trigger",
      "https://legacy.example.com/api/service-profile/embed/trigger",
    ],
  );
});
