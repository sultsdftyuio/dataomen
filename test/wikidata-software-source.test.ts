import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWikidataRows, softwareCompanyQuery,
} from "../scripts/assisted_sources/wikidata_software";

function row(item: string, website: string, name = "Example") {
  return { item: { value: item }, website: { value: website }, name: { value: name } };
}

test("Wikidata research bounds pagination", () => {
  assert.match(softwareCompanyQuery(100, 50), /LIMIT 50 OFFSET 100$/);
  assert.throws(() => softwareCompanyQuery(-1, 100));
  assert.throws(() => softwareCompanyQuery(0, 101));
});

test("Wikidata rows retain listing provenance and reject unsafe or shared domains", () => {
  const result = normalizeWikidataRows({ results: { bindings: [
    row("http://www.wikidata.org/entity/Q123", "https://www.example.com/product", "Example"),
    row("http://www.wikidata.org/entity/Q124", "https://example.com/other", "Alias"),
    row("http://www.wikidata.org/entity/Q125", "http://127.0.0.1/"),
    row("http://www.wikidata.org/entity/Q126", "https://github.com/example"),
    row("https://other.example/Q127", "https://another.com/"),
  ] } });
  assert.equal(result.sourceRows, 5);
  assert.deepEqual(result.rejected, {
    invalidItem: 1, invalidWebsite: 1, sharedHost: 1, duplicateDomain: 1,
  });
  assert.deepEqual(result.candidates, [{
    itemId: "Q123", companyName: "Example", websiteUrl: "https://www.example.com/product",
    sourceUrl: "https://www.wikidata.org/wiki/Q123", domain: "example.com",
  }]);
});
