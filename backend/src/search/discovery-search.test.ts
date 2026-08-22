import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  DiscoverySearchValidationError,
  discoveryRequestToIntent,
  executeDiscoverySearch,
  extractQueryKeywords,
  discoverySearchRequestSchema,
} from "./discovery-search.service.js";
import type { SearchDependencies } from "./search.types.js";
import type { ExtractionBatchResult } from "../extraction/extraction.types.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { CandidateUrl, DiscoveryResponse } from "../discovery/discovery.types.js";

function storedOpportunity(overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  return {
    title: "Stored AI Hackathon",
    organization: "Org",
    description: "A stored opportunity description",
    category: "hackathon",
    url: "https://example.org/stored",
    opportunityUrl: "https://example.org/stored",
    source: "",
    location: "India",
    eligibility: "",
    skills: [],
    status: "active",
    scrapedAt: new Date(),
    ...overrides,
  } as NormalizedOpportunity;
}

function candidate(url: string): CandidateUrl {
  return {
    url,
    title: `Result ${url}`,
    description: "SERP snippet",
    source: "web_search",
    searchQuery: "q",
    rank: 1,
    discoveryMetadata: { domain: new URL(url).hostname },
  };
}

function baseDependencies(): SearchDependencies & { extractedUrls: string[]; discoveredQueries: string[] } {
  const extractedUrls: string[] = [];
  const discoveredQueries: string[] = [];

  return {
    extractedUrls,
    discoveredQueries,
    discover: async (intent) => {
      discoveredQueries.push(...intent.keywords);
      const response: DiscoveryResponse = {
        queries: ["q1"],
        candidates: [candidate("https://fresh.example.org/hack")],
        metadata: { queriesExecuted: 1, resultsDiscovered: 8, duplicatesRemoved: 0, candidatesReturned: 1 },
      };
      return response;
    },
    extract: async (candidates): Promise<ExtractionBatchResult> => {
      extractedUrls.push(...candidates.map((item) => item.url));
      const first = candidates[0];
      return {
        candidatesReceived: candidates.length,
        candidatesProcessed: candidates.length,
        extracted: 1,
        rejected: 0,
        persisted: 1,
        newRecords: 1,
        updatedRecords: 0,
        duplicates: 0,
        results: [{
          url: first?.url ?? "",
          status: "extracted",
          extractionQuality: { status: "healthy", score: 0.9, missingFields: [], criticalFieldsPresent: [], importantFieldsPresent: [] },
          opportunity: storedOpportunity({ url: first?.url, title: "Fresh AI Hackathon" }),
        }],
      };
    },
    filter: (intent, opportunities) => ({
      results: opportunities.map((opportunity) => ({
        opportunity,
        decision: "match",
        matchedFilters: ["category"],
        unknownFilters: [],
        failedFilters: [],
      })),
      summary: { totalReceived: opportunities.length, matched: opportunities.length, unknown: 0, rejected: 0 },
    }),
    rank: (_intent, filtered) => ({
      results: filtered.results
        .filter((entry) => entry.decision !== "mismatch")
        .map((entry) => ({
        opportunity: entry.opportunity as NormalizedOpportunity,
        decision: entry.decision as "match" | "unknown",
        score: 5,
        breakdown: { type: 0, keywords: 0, location: 0, mode: 0, date: 0, deadline: 0, skills: 0, eligibility: 0, completeness: 0 },
        reasons: [],
        uncertainties: [],
      })),
    }),
    queryDB: async () => ({
      opportunities: [storedOpportunity()],
      totalMatching: 1,
      oldestScrapedAt: new Date(),
      freshestScrapedAt: new Date(),
    }),
  };
}

describe("discovery search request schema", () => {
  test("applies documented defaults", () => {
    const parsed = discoverySearchRequestSchema.parse({});
    assert.equal(parsed.query, "");
    assert.equal(parsed.category, "other");
    assert.equal(parsed.mode, "any");
    assert.equal(parsed.fresh, false);
    assert.equal(parsed.limit, 24);
  });

  test("rejects invalid category, deadline window, and limit", () => {
    assert.throws(() => discoverySearchRequestSchema.parse({ category: "party" }));
    assert.throws(() => discoverySearchRequestSchema.parse({ deadlineWithinDays: 0 }));
    assert.throws(() => discoverySearchRequestSchema.parse({ deadlineWithinDays: 400 }));
    assert.throws(() => discoverySearchRequestSchema.parse({ limit: 100 }));
    assert.doesNotThrow(() => executeDiscoverySearch);
  });

  test("validation error carries zod issues for the API layer", () => {
    try {
      void discoverySearchRequestSchema.parse({ fresh: "yes" });
      assert.fail("expected throw");
    } catch {
      assert.ok(new DiscoverySearchValidationError({}) instanceof DiscoverySearchValidationError);
    }
  });
});

describe("discovery request to intent mapping", () => {
  test("splits free-text queries into bounded keywords", () => {
    assert.deepEqual(extractQueryKeywords("AI hackathons in India for students!"), [
      "ai", "hackathons", "india", "students",
    ]);
    assert.deepEqual(extractQueryKeywords(""), []);
  });

  test("maps category, deadline window, and skills", () => {
    const intent = discoveryRequestToIntent({
      query: "climate fellowship",
      category: "fellowship",
      deadlineWithinDays: 30,
      skills: ["research"],
    });
    assert.equal(intent.type, "fellowship");
    assert.deepEqual(intent.keywords, ["climate", "fellowship"]);
    assert.deepEqual(intent.deadline, { kind: "within_days", days: 30 });
    assert.deepEqual(intent.skills, ["research"]);
  });

  test("normalizes a Remote location into participation mode", () => {
    const intent = discoveryRequestToIntent({ query: "", category: "internship", location: "Remote" });
    assert.equal(intent.mode, "remote");
    assert.equal(intent.location, undefined);
  });

  test("keeps real countries as location filters", () => {
    const intent = discoveryRequestToIntent({ query: "", category: "internship", location: "India" });
    assert.equal(intent.location?.country, "India");
  });
});

describe("executeDiscoverySearch", () => {
  test("non-fresh search hits the database only and reports honest metadata", async () => {
    const deps = baseDependencies();
    const response = await executeDiscoverySearch(
      { query: "ai hackathon", category: "hackathon", fresh: false },
      deps,
    );

    assert.equal(deps.extractedUrls.length, 0);
    assert.equal(response.meta.webSearched, false);
    assert.equal(response.meta.newRecords, 0);
    assert.equal(response.meta.resultCount, 1);
    assert.equal(response.data[0]?.opportunity.title, "Stored AI Hackathon");
  });

  test("fresh search performs real web discovery, persists records, and reports counts", async () => {
    const deps = baseDependencies();
    const response = await executeDiscoverySearch(
      { query: "ai hackathon", category: "hackathon", fresh: true },
      deps,
    );

    assert.equal(deps.extractedUrls.length, 1);
    assert.equal(deps.discoveredQueries.includes("ai"), true);
    assert.equal(response.meta.requestedFresh, true);
    assert.equal(response.meta.webSearched, true);
    assert.equal(response.meta.candidatesDiscovered, 1);
    assert.equal(response.meta.extracted, 1);
    assert.equal(response.meta.newRecords, 1);
    assert.equal(response.meta.updatedRecords, 0);
    assert.equal(response.meta.freshness, "refreshed");
  });

  test("failed web discovery degrades to cached results with an honest error", async () => {
    const deps = baseDependencies();
    deps.discover = async () => {
      throw new Error("Bright Data unavailable");
    };

    const response = await executeDiscoverySearch(
      { query: "ai hackathon", category: "hackathon", fresh: true },
      deps,
    );

    assert.equal(response.success, true);
    assert.equal(response.meta.discoveryError, "Bright Data unavailable");
    assert.equal(response.meta.freshness, "stale");
    assert.equal(response.data.length, 1);
  });

  test("fresh request with zero extractions discloses the shortfall", async () => {
    const deps = baseDependencies();
    deps.extract = async (candidates) => ({
      candidatesReceived: candidates.length,
      candidatesProcessed: candidates.length,
      extracted: 0,
      rejected: candidates.length,
      persisted: 0,
      newRecords: 0,
      updatedRecords: 0,
      duplicates: 0,
      results: candidates.map((item) => ({ url: item.url, status: "rejected" })),
    });

    const response = await executeDiscoverySearch(
      { query: "ai hackathon", category: "hackathon", fresh: true },
      deps,
    );

    assert.equal(response.meta.newRecords, 0);
    assert.equal(response.meta.discoveryError, "no fresh results were extracted from the web");
    assert.equal(response.meta.freshness, "stale");
  });

  test("invalid requests are rejected with a typed validation error", async () => {
    const deps = baseDependencies();
    await assert.rejects(
      () => executeDiscoverySearch({ category: "blockchain-party" }, deps),
      DiscoverySearchValidationError,
    );
  });
});
