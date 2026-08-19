import { z } from "zod";
import { discoverCandidates } from "../discovery/discovery.service.js";
import { extractOpportunities } from "../extraction/extraction.service.js";
import { filterOpportunities } from "../filtering/filtering.service.js";
import { rankOpportunities } from "../ranking/ranking.service.js";
import { parseSearchIntent } from "./search-intent.service.js";
import type { SearchDependencies, SearchResponse } from "./search.types.js";
import { env } from "../config/env.js";

const searchRequestSchema = z.object({
  intent: z.unknown(),
  limit: z.number().int().min(1).max(50).default(20),
});

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
};

export async function executeSearch(
  input: unknown,
  dependencies: Partial<SearchDependencies> = {},
): Promise<SearchResponse> {
  return withTimeout(executeSearchInternal(input, dependencies), env.SEARCH_REQUEST_TIMEOUT_MS, "Search request timed out");
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

  const discovery = await active.discover(intent);
  const extraction = await active.extract(discovery.candidates);
  const opportunities = extraction.results
    .filter((result) => result.status === "extracted" && result.opportunity)
    .map((result) => result.opportunity!);
  const filtered = active.filter(intent, opportunities, referenceDate);
  const ranked = active.rank(intent, filtered, referenceDate);
  const results = ranked.results.slice(0, request.data.limit).map((result) => ({
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
      queriesExecuted: discovery.metadata.queriesExecuted,
      candidatesDiscovered: discovery.candidates.length,
      candidatesProcessed: extraction.candidatesProcessed,
      extracted: extraction.extracted,
      extractionFailed: extraction.rejected,
      matched: filtered.summary.matched,
      unknown: filtered.summary.unknown,
      rejected: filtered.summary.rejected,
      resultsReturned: results.length,
    },
  };
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
