import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  manualScanOperatorEmails,
  mayRunManualScan,
} from "../lib/manual-scan-access";

const manualScanActionSource = readFileSync(
  fileURLToPath(
    new URL("../app/(dashboard)/dashboard/manual-scan-actions.ts", import.meta.url),
  ),
  "utf8",
);

test("on-demand scans are off unless an operator allowlist is configured", () => {
  assert.equal(manualScanOperatorEmails(undefined).size, 0);
  assert.equal(manualScanOperatorEmails(" , ").size, 0);
  assert.equal(mayRunManualScan("owner@example.com", undefined), false);
  assert.equal(mayRunManualScan("owner@example.com", ""), false);
});

test("only allowlisted emails may run an on-demand scan", () => {
  const allowlist = " Owner@Example.com, second@example.com ";

  assert.equal(mayRunManualScan("owner@example.com", allowlist), true);
  assert.equal(mayRunManualScan("  SECOND@example.com ", allowlist), true);
  assert.equal(mayRunManualScan("customer@example.com", allowlist), false);
  assert.equal(mayRunManualScan(null, allowlist), false);
  assert.equal(mayRunManualScan("", allowlist), false);
});

test("the scan action re-checks operator access before queueing work", () => {
  assert.match(
    manualScanActionSource,
    /viewerMayRunManualScan\(supabase\)[\s\S]*?return startWebsiteDemandScan\(\)/,
  );
});
