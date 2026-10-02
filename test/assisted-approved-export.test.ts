import assert from "node:assert/strict";
import test from "node:test";

import {
  exportManifestSchema, parseApprovedExportCsv, prepareApprovedExport,
} from "../scripts/assisted_sources/approved_export";

const manifest = exportManifestSchema.parse({
  tenantId: "tenant-test",
  targetingProfileId: "00000000-0000-4000-8000-000000000001",
  targetingProfileVersion: 1,
  source: {
    kind: "approved_directory",
    key: "directory_test",
    rightsApprovalRef: "Approved source record.",
    observedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    retentionDays: 7,
  },
});

test("approved export handles quoted fields and preserves distinct listing links", () => {
  const csv = [
    "website_url,company_name,source_url",
    'https://www.example.com/products,"Example, Software",https://directory.example/one',
    'https://example.com/about,"Example, Software",https://directory.example/two',
    'https://example.com/,"Example, Software",https://directory.example/one',
  ].join("\r\n");
  const parsed = prepareApprovedExport(manifest, csv);
  assert.equal(parsed.inputRows, 3);
  assert.equal(parsed.uniqueDomains, 1);
  assert.equal(parsed.uniqueSightings, 2);
  assert.equal(parsed.batches.length, 1);
  assert.equal(parsed.batches[0].accounts[0].companyName, "Example, Software");
});

test("approved export rejects extra contact columns and conflicting company identities", () => {
  assert.throws(() => parseApprovedExportCsv(
    "website_url,company_name,source_url,email\nhttps://example.com,Example,https://directory.example/one,a@example.com",
  ), /exactly/);
  assert.throws(() => prepareApprovedExport(manifest, [
    "website_url,company_name,source_url",
    "https://example.com,Example One,https://directory.example/one",
    "https://www.example.com,Another Company,https://directory.example/two",
  ].join("\n")), /differently/);
});

test("approved export validates every row before making bounded import batches", () => {
  const rows = Array.from({ length: 201 }, (_, index) =>
    `https://company-${index}.example,Company ${index},https://directory.example/${index}`);
  const parsed = prepareApprovedExport(manifest, [
    "website_url,company_name,source_url", ...rows,
  ].join("\n"));
  assert.deepEqual(parsed.batches.map((batch) => batch.accounts.length), [200, 1]);
  assert.throws(() => prepareApprovedExport(manifest, [
    "website_url,company_name,source_url",
    "https://company.example,Company,",
  ].join("\n")), /reviewable listing URL/);
});
