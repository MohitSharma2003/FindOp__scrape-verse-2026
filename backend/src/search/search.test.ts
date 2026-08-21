import assert from "node:assert/strict";
import test from "node:test";
import type { CandidateUrl, DiscoveryResponse } from "../discovery/discovery.types.js";
import type { ExtractionBatchResult } from "../extraction/extraction.types.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { FilteringResult } from "../filtering/filtering.types.js";
import type { RankingResult } from "../ranking/ranking.types.js";
import { filterOpportunities } from "../filtering/filtering.service.js";
import { rankOpportunities } from "../ranking/ranking.service.js";
import { extractOpportunities } from "../extraction/extraction.service.js";
import { executeSearch, SearchRequestValidationError } from "./search.service.js";
import { SearchIntentValidationError } from "./search-intent.service.js";
import type { SearchDependencies } from "./search.types.js";

const candidate: CandidateUrl = {
  url: "https://example.com/hackathon",
  title: "AI Hackathon",
  description: "Build AI tools",
  source: "web_search",
  searchQuery: "AI hackathon",
  rank: 1,
  discoveryMetadata: { domain: "example.com" },
};

function opportunity(index = 0): NormalizedOpportunity {
  return {
    title: `AI Hackathon ${index}`,
    organization: "Example Org",
    description: "Build AI tools",
    eligibility: "Students welcome",
    category: "hackathon",
    url: `https://example.com/hackathon-${index}`,
    opportunityUrl: `https://example.com/hackathon-${index}`,
    source: "example.com",
    location: "India",
    skills: ["AI"],
    status: "upcoming",
    startDate: new Date("2026-09-05"),
    endDate: new Date("2026-09-10"),
    deadline: new Date("2026-08-30"),
    mode: "remote",
    scrapedAt: new Date("2026-08-01"),
  };
}

function discovery(candidates: CandidateUrl[] = [candidate]): DiscoveryResponse {
  return {
    queries: ["AI hackathon"],
    candidates,
    metadata: { queriesExecuted: 1, resultsDiscovered: candidates.length, duplicatesRemoved: 0, candidatesReturned: candidates.length },
  };
}

function extraction(results: ExtractionBatchResult["results"]): ExtractionBatchResult {
  const extracted = results.filter((result) => result.status === "extracted").length;
  return {
    candidatesReceived: results.length,
    candidatesProcessed: results.length,
    extracted,
    rejected: results.length - extracted,
    persisted: extracted,
    duplicates: 0,
    results,
  };
}

function filtering(opportunities: NormalizedOpportunity[]): FilteringResult {
  return {
    results: opportunities.map((value) => ({ opportunity: value, decision: "match", matchedFilters: ["type"], unknownFilters: [], failedFilters: [] })),
    summary: { totalReceived: opportunities.length, matched: opportunities.length, unknown: 0, rejected: 0 },
  };
}

function ranking(opportunities: NormalizedOpportunity[]): RankingResult {
  return {
    results: opportunities.map((value, index) => ({
      opportunity: value,
      decision: "match",
      score: 100 - index,
      breakdown: { type: 15, keywords: 20, location: 15, mode: 10, date: 10, deadline: 10, skills: 10, eligibility: 5, completeness: 5 },
      reasons: ["Exact opportunity type match"],
      uncertainties: [],
    })),
  };
}

function dependencies(overrides: Partial<SearchDependencies> = {}): SearchDependencies {
  return {
    discover: async () => discovery(),
    extract: async (candidates) => extraction(candidates.map((_candidate, index) => ({ url: _candidate.url, status: "extracted", opportunity: opportunity(index) }))),
    filter: (_intent, opportunities) => filtering(opportunities),
    rank: (_intent, filtered) => ranking(filtered.results.filter((result) => result.decision !== "mismatch").map((result) => result.opportunity)),
    queryDB: async () => ({ opportunities: [], totalMatching: 0, oldestScrapedAt: null, freshestScrapedAt: null }),
    ...overrides,
  };
}

const validInput = { intent: { type: " HACKATHON ", keywords: [" AI "] } };

test("valid search normalizes intent and orchestrates each stage once", async () => {
  const calls = { discover: 0, extract: 0, filter: 0, rank: 0 };
  const result = await executeSearch(validInput, dependencies({
    discover: async (intent) => { calls.discover += 1; assert.equal(intent.type, "hackathon"); return discovery(); },
    extract: async (candidates) => { calls.extract += 1; assert.equal(candidates.length, 1); return extraction([{ url: candidate.url, status: "extracted", opportunity: opportunity() }]); },
    filter: (intent, opportunities) => { calls.filter += 1; assert.equal(intent.type, "hackathon"); assert.equal(opportunities.length, 1); return filtering(opportunities); },
    rank: (intent, filtered) => { calls.rank += 1; assert.equal(filtered.summary.matched, 1); return ranking(filtered.results.map((item) => item.opportunity)); },
  }));
  assert.deepEqual(calls, { discover: 1, extract: 1, filter: 1, rank: 1 });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.filteringDecision, "match");
  assert.equal(result.metadata.resultsReturned, 1);
});

test("invalid intent and invalid limits are rejected", async () => {
  await assert.rejects(() => executeSearch({ intent: { type: "not-real" } }, dependencies()), SearchIntentValidationError);
  await assert.rejects(() => executeSearch({ intent: { type: "hackathon" }, limit: 0 }, dependencies()), SearchRequestValidationError);
  await assert.rejects(() => executeSearch({ intent: { type: "hackathon" }, limit: 51 }, dependencies()), SearchRequestValidationError);
});

test("default limit is 20 and explicit limit is respected", async () => {
  const candidates = Array.from({ length: 25 }, (_, index) => ({ ...candidate, url: `https://example.com/${index}` }));
  const deps = dependencies({
    discover: async () => discovery(candidates),
    extract: async (values) => extraction(values.map((value, index) => ({ url: value.url, status: "extracted", opportunity: opportunity(index) }))),
  });
  assert.equal((await executeSearch({ intent: { type: "hackathon" } }, deps)).results.length, 20);
  assert.equal((await executeSearch({ intent: { type: "hackathon" }, limit: 3 }, deps)).results.length, 3);
});

test("partial extraction failures preserve successful opportunities and metadata", async () => {
  const result = await executeSearch(validInput, dependencies({
    extract: async () => extraction([
      { url: candidate.url, status: "extracted", opportunity: opportunity() },
      { url: "https://example.com/fail", status: "rejected", error: "Extraction failed" },
    ]),
  }));
  assert.equal(result.results.length, 1);
  assert.equal(result.metadata.extracted, 1);
  assert.equal(result.metadata.extractionFailed, 1);
});

test("zero candidates and zero extracted opportunities return successful empty responses", async () => {
  const emptyDiscovery = await executeSearch(validInput, dependencies({
    discover: async () => discovery([]),
    extract: async (candidates) => { assert.equal(candidates.length, 0); return extraction([]); },
  }));
  assert.deepEqual(emptyDiscovery.results, []);
  assert.equal(emptyDiscovery.metadata.resultsReturned, 0);

  const emptyExtraction = await executeSearch(validInput, dependencies({ extract: async () => extraction([]) }));
  assert.deepEqual(emptyExtraction.results, []);
});

test("discovery, filtering, and ranking failures are propagated for controlled API handling", async () => {
  await assert.rejects(() => executeSearch(validInput, dependencies({ discover: async () => { throw new Error("discovery down"); } })));
  await assert.rejects(() => executeSearch(validInput, dependencies({ filter: () => { throw new Error("filter down"); } })));
  await assert.rejects(() => executeSearch(validInput, dependencies({ rank: () => { throw new Error("rank down"); } })));
});

test("mismatches are excluded by the ranking boundary and unknown results are preserved", async () => {
  const unknown = opportunity(1);
  const mismatch = opportunity(2);
  const result = await executeSearch(validInput, dependencies({
    filter: () => ({
      results: [
        { opportunity: opportunity(), decision: "match", matchedFilters: [], unknownFilters: [], failedFilters: [] },
        { opportunity: unknown, decision: "unknown", matchedFilters: [], unknownFilters: ["mode"], failedFilters: [] },
        { opportunity: mismatch, decision: "mismatch", matchedFilters: [], unknownFilters: [], failedFilters: ["mode"] },
      ],
      summary: { totalReceived: 3, matched: 1, unknown: 1, rejected: 1 },
    }),
  }));
  assert.equal(result.metadata.unknown, 1);
  assert.equal(result.metadata.rejected, 1);
});

test("search enforces hard mode constraints and ranks known matches above unknowns", async () => {
  const candidates = [0, 1, 2].map((index) => ({ ...candidate, url: `https://example.com/hackathon-${index}` }));
  const opportunities: NormalizedOpportunity[] = [
    opportunity(0),
    { ...opportunity(1), mode: "in_person" },
    { ...opportunity(2), mode: null },
  ];
  const result = await executeSearch({
    intent: { type: "hackathon", keywords: ["AI"], location: { country: "India" }, mode: "remote" },
    limit: 5,
  }, dependencies({
    discover: async () => discovery(candidates),
    extract: async (values) => extraction(values.map((value, index) => ({ url: value.url, status: "extracted", opportunity: opportunities[index] }))),
    filter: (intent, values) => filterOpportunities(intent, values),
    rank: (intent, filtered) => rankOpportunities(intent, filtered),
  }));
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.opportunity.mode, "remote");
  assert.equal(result.results[0]?.filteringDecision, "match");
  assert.equal(result.results[1]?.opportunity.mode, null);
  assert.equal(result.results[1]?.filteringDecision, "unknown");
  assert.ok(result.results[0]?.reasons.includes("Remote participation confirmed"));
  assert.ok(result.results[1]?.uncertainties.includes("Participation mode is unknown"));
  assert.ok(!result.results.some((item) => item.opportunity.mode === "in_person"));
});

test("search quality regression excludes expired and in-person results", async () => {
  const candidates = [0, 1, 2, 3, 4].map((index) => ({ ...candidate, url: `https://example.com/quality-${index}` }));
  const opportunities: NormalizedOpportunity[] = [
    opportunity(0),
    { ...opportunity(1), mode: null },
    { ...opportunity(2), deadline: null },
    { ...opportunity(3), mode: "in_person" },
    { ...opportunity(4), deadline: new Date("2026-08-01") },
  ];
  const result = await executeSearch({
    intent: { type: "hackathon", keywords: ["AI"], location: { country: "India" }, mode: "remote", deadline: { kind: "open" } },
    limit: 5,
  }, dependencies({
    discover: async () => discovery(candidates),
    extract: async (values) => extraction(values.map((value, index) => ({ url: value.url, status: "extracted", opportunity: opportunities[index] }))),
    filter: (intent, values) => filterOpportunities(intent, values),
    rank: (intent, filtered) => rankOpportunities(intent, filtered),
  }));
  assert.equal(result.metadata.matched, 1);
  assert.equal(result.metadata.unknown, 2);
  assert.equal(result.metadata.rejected, 2);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0]?.opportunity.url, opportunities[0]?.url);
  assert.ok(result.results.every((item) => item.opportunity.mode !== "in_person"));
  assert.ok(result.results.some((item) => item.uncertainties.includes("Participation mode is unknown")));
  assert.ok(result.results.some((item) => item.uncertainties.includes("Application deadline is unknown")));
});

test("search assembles the sparse runtime candidate with reduced unknown scores", async () => {
  const sparse: NormalizedOpportunity = {
    ...opportunity(0),
    organization: "",
    description: "",
    location: "",
    skills: [],
    eligibility: "",
    status: "unknown",
    startDate: null,
    endDate: null,
    deadline: null,
    mode: null,
  };
  const result = await executeSearch({
    intent: { type: "hackathon", keywords: ["AI"], location: { country: "India" }, mode: "remote", date: { kind: "next_month" }, skills: [] },
    limit: 5,
  }, dependencies({
    extract: async () => extraction([{ url: candidate.url, status: "extracted", opportunity: sparse }]),
    filter: (intent, values) => filterOpportunities(intent, values),
    rank: (intent, filtered) => rankOpportunities(intent, filtered, { referenceDate: new Date("2026-08-15T00:00:00.000Z") }),
  }));
  const item = result.results[0];
  assert.ok(item);
  assert.equal(item.filteringDecision, "unknown");
  assert.ok(item.breakdown.skills < 10);
  assert.ok(item.breakdown.eligibility < 5);
  assert.ok(item.breakdown.location < 15);
  assert.ok(item.uncertainties.includes("Required skills could not be verified"));
  assert.ok(item.uncertainties.includes("Eligibility information is unavailable"));
});

test("search completes when the self-healing provider hangs", async () => {
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const result = await executeSearch({ intent: { type: "hackathon" }, limit: 5 }, dependencies({
    extract: async (candidates) => extractOpportunities({ candidates }, {
      client: { extract: async () => incomplete },
      collectorId: "collector-test",
      healingTimeoutMs: 10,
      createHealingClient: () => ({ heal: async () => new Promise<never>(() => {}) }),
      ingest: async (records) => ({ recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
    }),
  }));
  assert.equal(result.metadata.extracted, 1);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.filteringDecision, "match");
});

test("source opportunities and dependency results are not mutated", async () => {
  const source = opportunity();
  const before = structuredClone(source);
  await executeSearch(validInput, dependencies({
    extract: async () => extraction([{ url: candidate.url, status: "extracted", opportunity: source }]),
  }));
  assert.deepEqual(source, before);
});

test("complete provider schema survives extraction, filtering, ranking, and search assembly", async () => {
  const providerRecord = {
    title: "Example AI Hackathon",
    organization: "Example Org",
    description: "AI hackathon for builders",
    opportunity_type: "Hackathon",
    application_url: "https://example.com/apply",
    start_date: "2026-09-01T00:00:00.000Z",
    end_date: "2026-09-30T00:00:00.000Z",
    application_deadline: "2026-09-07T00:00:00.000Z",
    location: "India",
    participation_mode: "Remote",
    eligibility: ["All countries"],
    required_skills_or_technologies: ["AI", "Python"],
    prize_or_rewards: "₹2.3 Cr",
    source_url: candidate.url,
    input: { url: candidate.url },
  };
  const result = await executeSearch({
    intent: {
      type: "hackathon",
      keywords: ["AI"],
      location: { country: "India" },
      mode: "remote",
      date: { kind: "custom", from: "2026-09-01", to: "2026-09-30" },
    },
    limit: 5,
  }, dependencies({
    extract: async (candidates) => extractOpportunities({ candidates }, {
      client: { extract: async () => [providerRecord] },
      ingest: async (records) => ({ recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
    }),
  }));
  const item = result.results[0];
  assert.ok(item);
  assert.equal(item.opportunity.location, "India");
  assert.equal(item.opportunity.mode, "remote");
  assert.equal(item.opportunity.startDate?.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(item.opportunity.endDate?.toISOString(), "2026-09-30T00:00:00.000Z");
  assert.equal(item.opportunity.deadline?.toISOString(), "2026-09-07T00:00:00.000Z");
  assert.deepEqual(item.opportunity.skills, ["AI", "Python"]);
  assert.equal(item.opportunity.eligibility, "All countries");
  assert.equal(item.opportunity.prize, "₹2.3 Cr");
});
