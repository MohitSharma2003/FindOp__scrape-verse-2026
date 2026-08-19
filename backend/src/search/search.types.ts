import type { CandidateUrl, DiscoveryResponse } from "../discovery/discovery.types.js";
import type { ExtractionBatchResult } from "../extraction/extraction.types.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { FilteringResult } from "../filtering/filtering.types.js";
import type { RankingResult } from "../ranking/ranking.types.js";
import type { SearchIntent } from "./search-intent.schema.js";

export interface SearchRequest {
  intent: SearchIntent;
  limit: number;
}

export interface SearchMetadata {
  queriesExecuted: number;
  candidatesDiscovered: number;
  candidatesProcessed: number;
  extracted: number;
  extractionFailed: number;
  matched: number;
  unknown: number;
  rejected: number;
  resultsReturned: number;
}

export interface SearchResultItem {
  opportunity: NormalizedOpportunity;
  score: number;
  breakdown: RankingResult["results"][number]["breakdown"];
  reasons: string[];
  uncertainties: string[];
  filteringDecision: "match" | "unknown";
}

export interface SearchResponse {
  results: SearchResultItem[];
  metadata: SearchMetadata;
  intent: SearchIntent;
}

export interface SearchDependencies {
  discover(rawIntent: SearchIntent): Promise<DiscoveryResponse>;
  extract(candidates: CandidateUrl[]): Promise<ExtractionBatchResult>;
  filter(intent: SearchIntent, opportunities: NormalizedOpportunity[], referenceDate?: Date): FilteringResult;
  rank(intent: SearchIntent, filtered: FilteringResult, referenceDate?: Date): RankingResult;
}
