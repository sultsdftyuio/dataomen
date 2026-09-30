import assert from "node:assert/strict";
import test from "node:test";

import {
  RESULT_EMAIL_NOTICE_VERSION,
  resultEmailsEnabled,
} from "../lib/result-email-preference";

test("result mail requires an explicit, current opt-in", () => {
  assert.equal(resultEmailsEnabled(null, "owner@example.com"), false);
  assert.equal(
    resultEmailsEnabled({ enabled: true, opted_in_at: null, opted_in_email: null, notice_version: null }, "owner@example.com"),
    false,
  );
  assert.equal(
    resultEmailsEnabled({ enabled: true, opted_in_at: "2026-09-30T00:00:00Z", opted_in_email: "owner@example.com", notice_version: "older" }, "owner@example.com"),
    false,
  );
  assert.equal(
    resultEmailsEnabled({ enabled: false, opted_in_at: "2026-09-30T00:00:00Z", opted_in_email: "owner@example.com", notice_version: RESULT_EMAIL_NOTICE_VERSION }, "owner@example.com"),
    false,
  );
  assert.equal(
    resultEmailsEnabled({ enabled: true, opted_in_at: "2026-09-30T00:00:00Z", opted_in_email: "old@example.com", notice_version: RESULT_EMAIL_NOTICE_VERSION }, "owner@example.com"),
    false,
  );
  assert.equal(
    resultEmailsEnabled({ enabled: true, opted_in_at: "2026-09-30T00:00:00Z", opted_in_email: "OWNER@example.com", notice_version: RESULT_EMAIL_NOTICE_VERSION }, "owner@example.com"),
    true,
  );
});
