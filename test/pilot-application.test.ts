import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/pilot/apply/route";
import { pilotApplicationSchema } from "../lib/pilot/application";

const valid = {
  email: " Founder@Example.com ", websiteUrl: "https://example.com/",
  offer: "A platform for sales research teams", idealCustomer: "Software companies with growing sales teams",
  buyerRole: "Head of Sales", geography: "US", companyFax: "",
};

function request(body: string, origin = "https://www.arcli.tech") {
  return new Request("https://www.arcli.tech/api/pilot/apply", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body,
  });
}

test("pilot application normalizes email and accepts multiline targeting detail", () => {
  const parsed = pilotApplicationSchema.parse({ ...valid, idealCustomer: "Software companies\nwith growing sales teams" });
  assert.equal(parsed.email, "founder@example.com");
});

test("pilot application rejects local or non-web company locators", () => {
  for (const websiteUrl of ["http://127.0.0.1", "http://localhost", "ftp://example.com", "https://user:pass@example.com"]) {
    assert.equal(pilotApplicationSchema.safeParse({ ...valid, websiteUrl }).success, false);
  }
});

test("pilot route rejects malformed, oversized and cross-origin submissions", async () => {
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal((await POST(request("x".repeat(9000)))).status, 413);
  assert.equal((await POST(request(JSON.stringify(valid), "https://another.example"))).status, 403);
});

test("bot honeypot accepts without touching the database", async () => {
  const response = await POST(request(JSON.stringify({ ...valid, companyFax: "bot text" })));
  assert.equal(response.status, 202);
});
