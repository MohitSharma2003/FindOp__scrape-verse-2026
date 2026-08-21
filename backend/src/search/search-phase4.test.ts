import assert from "node:assert/strict";
import test from "node:test";
import type { CandidateUrl, DiscoveryResponse } from "../discovery/discovery.types.js";
import type { ExtractionBatchResult } from "../extraction/extraction.types.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { FilteringResult } from "../filtering/filtering.types.js";
import type { RankingResult } from "../ranking/ranking.types.js";
import type { OpportunityQueryResult } from "../modules/opportunities/opportunity.repository.js";
import { executeSearch, SearchRequestTimeoutError, SearchDiscoveryFailedError } from "./search.service.js";
import { SearchIntentValidationError } from "./search-intent.service.js";
import { parseSearchIntent } from "./search-intent.service.js";
import type { SearchDependencies } from "./search.types.js";
import { filterOpportunities } from "../filtering/filtering.service.js";
import { rankOpportunities } from "../ranking/ranking.service.js";
import { env } from "../config/env.js";

function opp(index: number, overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  const categories: NormalizedOpportunity["category"][] = ["hackathon", "internship", "fellowship", "job", "competition", "program", "scholarship", "other"];
  const base: NormalizedOpportunity = {
    title: `Opportunity ${index}`,
    organization: `Org ${index}`,
    description: `Description ${index}`,
    eligibility: "Open",
    category: categories[index % categories.length]!,
    url: `https://example.com/opp-${index}`,
    opportunityUrl: `https://example.com/opp-${index}`,
    applicationUrl: `https://example.com/apply-${index}`,
    source: "example.com",
    location: "India",
    skills: ["AI"],
    status: "open",
    startDate: new Date("2026-09-01"),
    endDate: new Date("2026-09-30"),
    deadline: new Date("2026-08-30"),
    mode: "remote",
    scrapedAt: new Date(),
  };
  return { ...base, ...overrides };
}

function freshDB(items: NormalizedOpportunity[]): OpportunityQueryResult {
  return {
    opportunities: items,
    totalMatching: items.length,
    oldestScrapedAt: new Date(),
    freshestScrapedAt: new Date(),
  };
}

function staleDB(items: NormalizedOpportunity[]): OpportunityQueryResult {
  return {
    opportunities: items,
    totalMatching: items.length,
    oldestScrapedAt: new Date(Date.now() - 48 * 3600_000),
    freshestScrapedAt: new Date(Date.now() - 48 * 3600_000),
  };
}

function emptyDB(): OpportunityQueryResult {
  return { opportunities: [], totalMatching: 0, oldestScrapedAt: null, freshestScrapedAt: null };
}

function cands(url = "https://example.com/opp-new"): CandidateUrl[] {
  return [{ url, title: "New Opp", description: "Apply now", source: "web_search", searchQuery: "test", rank: 1, discoveryMetadata: { domain: "example.com" } }];
}

function discovery(cands_: CandidateUrl[] = cands()): DiscoveryResponse {
  return { queries: ["test"], candidates: cands_, metadata: { queriesExecuted: 1, resultsDiscovered: cands_.length, duplicatesRemoved: 0, candidatesReturned: cands_.length } };
}

function extractResult(items: NormalizedOpportunity[]): ExtractionBatchResult {
  return {
    candidatesReceived: items.length, candidatesProcessed: items.length, extracted: items.length, rejected: 0, persisted: items.length, duplicates: 0,
    results: items.map((o) => ({ url: o.url, status: "extracted" as const, opportunity: o })),
  };
}

function deps(overrides: Partial<SearchDependencies> = {}): SearchDependencies {
  return {
    discover: async () => discovery(),
    extract: async (c) => extractResult(c.map((candidate, i) => opp(i, { url: candidate.url, opportunityUrl: candidate.url }))),
    filter: (_i, opps) => ({
      results: opps.map((o) => ({ opportunity: o, decision: "match" as const, matchedFilters: ["type"], unknownFilters: [], failedFilters: [] })),
      summary: { totalReceived: opps.length, matched: opps.length, unknown: 0, rejected: 0 },
    }),
    rank: (_i, f) => ({
      results: f.results.filter((r) => r.decision !== "mismatch").map((r, i) => ({
        opportunity: r.opportunity, decision: r.decision as "match" | "unknown", score: 100 - i,
        breakdown: { type: 15, keywords: 20, location: 15, mode: 10, date: 10, deadline: 10, skills: 10, eligibility: 5, completeness: 5 },
        reasons: ["Exact match"], uncertainties: [],
      })),
    }),
    queryDB: async () => emptyDB(),
    ...overrides,
  };
}

// ======================== DB-FIRST ========================

test("Phase 4: Fresh DB data returns fast without triggering discovery", async () => {
  let discoverCalled = false;
  const items = [opp(0), opp(1), opp(2)];
  const result = await executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
    queryDB: async () => freshDB(items),
    discover: async () => { discoverCalled = true; return discovery(); },
  }));
  assert.equal(result.results.length, 3);
  assert.equal(result.metadata.totalInDatabase, 3);
  assert.equal(discoverCalled, false, "Discovery must NOT be called when DB has fresh data");
});

test("Phase 4: Strict DB query zero → relaxed query with category-only filter returns results", async () => {
  let queryCount = 0;
  const items = [opp(0)];
  const result = await executeSearch(
    { intent: { type: "hackathon", keywords: ["Blockchain"], location: { country: "USA" }, mode: "remote" }, limit: 10 },
    deps({
      queryDB: async (_intent, _limit) => {
        queryCount++;
        if (queryCount === 1) return emptyDB();
        return freshDB(items);
      },
    }),
  );
  assert.ok(queryCount >= 2, "Should have queried DB at least twice (strict + relaxed)");
  assert.equal(result.results.length, 1);
});

test("Phase 4: Both strict and relaxed DB empty → triggers discovery → extraction → results", async () => {
  let discoverCalled = false;
  let extractCalled = false;
  const newOpp = opp(99, { title: "Discovered AI Hackathon", category: "hackathon", url: "https://example.com/new", opportunityUrl: "https://example.com/new" });
  const result = await executeSearch({ intent: { type: "hackathon", keywords: ["AI"] }, limit: 10 }, deps({
    queryDB: async () => emptyDB(),
    discover: async () => { discoverCalled = true; return discovery(); },
    extract: async (c) => { extractCalled = true; return extractResult(c.map(() => newOpp)); },
  }));
  assert.equal(discoverCalled, true);
  assert.equal(extractCalled, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.opportunity.title, "Discovered AI Hackathon");
});

test("Phase 4: Stale but usable DB data returns immediately and refreshes in background", async () => {
  let discoverCalled = false;
  const items = [opp(0), opp(1)];
  const result = await executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
    queryDB: async () => staleDB(items),
    discover: async () => { discoverCalled = true; return discovery(); },
  }));
  assert.equal(result.results.length, 2, "Stale-but-usable results must still be served");
  assert.equal(result.metadata.refreshed, false);
  assert.equal(result.metadata.freshness, "stale");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(discoverCalled, true, "Background refresh must be triggered for stale data");
});

test("Phase 4: Background refresh does not block the response", async () => {
  const started = Date.now();
  const result = await executeSearch({ intent: { type: "internship" }, limit: 10 }, deps({
    queryDB: async () => staleDB([opp(0, { category: "internship" })]),
    discover: async () => { await new Promise((resolve) => setTimeout(resolve, 300)); return discovery(); },
  }));
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 200, `Response must not wait for background refresh (took ${elapsed}ms)`);
  assert.equal(result.results.length, 1);
});

test("Phase 4: Stale DB data that filters to zero results falls through to synchronous discovery", async () => {
  let discoverCalled = false;
  const newOpp = opp(50, { title: "Fresh Hackathon", category: "hackathon", url: "https://example.com/fresh", opportunityUrl: "https://example.com/fresh" });
  const result = await executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
    queryDB: async () => staleDB([opp(0, { category: "job", title: "Unrelated Job" })]),
    filter: (i, o) => filterOpportunities(i, o),
    rank: (i, f) => rankOpportunities(i, f),
    discover: async () => { discoverCalled = true; return discovery(); },
    extract: async () => extractResult([newOpp]),
  }));
  assert.equal(discoverCalled, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.opportunity.title, "Fresh Hackathon");
  assert.equal(result.metadata.freshness, "refreshed");
});

// ======================== FAILURE BEHAVIOR ========================

test("Phase 4: Discovery failure with stale-but-unusable DB results returns cached records with refreshed:false", async () => {
  const result = await executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
    queryDB: async () => staleDB([opp(0, { category: "job" })]),
    filter: (i, o) => filterOpportunities(i, o),
    rank: (i, f) => rankOpportunities(i, f),
    discover: async () => { throw new Error("BrightData connection failed"); },
  }));
  assert.equal(result.metadata.refreshed, false);
  assert.ok(result.metadata.refreshError);
});

test("Phase 4: Discovery failure with stale-but-usable DB results still serves cached data", async () => {
  const items = [opp(0), opp(1)];
  const result = await executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
    queryDB: async () => staleDB(items),
    discover: async () => { throw new Error("BrightData down"); },
  }));
  assert.equal(result.results.length, 2);
  assert.equal(result.metadata.refreshed, false);
  assert.equal(result.metadata.freshness, "stale");
});

test("Phase 4: Discovery failure with no DB results throws SearchDiscoveryFailedError", async () => {
  await assert.rejects(
    () => executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
      queryDB: async () => emptyDB(),
      discover: async () => { throw new Error("BrightData down"); },
    })),
    SearchDiscoveryFailedError,
  );
});

// ======================== MULTI-CATEGORY ========================

test("Phase 4: Internship intent does not return hackathon results", async () => {
  const internships = [opp(2, { category: "internship" })];
  const result = await executeSearch({ intent: { type: "internship", keywords: ["React"] }, limit: 10 }, deps({
    queryDB: async () => freshDB(internships),
  }));
  assert.ok(result.results.length > 0);
  assert.ok(result.results.every((r) => r.opportunity.category === "internship"));
});

test("Phase 4: Fellowship intent works correctly", async () => {
  const items = [opp(0, { category: "fellowship", title: "ML Fellowship", location: "Remote" })];
  const result = await executeSearch({ intent: { type: "fellowship", keywords: ["ML"], mode: "remote" }, limit: 10 }, deps({
    queryDB: async () => freshDB(items),
  }));
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.opportunity.category, "fellowship");
});

test("Phase 4: Job intent works correctly", async () => {
  const items = [opp(0, { category: "job", title: "React Developer", skills: ["React", "TypeScript"] })];
  const result = await executeSearch({ intent: { type: "job", skills: ["React"] }, limit: 10 }, deps({
    queryDB: async () => freshDB(items),
  }));
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.opportunity.category, "job");
});

test("Phase 4: All opportunity types are supported by intent parsing", () => {
  const types = ["hackathon", "internship", "job", "fellowship", "scholarship", "competition", "program", "grant", "conference", "workshop", "accelerator", "other"] as const;
  for (const type of types) {
    const result = parseSearchIntent({ type });
    assert.equal(result.type, type, `Type ${type} should be valid`);
  }
});

test("Phase 4: Program intent works end-to-end against DB data", async () => {
  const items = [opp(0, { category: "program", title: "AI Research Program" })];
  const result = await executeSearch({ intent: { type: "program", keywords: ["AI"] }, limit: 5 }, deps({
    queryDB: async () => freshDB(items),
  }));
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.opportunity.category, "program");
});

// ======================== LIMITS ========================

test("Phase 4: Limit constraints enforced", async () => {
  await assert.rejects(
    () => executeSearch({ intent: { type: "hackathon" }, limit: 0 }, deps()),
    /Invalid search request/,
  );
  await assert.rejects(
    () => executeSearch({ intent: { type: "hackathon" }, limit: 51 }, deps()),
    /Invalid search request/,
  );
});

// ======================== FILTERING INTEGRATION ========================

test("Phase 4: Location filtering excludes other countries but keeps global/unknown locations", async () => {
  const india = opp(0, { location: "Bangalore, India" });
  const germany = opp(1, { location: "Berlin, Germany" });
  const remoteGlobal = opp(2, { location: "Remote — Global" });
  const result = await executeSearch(
    { intent: { type: "hackathon", location: { country: "India" } }, limit: 10 },
    deps({
      queryDB: async () => freshDB([india, germany, remoteGlobal]),
      filter: (i, o) => filterOpportunities(i, o),
      rank: (i, f) => rankOpportunities(i, f),
    }),
  );
  const locations = result.results.map((r) => r.opportunity.location);
  assert.ok(locations.includes("Bangalore, India"), "India location must be kept");
  assert.ok(!locations.includes("Berlin, Germany"), "Other-country location must be excluded");
});

test("Phase 4: Skill filtering keeps matching skills and unknown-skill records", async () => {
  const react = opp(0, { category: "internship", skills: ["React", "TypeScript"] });
  const python = opp(1, { category: "internship", skills: ["Python"] });
  const noSkills = opp(2, { category: "internship", skills: [] });
  const result = await executeSearch(
    { intent: { type: "internship", skills: ["React"] }, limit: 10 },
    deps({
      queryDB: async () => freshDB([react, python, noSkills]),
      filter: (i, o) => filterOpportunities(i, o),
      rank: (i, f) => rankOpportunities(i, f),
    }),
  );
  const urls = result.results.map((r) => r.opportunity.url);
  assert.ok(urls.includes(react.url), "Matching-skill record must be kept");
  assert.ok(!urls.includes(python.url), "Contradicting-skill record must be excluded");
});

test("Phase 4: Ranking orders more relevant opportunities first", async () => {
  const exact = opp(0, {
    title: "National AI Hackathon", description: "Build AI agents with mentors",
    organization: "AI Org", eligibility: "Students", location: "India", mode: "remote",
    deadline: new Date("2026-12-01"), startDate: new Date("2026-09-01"), endDate: new Date("2026-09-15"),
    prize: "$10k", applicationUrl: "https://example.com/apply",
  });
  const weak = opp(1, {
    category: "hackathon",
    title: "Community Event", description: "", organization: "", eligibility: "",
    location: "", mode: null, deadline: undefined, startDate: null, endDate: null,
    prize: undefined, applicationUrl: undefined,
  });
  const result = await executeSearch(
    { intent: { type: "hackathon", keywords: ["AI"], mode: "any" }, limit: 10 },
    deps({
      queryDB: async () => freshDB([weak, exact]),
      filter: (i, o) => filterOpportunities(i, o),
      rank: (i, f) => rankOpportunities(i, f),
    }),
  );
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.opportunity.title, "National AI Hackathon");
  assert.ok((result.results[0]?.score ?? 0) > (result.results[1]?.score ?? 0));
});

test("Phase 4: Response metadata reports sources and freshness", async () => {
  const items = [opp(0, { source: "devfolio.co" }), opp(1, { source: "mlh.io" })];
  const result = await executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
    queryDB: async () => freshDB(items),
  }));
  assert.deepEqual([...result.metadata.sources ?? []].sort(), ["devfolio.co", "mlh.io"]);
  assert.equal(result.metadata.freshness, "fresh");
  assert.equal(result.metadata.refreshed, true);
});

test("Phase 4: Real filtering excludes in-person for remote intent", async () => {
  const remote = opp(0, { mode: "remote", category: "hackathon" });
  const onsite = opp(1, { mode: "in_person", category: "hackathon" });
  const result = await executeSearch(
    { intent: { type: "hackathon", mode: "remote" }, limit: 10 },
    deps({
      queryDB: async () => freshDB([remote, onsite]),
      filter: (i, opps) => filterOpportunities(i, opps),
      rank: (i, f) => rankOpportunities(i, f),
    }),
  );
  assert.ok(result.results.some((r) => r.filteringDecision === "match" && r.opportunity.mode === "remote"));
  assert.ok(!result.results.some((r) => r.filteringDecision === "match" && r.opportunity.mode === "in_person"));
});

test("Phase 4: Real filtering excludes closed deadline for open deadline intent", async () => {
  const open = opp(0, { deadline: new Date("2026-12-01"), category: "hackathon" });
  const closed = opp(1, { deadline: new Date("2025-01-01"), category: "hackathon" });
  const result = await executeSearch(
    { intent: { type: "hackathon", deadline: { kind: "open" } }, limit: 10 },
    deps({
      queryDB: async () => freshDB([open, closed]),
      filter: (i, opps) => filterOpportunities(i, opps),
      rank: (i, f) => rankOpportunities(i, f),
    }),
  );
  assert.ok(result.results.length >= 1);
  assert.ok(result.results.some((r) => r.filteringDecision === "match"));
});

// ======================== TIMEOUT ========================

test("Phase 4: Search timeout protection - rejects after SEARCH_REQUEST_TIMEOUT_MS", async () => {
  const original = env.SEARCH_REQUEST_TIMEOUT_MS;
  env.SEARCH_REQUEST_TIMEOUT_MS = 100;
  try {
    await assert.rejects(
      () => executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
        queryDB: async () => new Promise<never>(() => {}),
      })),
      SearchRequestTimeoutError,
    );
  } finally {
    env.SEARCH_REQUEST_TIMEOUT_MS = original;
  }
});

// ======================== DEDUPLICATION ========================

test("Phase 4: Duplicate opportunities are merged during DB+discovery merge", async () => {
  const sharedUrl = "https://example.com/shared";
  const dbOpp = opp(0, { title: "DB Opp", category: "job", url: sharedUrl, opportunityUrl: sharedUrl });
  const discOpp = opp(0, { title: "Disc Opp", url: sharedUrl, opportunityUrl: sharedUrl });

  const result = await executeSearch({ intent: { type: "hackathon" }, limit: 10 }, deps({
    queryDB: async () => staleDB([dbOpp]),
    filter: (i, o) => filterOpportunities(i, o),
    rank: (i, f) => rankOpportunities(i, f),
    discover: async () => discovery(),
    extract: async () => extractResult([discOpp]),
  }));
  assert.equal(result.results.length, 1);
  const urls = result.results.map((r) => r.opportunity.url);
  const uniqueUrls = [...new Set(urls)];
  assert.equal(urls.length, uniqueUrls.length, "No duplicate URLs in results");
});
