import assert from "node:assert/strict";
import test from "node:test";

import { updateResultEmailPreference } from "../lib/result-email-client";

test("opt-in only succeeds when the server confirms the requested state", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ enabled: false }), { status: 200 });
    await assert.rejects(updateResultEmailPreference(true), /Could not save/);

    globalThis.fetch = async () => new Response(JSON.stringify({ enabled: true }), { status: 200 });
    assert.equal(await updateResultEmailPreference(true), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
