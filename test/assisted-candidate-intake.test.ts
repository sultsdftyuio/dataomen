import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAssistedAccount } from "../scripts/assisted_account_identity";
import { latestApprovedSourceDeadline } from "../scripts/assisted_candidate_source";
import { candidateBatchSchema, uniqueCandidateAccounts } from "../scripts/import_assisted_candidates";
import { suppressionBatchSchema, uniqueSuppressions } from "../scripts/import_assisted_suppressions";

const candidateBatch = {
  tenantId: "tenant-test",
  targetingProfileId: "00000000-0000-4000-8000-000000000001",
  targetingProfileVersion: 3,
  source: {
    kind: "approved_directory",
    key: "approved_directory_01",
    rightsApprovalRef: "Source approval recorded in governance register.",
    observedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    retentionDays: 89,
  },
  accounts: [
    {
      websiteUrl: "https://www.Example.com/products?campaign=source",
      companyName: "Example Software",
      sourceUrl: "https://directory.example/listing/one",
    },
    {
      websiteUrl: "http://example.com/about",
      companyName: "Example Software",
      sourceUrl: "https://directory.example/listing/two",
    },
    {
      websiteUrl: "https://example.com/",
      companyName: "Example Software",
      sourceUrl: "https://directory.example/listing/one",
    },
  ],
};

test("account identity merges case, www, paths and query strings", () => {
  assert.equal(normalizeAssistedAccount("https://www.Example.com/products?x=1").domain, "example.com");
  assert.equal(normalizeAssistedAccount("http://example.com/about").domain, "example.com");
  assert.throws(() => normalizeAssistedAccount("http://127.0.0.1/company"));
});

test("one domain remains one candidate while distinct source links survive", () => {
  const parsed = candidateBatchSchema.parse(candidateBatch);
  const grouped = uniqueCandidateAccounts(parsed);
  assert.equal(grouped.size, 1);
  assert.equal(grouped.get("example.com")?.length, 2);
});

test("source rights and provenance must be explicit", () => {
  assert.equal(candidateBatchSchema.safeParse({
    ...candidateBatch,
    source: { ...candidateBatch.source, rightsApprovalRef: "" },
  }).success, false);
  assert.equal(candidateBatchSchema.safeParse({
    ...candidateBatch,
    accounts: [{ ...candidateBatch.accounts[0], sourceUrl: null }],
  }).success, false);
  assert.equal(candidateBatchSchema.safeParse({
    ...candidateBatch,
    accounts: [candidateBatch.accounts[0], {
      ...candidateBatch.accounts[1], companyName: "A different company",
    }],
  }).success, false);
});

test("suppression input rejects conflicting reasons for one domain", () => {
  const valid = {
    tenantId: "tenant-test",
    sourceKey: "crm_exclusions_01",
    accounts: [
      { websiteUrl: "https://www.example.com/", reasonCode: "existing_customer" },
      { websiteUrl: "https://example.com/", reasonCode: "existing_customer" },
    ],
  };
  assert.equal(uniqueSuppressions(suppressionBatchSchema.parse(valid)).size, 1);
  assert.equal(suppressionBatchSchema.safeParse({
    ...valid,
    accounts: [valid.accounts[0], { ...valid.accounts[1], reasonCode: "do_not_contact" }],
  }).success, false);
});

test("card display ends with the latest valid source permission", () => {
  const now = Date.parse("2026-10-01T00:00:00Z");
  const observations = [
    { source_key: "directory", source_kind: "approved_directory",
      rights_approval_ref: "approved", retention_expires_at: "2026-10-21T00:00:00Z" },
    { source_key: "licensed", source_kind: "licensed_provider",
      rights_approval_ref: "licensed", retention_expires_at: "2026-10-11T00:00:00Z" },
  ];
  const approvals = [
    { source_key: "directory", source_kind: "approved_directory", approval_ref: "approved",
      approval_status: "active", valid_until: "2026-10-08T00:00:00Z" },
    { source_key: "licensed", source_kind: "licensed_provider", approval_ref: "licensed",
      approval_status: "active", valid_until: "2026-10-30T00:00:00Z" },
  ];
  assert.equal(latestApprovedSourceDeadline(observations, approvals, now)?.toISOString(),
    "2026-10-11T00:00:00.000Z");
  assert.equal(latestApprovedSourceDeadline(observations, approvals.map((source) => (
    { ...source, approval_status: "revoked" }
  )), now), null);
});
