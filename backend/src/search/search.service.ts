import { z } from "zod";
import { discoverCandidates } from "../discovery/discovery.service.js";
import { extractOpportunities } from "../extraction/extraction.service.js";
import { filterOpportunities } from "../filtering/filtering.service.js";
import { rankOpportunities } from "../ranking/ranking.service.js";
import { parseSearchIntent } from "./search-intent.service.js";
import type { SearchDependencies, SearchResponse } from "./search.types.js";
import { env } from "../config/env.js";
import type { SearchIntent } from "./search-intent.schema.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { OpportunityQueryResult } from "../modules/opportunities/opportunity.repository.js";

const searchRequestSchema = z.object({
  intent: z.unknown(),
  limit: z.number().int().min(1).max(50).default(20),
});

const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export class SearchRequestValidationError extends Error {
  public constructor() {
    super("Invalid search request");
    this.name = "SearchRequestValidationError";
  }
}

export class SearchRequestTimeoutError extends Error {}

const productionDependencies: SearchDependencies = {
  discover: (intent) => discoverCandidates(intent),
  extract: (candidates) => extractOpportunities({ candidates }),
  filter: (intent, opportunities, referenceDate) => filterOpportunities(intent, opportunities, { now: referenceDate }),
  rank: (intent, filtered, referenceDate) => rankOpportunities(intent, filtered, { referenceDate }),
  queryDB: (intent, limit) => queryOpportunitiesByIntent(intent, limit),
};

export async function executeSearch(
  input: unknown,
  dependencies: Partial<SearchDependencies> = {},
): Promise<SearchResponse> {
  return withTimeout(executeSearchInternal(input, dependencies), env.SEARCH_REQUEST_TIMEOUT_MS, "Search request timed out");
}

async function queryOpportunitiesByIntent(intent: SearchIntent, limit: number) {
  const { findOpportunitiesByIntent } = await import("../modules/opportunities/opportunity.repository.js");
  return findOpportunitiesByIntent(intent, limit);
}

function isFresh(result: OpportunityQueryResult, referenceDate: Date): boolean {
  return result.totalMatching > 0
    && result.freshestScrapedAt !== null
    && referenceDate.getTime() - result.freshestScrapedAt.getTime() < STALENESS_THRESHOLD_MS;
}

function emptyExtractionMetadata(): Partial<SearchResponse["metadata"]> {
  return {
    queriesExecuted: 0,
    candidatesDiscovered: 0,
    candidatesProcessed: 0,
    extracted: 0,
    extractionFailed: 0,
  };
}

async function executeSearchInternal(
  input: unknown,
  dependencies: Partial<SearchDependencies>,
): Promise<SearchResponse> {
  const request = searchRequestSchema.safeParse(input);
  if (!request.success) throw new SearchRequestValidationError();
  const intent = parseSearchIntent(request.data.intent);
  const referenceDate = new Date();
  const active = { ...productionDependencies, ...dependencies };
  const limit = request.data.limit;
  const queryLimit = Math.max(limit * 3, 60);

  const dbResult = await active.queryDB(intent, queryLimit);
  if (isFresh(dbResult, referenceDate)) {
    return buildSearchResponse(intent, dbResult.opportunities, active, referenceDate, limit, emptyExtractionMetadata(), {
      freshness: "fresh",
      refreshed: true,
    });
  }

  const relaxedIntent: SearchIntent = { ...intent, keywords: [], skills: [], location: undefined, mode: "any" };
  const relaxedResult = await active.queryDB(relaxedIntent, queryLimit);
  if (isFresh(relaxedResult, referenceDate)) {
    return buildSearchResponse(intent, relaxedResult.opportunities, active, referenceDate, limit, emptyExtractionMetadata(), {
      freshness: "fresh",
      refreshed: true,
    });
  }

  const cachedOpportunities = mergeOpportunities(dbResult.opportunities, relaxedResult.opportunities);

  if (cachedOpportunities.length > 0) {
    const cachedResponse = buildSearchResponse(intent, cachedOpportunities, active, referenceDate, limit, emptyExtractionMetadata(), {
      freshness: "stale",
      refreshed: false,
    });
    if (cachedResponse.results.length > 0) {
      triggerBackgroundRefresh(intent, active);
      return cachedResponse;
    }
  }

  let discovered: NormalizedOpportunity[] = [];
  let discoveryMetadata = {
    queriesExecuted: 0,
    candidatesDiscovered: 0,
    candidatesProcessed: 0,
    extracted: 0,
    extractionFailed: 0,
  };
  try {
    const discovery = await active.discover(intent);
    const extraction = await active.extract(discovery.candidates);
    discovered = extraction.results
      .filter((result) => result.status === "extracted" && result.opportunity)
      .map((result) => result.opportunity!);
    discoveryMetadata = {
      queriesExecuted: discovery.metadata.queriesExecuted,
      candidatesDiscovered: discovery.candidates.length,
      candidatesProcessed: extraction.candidatesProcessed,
      extracted: extraction.extracted,
      extractionFailed: extraction.rejected,
    };
  } catch (error: unknown) {
    if (cachedOpportunities.length > 0) {
      return buildSearchResponse(intent, cachedOpportunities, active, referenceDate, limit, emptyExtractionMetadata(), {
        freshness: "stale",
        refreshed: false,
        refreshError: "Web discovery failed; returning cached results",
      });
    }
    const reason = error instanceof Error ? error.message : "unknown discovery error";
    throw new SearchDiscoveryFailedError(`No results available and web discovery failed: ${reason}`);
  }

  const allOpportunities = mergeOpportunities(cachedOpportunities, discovered);
  return buildSearchResponse(intent, allOpportunities, active, referenceDate, limit, discoveryMetadata, {
    freshness: discovered.length > 0 ? "refreshed" : cachedOpportunities.length > 0 ? "stale" : "empty",
    refreshed: true,
  });
}

function buildSearchResponse(
  intent: SearchIntent,
  opportunities: NormalizedOpportunity[],
  active: SearchDependencies,
  referenceDate: Date,
  limit: number,
  baseMetadata: Partial<SearchResponse["metadata"]>,
  extraMetadata: Partial<SearchResponse["metadata"]> = {},
): SearchResponse {
  const filtered = active.filter(intent, opportunities, referenceDate);
  const ranked = active.rank(intent, filtered, referenceDate);
  const results = ranked.results.slice(0, limit).map((result) => ({
    opportunity: result.opportunity,
    score: result.score,
    breakdown: result.breakdown,
    reasons: result.reasons,
    uncertainties: result.uncertainties,
    filteringDecision: result.decision,
  }));

  return {
    intent,
    results,
    metadata: {
      queriesExecuted: baseMetadata.queriesExecuted ?? 0,
      candidatesDiscovered: baseMetadata.candidatesDiscovered ?? 0,
      candidatesProcessed: baseMetadata.candidatesProcessed ?? 0,
      extracted: baseMetadata.extracted ?? 0,
      extractionFailed: baseMetadata.extractionFailed ?? 0,
      matched: filtered.summary.matched,
      unknown: filtered.summary.unknown,
      rejected: filtered.summary.rejected,
      resultsReturned: results.length,
      totalInDatabase: opportunities.length,
      sources: [...new Set(results.map((result) => result.opportunity.source).filter(Boolean))],
      ...extraMetadata,
    },
  };
}

function mergeOpportunities(existing: NormalizedOpportunity[], fresh: NormalizedOpportunity[]): NormalizedOpportunity[] {
  const seen = new Set<string>();
  const merged: NormalizedOpportunity[] = [];

  for (const opp of [...fresh, ...existing]) {
    const key = opp.opportunityUrl || opp.url;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(opp);
    }
  }

  return merged;
}

const inFlightRefreshes = new Set<string>();

function backgroundRefreshKey(intent: SearchIntent): string {
  return JSON.stringify([intent.type, intent.keywords, intent.skills, intent.location, intent.mode]);
}

export function triggerBackgroundRefresh(intent: SearchIntent, dependencies: SearchDependencies): void {
  const key = backgroundRefreshKey(intent);
  if (inFlightRefreshes.has(key)) return;

  inFlightRefreshes.add(key);
  void (async () => {
    try {
      const discovery = await dependencies.discover(intent);
      if (discovery.candidates.length > 0) {
        await dependencies.extract(discovery.candidates.slice(0, env.MAX_EXTRACTION_CANDIDATES));
      }
    } catch {
      // Background refresh failures must never affect user search.
    } finally {
      inFlightRefreshes.delete(key);
    }
  })();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SearchRequestTimeoutError(message)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

export class SearchDiscoveryFailedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SearchDiscoveryFailedError";
  }
}
