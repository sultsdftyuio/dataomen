import assert from "node:assert/strict";
import test from "node:test";

import { buildProductBuyerMap } from "../lib/product-buyer-map";

test("product and buyer map keeps its commercial areas distinct and compact", () => {
  const map = buildProductBuyerMap({
    valueProposition: " Automate invoice approvals with an audit trail. ",
    coreProblem: "Invoices stall in email before month-end close.",
    targetAudience: ["Controllers", "controllers", "Finance operations"],
    painPoints: ["Approvals block close", "Approvals block close"],
    useCases: ["Route invoices"],
    buyingTriggers: ["Close delayed"],
    urgencySignals: ["Late payments"],
    buyerLanguage: ["invoice approvals take forever", "Invoice approvals take forever"],
    negativeKeywords: ["Personal budgeting"],
    excludedAudiences: ["Solo freelancers"],
  });

  assert.deepEqual(map.positioning, [
    "Automate invoice approvals with an audit trail.",
    "Invoices stall in email before month-end close.",
  ]);
  assert.deepEqual(map.idealBuyers, ["Controllers", "Finance operations"]);
  assert.deepEqual(map.buyerLanguage, ["invoice approvals take forever"]);
  assert.deepEqual(map.exclusions, ["Solo freelancers", "Personal budgeting"]);
  assert.equal(map.buyerProblems.length, 4);
});

test("product and buyer map handles an incomplete crawl without invalid values", () => {
  const map = buildProductBuyerMap({
    valueProposition: " ",
    coreProblem: "",
    targetAudience: [],
    painPoints: [],
    useCases: [],
    buyingTriggers: [],
    urgencySignals: [],
    buyerLanguage: [],
    negativeKeywords: [],
    excludedAudiences: [],
  });

  assert.deepEqual(map, {
    positioning: [],
    idealBuyers: [],
    buyerProblems: [],
    buyerLanguage: [],
    exclusions: [],
  });
});

test("product and buyer map shows each available signal type before extra detail", () => {
  const map = buildProductBuyerMap({
    valueProposition: "Approval automation",
    coreProblem: "Approvals delay close",
    targetAudience: [],
    painPoints: ["Chasing approvers", "No audit trail"],
    useCases: ["Route invoices", "Escalate exceptions"],
    buyingTriggers: ["Close delayed"],
    urgencySignals: ["Payment due this week"],
    buyerLanguage: [],
    negativeKeywords: [],
    excludedAudiences: [],
  });

  assert.deepEqual(map.buyerProblems, [
    "Chasing approvers",
    "Route invoices",
    "Close delayed",
    "Payment due this week",
  ]);
});
