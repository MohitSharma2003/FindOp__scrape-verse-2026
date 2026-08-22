import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { getIndexStats, type IndexStatsDependencies } from "./index.stats.service.js";

function fakeDependencies(overrides: Partial<IndexStatsDependencies> = {}): IndexStatsDependencies {
  return {
    countOpportunities: async () => 7,
    countByCategory: async () => [
      { category: "hackathon", count: 4 },
      { category: "fellowship", count: 2 },
      { category: "internship", count: 1 },
    ],
    lastUpdatedAt: async () => new Date("2026-08-22T06:30:00Z"),
    sourceStats: async () => ({ total: 6, enabled: 6, fresh: 5, failed: 1 }),
    runStats: async () => ({
      lastSuccessfulRunAt: new Date("2026-08-22T06:10:00Z"),
      runningNow: 2,
    }),
    ...overrides,
  };
}

describe("index statistics", () => {
  test("reflects the database aggregates exactly - no invented numbers", async () => {
    const stats = await getIndexStats(fakeDependencies());
    assert.equal(stats.totalOpportunities, 7);
    assert.deepEqual(stats.categories, { hackathon: 4, fellowship: 2, internship: 1 });
    assert.equal(stats.sources, 6);
    assert.equal(stats.enabledSources, 6);
    assert.equal(stats.freshSources, 5);
    assert.equal(stats.failedSources, 1);
    assert.equal(stats.lastUpdatedAt, "2026-08-22T06:30:00.000Z");
    assert.equal(stats.lastSuccessfulRunAt, "2026-08-22T06:10:00.000Z");
    assert.equal(stats.scrapesRunningNow, 2);
  });

  test("category counts always sum to the reported total", async () => {
    const stats = await getIndexStats(fakeDependencies());
    const sum = Object.values(stats.categories).reduce((a, b) => a + b, 0);
    assert.equal(sum, stats.totalOpportunities);
  });

  test("empty index reports honest zeros and nulls", async () => {
    const stats = await getIndexStats(fakeDependencies({
      countOpportunities: async () => 0,
      countByCategory: async () => [],
      lastUpdatedAt: async () => null,
      runStats: async () => ({ lastSuccessfulRunAt: null, runningNow: 0 }),
    }));
    assert.equal(stats.totalOpportunities, 0);
    assert.deepEqual(stats.categories, {});
    assert.equal(stats.lastUpdatedAt, null);
    assert.equal(stats.lastSuccessfulRunAt, null);
    assert.equal(stats.scrapesRunningNow, 0);
  });
});
