import assert from "node:assert/strict";
import test from "node:test";

import {
  TARGETING_BRIEF_LIMITS,
  normalizeSeedUrl,
  normalizeTargetingBriefInput,
} from "../lib/targeting-brief";

test("normalizes a targeting brief into bounded, deduplicated research input", () => {
  const brief = normalizeTargetingBriefInput({
    targetTypes: ["builder", "account", "builder", "unknown" as never],
    idealCustomerTraits: [
      "  Bootstrapped   B2B SaaS  ",
      "bootstrapped b2b saas",
      "Founder-led teams",
      12 as never,
    ],
    changeTriggers: ["A paid plan launches"],
    strongEvidenceDefinitions: ["A public comparison of prospecting tools"],
    exclusions: ["Student projects", "student projects"],
    seedUrls: [
      "github.com/example/project#readme",
      "https://github.com/example/project",
      "mailto:founder@example.com",
    ],
  });

  assert.deepEqual(brief.targetTypes, ["builder", "account"]);
  assert.deepEqual(brief.idealCustomerTraits, [
    "Bootstrapped B2B SaaS",
    "Founder-led teams",
  ]);
  assert.deepEqual(brief.exclusions, ["Student projects"]);
  assert.deepEqual(brief.seedUrls, ["https://github.com/example/project"]);
});

test("seed URLs accept public domains but reject unsafe or malformed schemes", () => {
  assert.equal(
    normalizeSeedUrl("example.com/launch"),
    "https://example.com/launch",
  );
  assert.equal(normalizeSeedUrl("ftp://example.com"), "");
  assert.equal(normalizeSeedUrl("https://user:password@example.com"), "");
  assert.equal(normalizeSeedUrl("http://localhost:3000"), "");
  assert.equal(normalizeSeedUrl("http://127.0.0.1"), "");
  assert.equal(normalizeSeedUrl("http://[::1]"), "");
  assert.equal(normalizeSeedUrl("not a public URL"), "");
});

test("targeting brief limits prevent an unbounded user-controlled seed list", () => {
  const seedUrls = Array.from(
    { length: TARGETING_BRIEF_LIMITS.maxItemsPerField + 3 },
    (_, index) => `https://example${index}.com`,
  );

  const brief = normalizeTargetingBriefInput({ seedUrls });

  assert.equal(brief.seedUrls.length, TARGETING_BRIEF_LIMITS.maxItemsPerField);
  assert.equal(brief.seedUrls[0], "https://example0.com/");
});
