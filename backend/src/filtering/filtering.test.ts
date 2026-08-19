import assert from "node:assert/strict";
import test from "node:test";
import { filterOpportunity, filterOpportunities } from "./filtering.service.js";
import { parseSearchIntent } from "../search/search-intent.service.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function intent(input: Record<string, unknown>) {
  return parseSearchIntent({ type: "hackathon", ...input });
}

function opportunity(overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  return {
    title: "AI Hackathon India",
    organization: "Example Org",
    description: "Build machine learning tools for developers.",
    eligibility: "Students and professionals welcome",
    category: "hackathon",
    url: "https://example.com/opportunity",
    opportunityUrl: "https://example.com/opportunity",
    source: "example.com",
    location: "India",
    skills: ["Python", "Machine Learning"],
    status: "upcoming",
    startDate: new Date("2026-09-05T00:00:00.000Z"),
    endDate: new Date("2026-09-10T00:00:00.000Z"),
    deadline: new Date("2026-08-30T00:00:00.000Z"),
    mode: "remote",
    prize: "$10,000",
    scrapedAt: NOW,
    ...overrides,
  };
}

test("exact and aliased opportunity types match", () => {
  assert.equal(filterOpportunity(intent({}), opportunity()).decision, "match");
  assert.equal(filterOpportunity({ ...intent({}), type: "competition" }, opportunity({ category: "competition" })).decision, "match");
});

test("wrong opportunity type mismatches", () => {
  assert.deepEqual(filterOpportunity(intent({}), opportunity({ category: "internship" })).failedFilters, ["type"]);
});

test("keywords use case-insensitive ALL matching with small aliases", () => {
  assert.equal(filterOpportunity(intent({ keywords: ["AI", "machine learning"] }), opportunity()).decision, "match");
  assert.equal(filterOpportunity(intent({ keywords: ["AI", "rust"] }), opportunity()).decision, "mismatch");
});

test("keyword mismatch is explainable", () => {
  const result = filterOpportunity(intent({ keywords: ["web3"] }), opportunity());
  assert.deepEqual(result.failedFilters, ["keywords"]);
});

test("country and city location matches are case insensitive", () => {
  assert.equal(filterOpportunity(intent({ location: { country: " india " } }), opportunity()).decision, "match");
  assert.equal(filterOpportunity(intent({ location: { city: "Bengaluru" } }), opportunity({ location: "Bengaluru, India" })).decision, "match");
  assert.equal(filterOpportunity(intent({ location: { country: "India", city: "Bengaluru" } }), opportunity({ location: "India" })).decision, "unknown");
  assert.equal(filterOpportunity(intent({ location: { country: "India", city: "Bengaluru" } }), opportunity({ location: "Bengaluru, India" })).decision, "match");
});

test("known opposing country mismatches and unknown location is retained as unknown", () => {
  assert.equal(filterOpportunity(intent({ location: { country: "India" } }), opportunity({ location: "USA" })).decision, "mismatch");
  assert.equal(filterOpportunity(intent({ location: { country: "India" } }), opportunity({ location: "" })).decision, "unknown");
});

test("remote, in-person, hybrid, any, and unknown modes are handled", () => {
  assert.equal(filterOpportunity(intent({ mode: "remote" }), opportunity({ mode: "remote" })).decision, "match");
  assert.equal(filterOpportunity(intent({ mode: "remote" }), opportunity({ mode: "in_person" })).decision, "mismatch");
  assert.equal(filterOpportunity(intent({ mode: "hybrid" }), opportunity({ mode: "hybrid" })).decision, "match");
  assert.equal(filterOpportunity(intent({ mode: "any" }), opportunity({ mode: "in_person" })).decision, "match");
  assert.equal(filterOpportunity(intent({ mode: "remote" }), opportunity({ mode: null })).decision, "unknown");
});

test("date interval overlap matches and non-overlap mismatches", () => {
  const custom = { date: { kind: "custom", from: "2026-09-01", to: "2026-09-30" } };
  assert.equal(filterOpportunity(intent(custom), opportunity(), { now: NOW }).decision, "match");
  assert.equal(filterOpportunity(intent(custom), opportunity({ startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10") }), { now: NOW }).decision, "mismatch");
  const expired = filterOpportunity(intent(custom), opportunity({ deadline: new Date("2026-08-01") }), { now: NOW });
  assert.equal(expired.decision, "mismatch");
  assert.ok(expired.failedFilters.includes("deadline"));
  const unknownDeadline = filterOpportunity(intent(custom), opportunity({ deadline: null }), { now: NOW });
  assert.equal(unknownDeadline.decision, "unknown");
  assert.ok(unknownDeadline.unknownFilters.includes("deadline"));
});

test("deadline filters match open deadlines and reject expired ones", () => {
  assert.equal(filterOpportunity(intent({ deadline: { kind: "open" } }), opportunity(), { now: NOW }).decision, "match");
  assert.equal(filterOpportunity(intent({ deadline: { kind: "within_days", days: 1 } }), opportunity({ deadline: new Date("2026-08-10") }), { now: NOW }).decision, "mismatch");
});

test("unknown date data is not silently rejected", () => {
  const result = filterOpportunity(intent({ date: { kind: "upcoming" } }), opportunity({ startDate: null, endDate: null, deadline: null }), { now: NOW });
  assert.equal(result.decision, "unknown");
  assert.deepEqual(result.unknownFilters, ["date", "deadline"]);
});

test("skills and technologies are matched deterministically", () => {
  assert.equal(filterOpportunity(intent({ skills: ["python"] }), opportunity()).decision, "match");
  assert.equal(filterOpportunity(intent({ skills: ["go"] }), opportunity()).decision, "mismatch");
  assert.equal(filterOpportunity(intent({ typeFilters: { technologies: ["machine learning"] } }), opportunity()).decision, "match");
  const missing = filterOpportunity(intent({ skills: ["Rust"] }), opportunity({ skills: [], title: "Hackathon", description: "Build things" }));
  assert.equal(missing.decision, "unknown");
  assert.ok(missing.unknownFilters.includes("skills"));
});

test("eligibility remains unknown unless structured text contradicts the request", () => {
  assert.equal(filterOpportunity(intent({ eligibility: { student: true } }), opportunity()).decision, "match");
  assert.equal(filterOpportunity(intent({ eligibility: { student: true } }), opportunity({ eligibility: "Professionals only" })).decision, "mismatch");
  assert.equal(filterOpportunity(intent({ eligibility: { professional: true } }), opportunity({ eligibility: "" })).decision, "unknown");
});

test("multiple hard constraints produce an explainable mismatch", () => {
  const result = filterOpportunity(intent({ keywords: ["AI"], location: { country: "India" }, mode: "remote" }), opportunity({ mode: "in_person" }));
  assert.equal(result.decision, "mismatch");
  assert.deepEqual(result.matchedFilters, ["type", "keywords", "location"]);
  assert.deepEqual(result.failedFilters, ["mode"]);
});

test("summary separates matches, unknowns, and rejected results", () => {
  const result = filterOpportunities(intent({ location: { country: "India" } }), [
    opportunity(),
    opportunity({ location: "" }),
    opportunity({ location: "USA" }),
  ], { now: NOW });
  assert.deepEqual(result.summary, { totalReceived: 3, matched: 1, unknown: 1, rejected: 1 });
});

test("canonical opportunities are not mutated", () => {
  const original = opportunity();
  const before = structuredClone(original);
  filterOpportunity(intent({ keywords: ["AI"], date: { kind: "upcoming" } }), original, { now: NOW });
  assert.deepEqual(original, before);
});

test("all supported canonical opportunity categories can match their requested type", () => {
  for (const category of ["hackathon", "internship", "job", "fellowship", "scholarship", "competition", "other"] as const) {
    assert.equal(filterOpportunity({ ...intent({}), type: category }, opportunity({ category })).decision, "match");
  }
});
