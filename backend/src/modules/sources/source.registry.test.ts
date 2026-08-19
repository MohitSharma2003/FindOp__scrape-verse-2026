import assert from "node:assert/strict";
import test from "node:test";
import { Source } from "./source.model.js";
import { createSourceSchema, sourceEnabledSchema, updateSourceSchema } from "./source.schema.js";

const validSource = {
  name: "Example",
  url: "https://example.com/opportunities",
  category: "hackathon" as const,
  collectorId: "collector-example",
};

test("source creation accepts a valid enabled Bright Data source", () => {
  const result = createSourceSchema.safeParse(validSource);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.enabled, true);
});

test("enabled source requires collectorId and invalid URLs are rejected", () => {
  assert.equal(createSourceSchema.safeParse({ ...validSource, collectorId: undefined }).success, false);
  assert.equal(createSourceSchema.safeParse({ ...validSource, url: "not-a-url" }).success, false);
  assert.equal(createSourceSchema.safeParse({ ...validSource, enabled: false, collectorId: undefined }).success, true);
});

test("collectorId has a unique registry index", () => {
  const indexes = Source.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.collectorId === 1 && options?.unique === true));
  assert.ok(indexes.some(([fields, options]) => fields.url === 1 && options?.unique === true));
});

test("enable and disable payloads are validated", () => {
  assert.equal(sourceEnabledSchema.safeParse({ enabled: true }).success, true);
  assert.equal(sourceEnabledSchema.safeParse({ enabled: "true" }).success, false);
  assert.equal(updateSourceSchema.safeParse({ enabled: false }).success, true);
});

test("registry preserves health and healing metadata fields", () => {
  assert.ok(Source.schema.path("qualityScore"));
  assert.ok(Source.schema.path("lastRunAt"));
  assert.ok(Source.schema.path("lastSuccessfulRunAt"));
  assert.ok(Source.schema.path("lastFailureAt"));
  assert.ok(Source.schema.path("healingStatus"));
  assert.ok(Source.schema.path("healingCount"));
});
