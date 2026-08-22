import { z } from "zod";

import { discoverCandidates } from "../discovery/discovery.service.js";
import { extractOpportunities } from "../extraction/extraction.service.js";
import { filterOpportunities } from "../filtering/filtering.service.js";
import { rankOpportunities } from "../ranking/ranking.service.js";
import { env } from "../config/env.js";
import { parseSearchIntent } from "./search-intent.service.js";
import { executeSearch, productionDependencies } from "./search.service.js";
import type { SearchDependencies } from "./search.types.js";
import type { SearchIntent } from "./search-intent.schema.js";
import { OPPORTUNITY_TYPES } from "./search-intent.types.js";

const locationText = z.string().trim().min(1).max(80);
const skillList = z.array(z.string().trim().min(1).max(40)).max(10);

export const discoverySearchRequestSchema = z.object({
  query: z.string().trim().max(200).default(""),
  category: z.enum(OPPORTUNITY_TYPES).default("other"),
  location: locationText.optional(),
  deadlineWithinDays: z.number().int().positive().max(365).optional(),
  mode: z.enum(["remote", "in_person", "hybrid", "any"]).default("any"),
  skills: skillList.default([]),
  fresh: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(24),
});

export type DiscoverySearchRequest = z.infer<typeof discoverySearchRequestSchema>;

export class DiscoverySearchValidationError extends Error {
  public constructor(public readonly issues: unknown) {
    super("Invalid discovery search request");
    this.name = "DiscoverySearchValidationError";
  }
}

/** Free-text query becomes OR-combined keywords so DB regex and SERP queries keep recall. */
export function extractQueryKeywords(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s+#.-]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  )].slice(0, 6);
}

const STOP_WORDS = new Set([
  "the", "a", "an", "for", "and", "or", "in", "on", "at", "of", "to", "with",
  "me", "my", "our", "this", "that", "is", "are", "any", "all", "new", "near", "from",
]);

export type DiscoverySearchRequestInput = z.input<typeof discoverySearchRequestSchema>;

/**
 * Maps the public discovery request onto the internal search intent.
 * "Remote" as a location is normalized into a participation-mode filter.
 */
export function discoveryRequestToIntent(request: DiscoverySearchRequestInput): SearchIntent {
  const category = request.category ?? "other";
  const query = request.query ?? "";
  const mode = request.mode ?? "any";
  const skills = request.skills ?? [];

  const wantsRemoteMode = mode === "remote"
    || (typeof request.location === "string" && /^remote$/i.test(request.location));
  const locationCountry = typeof request.location === "string"
    && request.location.trim() !== ""
    && !/^remote$/i.test(request.location)
    ? request.location
    : undefined;

  return {
    type: category,
    keywords: extractQueryKeywords(query),
    ...(locationCountry ? { location: { country: locationCountry } } : {}),
    mode: wantsRemoteMode ? "remote" : mode,
    ...(request.deadlineWithinDays ? { deadline: { kind: "within_days", days: request.deadlineWithinDays } } : {}),
    skills,
  };
}

const activeDependencies: SearchDependencies = {
  ...productionDependencies,
};

export interface DiscoverySearchMeta {
  query: string;
  requestedFresh: boolean;
  freshness: "fresh" | "stale" | "refreshed" | "empty";
  resultCount: number;
  newRecords: number;
  updatedRecords: number;
  candidatesDiscovered: number;
  extracted: number;
  extractionFailed: number;
  sources: string[];
  webSearched: boolean;
  discoveryError?: string;
}

export interface DiscoverySearchResponse {
  success: true;
  data: Awaited<ReturnType<typeof executeSearch>>["results"];
  meta: DiscoverySearchMeta;
}

export async function executeDiscoverySearch(
  input: unknown,
  dependencies: Partial<SearchDependencies> = {},
): Promise<DiscoverySearchResponse> {
  const parsed = discoverySearchRequestSchema.safeParse(input);
  if (!parsed.success) throw new DiscoverySearchValidationError(parsed.error.flatten());
  const request = parsed.data;
  const intent = discoveryRequestToIntent(request);
  const active = { ...activeDependencies, ...dependencies };

  if (!request.fresh) {
    const response = await executeSearch({ intent, limit: request.limit }, active);
    return {
      success: true,
      data: response.results,
      meta: {
        query: request.query,
        requestedFresh: false,
        freshness: response.metadata.freshness ?? "stale",
        resultCount: response.results.length,
        newRecords: 0,
        updatedRecords: 0,
        candidatesDiscovered: response.metadata.candidatesDiscovered,
        extracted: response.metadata.extracted,
        extractionFailed: response.metadata.extractionFailed,
        sources: response.metadata.sources ?? [],
        // Honest signal: did THIS request perform a synchronous web pass?
        // (Background refreshes are async and don't count here.)
        webSearched: response.metadata.candidatesDiscovered > 0,
        ...(response.metadata.refreshError ? { discoveryError: response.metadata.refreshError } : {}),
      },
    };
  }

  // Fresh search: always attempt genuine web discovery through Bright Data,
  // merge with stored results, and report honest new/updated counts.
  let discoveredCount = 0;
  let extractedCount = 0;
  let failedCount = 0;
  let candidatesDiscovered = 0;
  let newRecords = 0;
  let updatedRecords = 0;
  let discoveryError: string | undefined;

  try {
    const discovery = await active.discover(intent);
    candidatesDiscovered = discovery.candidates.length;

    if (discovery.candidates.length > 0) {
      // Bounded batch keeps the synchronous request responsive; stored data
      // plus the merged DB pass cover the rest of the result page.
      const extraction = await active.extract(
        discovery.candidates.slice(0, env.DISCOVERY_SEARCH_EXTRACTION_LIMIT),
      );
      extractedCount = extraction.extracted;
      failedCount = extraction.rejected;
      newRecords = extraction.newRecords ?? 0;
      updatedRecords = extraction.updatedRecords ?? 0;
      discoveredCount = extraction.results.filter((item) => item.status === "extracted").length;
    }
  } catch (error: unknown) {
    discoveryError = error instanceof Error ? error.message : "web discovery failed";
  }

  if (discoveredCount === 0 && !discoveryError) {
    discoveryError = "no fresh results were extracted from the web";
  }

  const response = await executeSearch({ intent, limit: request.limit }, {
    ...active,
    // Stored data must never be lost because live discovery had a bad day;
    // the real web pass already ran above and its records are persisted.
    discover: async () => ({ queries: [], candidates: [], metadata: { queriesExecuted: 0, resultsDiscovered: 0, duplicatesRemoved: 0, candidatesReturned: 0 } }),
    extract: async () => ({
      candidatesReceived: 0,
      candidatesProcessed: 0,
      extracted: 0,
      rejected: 0,
      persisted: 0,
      duplicates: 0,
      results: [],
    }),
  });

  return {
    success: true,
    data: response.results,
    meta: {
      query: request.query,
      requestedFresh: true,
      freshness: (newRecords + updatedRecords) > 0
        ? "refreshed"
        : response.results.length > 0 ? "stale" : "empty",
      resultCount: response.results.length,
      newRecords,
      updatedRecords,
      candidatesDiscovered,
      extracted: extractedCount,
      extractionFailed: failedCount,
      sources: response.metadata.sources ?? [],
      webSearched: true,
      ...(discoveryError ? { discoveryError } : {}),
    },
  };
}
