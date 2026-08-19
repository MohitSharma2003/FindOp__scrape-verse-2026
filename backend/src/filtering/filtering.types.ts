import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { SearchIntent } from "../search/search-intent.schema.js";

export type FilterDecision = "match" | "mismatch" | "unknown";

export interface FilteredOpportunity {
  opportunity: NormalizedOpportunity;
  decision: FilterDecision;
  matchedFilters: string[];
  unknownFilters: string[];
  failedFilters: string[];
}

export interface FilteringSummary {
  totalReceived: number;
  matched: number;
  unknown: number;
  rejected: number;
}

export interface FilteringResult {
  results: FilteredOpportunity[];
  summary: FilteringSummary;
}

export interface FilteringOptions {
  now?: Date;
}

export type FilteringIntent = SearchIntent;
