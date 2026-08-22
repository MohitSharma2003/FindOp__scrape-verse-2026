import assert from "node:assert/strict";
import test from "node:test";
import { buildOpportunityUpsertOperations } from "./opportunity.repository.js";
import type { NormalizedOpportunity } from "../../ingestion/types.js";

const SOURCE_ID = "507f1f77bcf86cd799439011";

function normalized(overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  return {
    source: "example",
    sourceId: SOURCE_ID,
    title: "AI Hackathon 2026",
    description: "Build with AI",
    organization: "Example Org",
    eligibility: "",
    opportunityUrl: "https://example.com/hackathon/ai-2026",
    url: "https://example.com/hackathon/ai-2026",
    category: "hackathon",
    startDate: null,
    endDate: null,
    deadline: null,
    location: "",
    skills: [],
    status: "unknown",
    scrapedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("upsert refreshes the stored category when the classifier corrects it", () => {
  const operations = buildOpportunityUpsertOperations([normalized()]);
  const operation = operations[0];
  assert.ok(operation);
  assert.equal(String(operation.updateOne.filter.sourceId), SOURCE_ID);
  assert.equal(operation.updateOne.filter.opportunityUrl, "https://example.com/hackathon/ai-2026");
  assert.equal(operation.updateOne.update.$set.category, "hackathon");
});

test("re-ingesting a corrected record overwrites every stored field via $set", () => {
  const operations = buildOpportunityUpsertOperations([
    normalized({ category: "internship", title: "AICTE Internship Portal 2026" }),
  ]);
  const reclassified = operations[0];
  assert.ok(reclassified);
  assert.equal(reclassified.updateOne.update.$set.title, "AICTE Internship Portal 2026");
  assert.equal(reclassified.updateOne.update.$set.category, "internship");
  assert.equal((reclassified.updateOne.update.$set.scrapedAt as Date).toISOString(), new Date("2026-08-01T00:00:00.000Z").toISOString());
});

test("records without a sourceId key on source plus URL", () => {
  const operations = buildOpportunityUpsertOperations([normalized({ sourceId: undefined })]);
  const operation = operations[0];
  assert.ok(operation);
  assert.equal(operation.updateOne.filter.source, "example");
  assert.equal(operation.updateOne.filter.opportunityUrl, "https://example.com/hackathon/ai-2026");
});
