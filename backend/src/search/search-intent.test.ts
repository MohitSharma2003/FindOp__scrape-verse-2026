import assert from "node:assert/strict";
import test from "node:test";
import { resolveDateFilter } from "./date-filter.js";
import { parseSearchIntent, SearchIntentValidationError } from "./search-intent.service.js";

const now = new Date("2026-08-19T12:00:00.000Z");

test("valid hackathon intent", () => assert.equal(parseSearchIntent({ type: "hackathon" }).type, "hackathon"));
test("valid fellowship intent", () => assert.equal(parseSearchIntent({ type: "fellowship" }).type, "fellowship"));
test("valid internship intent", () => assert.equal(parseSearchIntent({ type: "internship" }).type, "internship"));
test("remote mode", () => assert.equal(parseSearchIntent({ type: "job", mode: "remote" }).mode, "remote"));
test("in-person mode", () => assert.equal(parseSearchIntent({ type: "job", mode: "in_person" }).mode, "in_person"));
test("hybrid mode", () => assert.equal(parseSearchIntent({ type: "job", mode: "hybrid" }).mode, "hybrid"));
test("country and location normalize", () => {
  const intent = parseSearchIntent({ type: "job", location: { country: " India ", city: " New  Delhi " } });
  assert.deepEqual(intent.location, { country: "India", city: "New Delhi" });
});
test("next month resolves to the next calendar month", () => {
  const range = resolveDateFilter({ kind: "next_month" }, now);
  assert.equal(range?.from?.toISOString().slice(0, 10), "2026-09-01");
  assert.equal(range?.to?.toISOString().slice(0, 10), "2026-09-30");
});
test("next 30 days resolves deterministically", () => {
  const range = resolveDateFilter({ kind: "next_30_days" }, now);
  assert.equal(range?.from?.toISOString().slice(0, 10), "2026-08-19");
  assert.equal(range?.to?.toISOString().slice(0, 10), "2026-09-18");
});
test("custom date range is supported", () => {
  const intent = parseSearchIntent({ type: "grant", date: { kind: "custom", from: "2026-09-01", to: "2026-09-10" } });
  assert.equal(intent.date?.kind, "custom");
});
test("deadline within days is supported", () => {
  assert.equal(parseSearchIntent({ type: "competition", deadline: { kind: "within_days", days: 30 } }).deadline?.kind, "within_days");
});
test("duplicate keywords normalize case-insensitively", () => {
  assert.deepEqual(parseSearchIntent({ type: "hackathon", keywords: ["AI", " ai ", "ML"] }).keywords, ["AI", "ML"]);
});
test("whitespace and type casing normalize", () => {
  const intent = parseSearchIntent({ type: " Hackathon ", mode: " REMOTE " });
  assert.equal(intent.type, "hackathon");
  assert.equal(intent.mode, "remote");
});
test("unsupported opportunity type is rejected", () => {
  assert.throws(() => parseSearchIntent({ type: "festival" }), SearchIntentValidationError);
});
test("invalid mode is rejected", () => {
  assert.throws(() => parseSearchIntent({ type: "job", mode: "onsite" }), SearchIntentValidationError);
});
test("invalid date range is rejected", () => {
  assert.throws(() => parseSearchIntent({ type: "job", date: { kind: "custom", from: "2026-09-10", to: "2026-09-01" } }), SearchIntentValidationError);
});
test("invalid deadline configuration is rejected", () => {
  assert.throws(() => parseSearchIntent({ type: "job", deadline: { kind: "within_days", days: 0 } }), SearchIntentValidationError);
});
test("missing type is rejected", () => {
  assert.throws(() => parseSearchIntent({ keywords: ["AI"] }), SearchIntentValidationError);
});
test("empty intent is rejected", () => {
  assert.throws(() => parseSearchIntent({}), SearchIntentValidationError);
});
test("type-specific filters are supported", () => {
  const intent = parseSearchIntent({
    type: "hackathon",
    typeFilters: { technologies: [" TypeScript "], teamSize: { min: 2, max: 5 } },
  });
  assert.deepEqual(intent.typeFilters?.technologies, ["TypeScript"]);
  assert.deepEqual(intent.typeFilters?.teamSize, { min: 2, max: 5 });
});
test("numeric ranges reject inverted values", () => {
  assert.throws(() => parseSearchIntent({ type: "internship", eligibility: { ageRange: { min: 30, max: 18 } } }), SearchIntentValidationError);
});
test("mode defaults to any", () => assert.equal(parseSearchIntent({ type: "conference" }).mode, "any"));
