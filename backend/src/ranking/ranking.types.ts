import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { FilteringResult, FilteredOpportunity } from "../filtering/filtering.types.js";
import type { SearchIntent } from "../search/search-intent.schema.js";

export interface RankingBreakdown {
  type: number;
  keywords: number;
  location: number;
  mode: number;
  date: number;
  deadline: number;
  skills: number;
  eligibility: number;
  completeness: number;
}

export interface RankedOpportunity {
  opportunity: NormalizedOpportunity;
  decision: "match" | "unknown";
  score: number;
  breakdown: RankingBreakdown;
  reasons: string[];
  uncertainties: string[];
}

export interface RankingResult {
  results: RankedOpportunity[];
}

export interface RankingOptions {
  referenceDate?: Date;
}

export type RankingInput = FilteringResult | readonly FilteredOpportunity[];
export type RankingIntent = SearchIntent;
export type RankableFilteredOpportunity = Omit<FilteredOpportunity, "decision"> & {
  decision: "match" | "unknown";
};
